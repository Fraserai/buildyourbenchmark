import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/next";
import { getTaskFile } from "@/server/tasks/service";
import { NotFoundError } from "@/server/auth/context";
import { verifySignedPath } from "@/server/security/crypto";
import { objectStore } from "@/server/storage/files";
import { audit } from "@/server/audit";

/** Private task files: requires a valid short-lived signature AND a session in the owning organization. */
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const url = new URL(req.url);
  if (!verifySignedPath(`/api/files/${fileId}`, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return NextResponse.json({ error: "link expired" }, { status: 403 });
  }
  const session = await getSession();
  if (!session?.ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const file = getTaskFile(session.ctx, fileId);
    const bytes = await objectStore.get(file.storageKey);
    const inline = url.searchParams.get("inline") === "1" && file.kind === "image";
    if (!inline) audit(session.ctx, "file.downloaded", { type: "task_file", id: fileId });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": file.mimeType,
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${file.filename.replace(/"/g, "")}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "not found" }, { status: 404 });
    throw e;
  }
}
