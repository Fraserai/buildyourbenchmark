/**
 * Canonical payload construction.
 *
 * Layout (identical for every model):
 *   system  = the task instructions
 *   user    = input text, then each file in order as
 *             <document name="…" role="input|reference"> … </document>
 *             or, for images, a label line followed by the image itself.
 *   If a task has no inputs at all, the instructions are sent as the user message.
 *
 * The payload hash covers every byte that reaches a model (images by content hash),
 * so it proves that all models in a run received the same task.
 */
import { asc, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import { canonicalJson, sha256 } from "../ids";
import type { PayloadPart, TaskPayload } from "../providers/types";
import { objectStore } from "../storage/files";

type VersionLike = Pick<typeof s.taskVersions.$inferSelect, "instructions" | "inputText" | "maxOutputTokens">;
type FileLike = Pick<typeof s.taskFiles.$inferSelect, "filename" | "role" | "kind" | "extractedText" | "mimeType" | "sha256" | "storageKey">;

function escapeAttr(v: string) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Build the payload structure. `loadImage` is only called for image files. */
export async function composePayload(version: VersionLike, files: FileLike[], loadImage: (f: FileLike) => Promise<Buffer>): Promise<TaskPayload> {
  const parts: PayloadPart[] = [];
  let textBuffer = version.inputText.trim() ? version.inputText : "";

  const pushText = (t: string) => {
    textBuffer = textBuffer ? `${textBuffer}\n\n${t}` : t;
  };
  const flush = () => {
    if (textBuffer) parts.push({ type: "text", text: textBuffer });
    textBuffer = "";
  };

  for (const f of files) {
    if (f.kind === "text") {
      pushText(`<document name="${escapeAttr(f.filename)}" role="${f.role}">\n${f.extractedText ?? ""}\n</document>`);
    } else {
      pushText(`[Image: ${f.filename} (${f.role})]`);
      flush();
      const bytes = await loadImage(f);
      parts.push({ type: "image", mimeType: f.mimeType, dataBase64: bytes.toString("base64"), filename: f.filename, sha256: f.sha256 });
    }
  }
  flush();

  if (parts.length === 0) {
    return { system: null, user: [{ type: "text", text: version.instructions }], maxOutputTokens: version.maxOutputTokens };
  }
  return { system: version.instructions, user: parts, maxOutputTokens: version.maxOutputTokens };
}

/** Hash of the payload with images represented by their content hash. */
export function payloadHash(p: TaskPayload): string {
  return sha256(
    canonicalJson({
      system: p.system,
      maxOutputTokens: p.maxOutputTokens,
      user: p.user.map((part) => (part.type === "text" ? part : { type: "image", mimeType: part.mimeType, sha256: part.sha256, filename: part.filename })),
    }),
  );
}

export async function buildPayloadForVersion(db: DB, taskVersionId: string): Promise<{ payload: TaskPayload; hash: string }> {
  const version = db.select().from(s.taskVersions).where(eq(s.taskVersions.id, taskVersionId)).get();
  if (!version) throw new Error(`task version ${taskVersionId} not found`);
  const files = db.select().from(s.taskFiles).where(eq(s.taskFiles.taskVersionId, taskVersionId)).orderBy(asc(s.taskFiles.position)).all();
  const payload = await composePayload(version, files, async (f) => {
    const bytes = await objectStore.get(f.storageKey);
    if (sha256(bytes) !== f.sha256) throw new Error(`stored file ${f.filename} failed its integrity check`);
    return bytes;
  });
  return { payload, hash: payloadHash(payload) };
}

/** Human-readable rendering of the payload (images as placeholders) for the "what every model received" view. */
export function describePayload(p: TaskPayload): { system: string | null; user: string } {
  return {
    system: p.system,
    user: p.user.map((part) => (part.type === "text" ? part.text : `⟨image ${part.filename} · ${part.mimeType}⟩`)).join("\n\n"),
  };
}
