/**
 * File ingestion. Each uploaded file is converted ONCE into the exact form every
 * model will receive (extracted text, or a native image part), and that form is
 * stored on the task version. Models never see different renderings of a file.
 */
import path from "node:path";
import { sha256 } from "../ids";
import { ValidationError } from "../auth/context";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".xml", ".html", ".htm", ".eml", ".log", ".yaml", ".yml", ".sql", ".py", ".js", ".ts", ".tsx", ".java", ".go", ".rb", ".cs", ".php", ".css"]);
const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

export const ACCEPTED_EXTENSIONS = [...TEXT_EXTENSIONS, ".pdf", ".docx", ...Object.keys(IMAGE_TYPES)];

export type ProcessedFile = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  bytes: Buffer;
  kind: "text" | "image";
  extractedText: string | null;
  extractionMethod: string;
};

export async function processUpload(filename: string, declaredType: string, bytes: Buffer): Promise<ProcessedFile> {
  const name = path.basename(filename).replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "file";
  if (bytes.length === 0) throw new ValidationError(`"${name}" is empty.`);
  if (bytes.length > MAX_FILE_BYTES) throw new ValidationError(`"${name}" is larger than 20 MB.`);
  const ext = path.extname(name).toLowerCase();
  const base = { filename: name, sizeBytes: bytes.length, sha256: sha256(bytes), bytes };

  if (IMAGE_TYPES[ext]) {
    return { ...base, mimeType: IMAGE_TYPES[ext], kind: "image", extractedText: null, extractionMethod: "native-image" };
  }
  if (TEXT_EXTENSIONS.has(ext) || declaredType.startsWith("text/")) {
    const text = bytes.toString("utf8");
    if (text.includes("\u0000")) throw new ValidationError(`"${name}" does not look like a text file.`);
    return { ...base, mimeType: declaredType || "text/plain", kind: "text", extractedText: text, extractionMethod: "utf8" };
  }
  if (ext === ".pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text, totalPages } = await extractText(pdf, { mergePages: false });
      const pages = (text as string[]).map((t, i) => `[Page ${i + 1}]\n${t.trim()}`).join("\n\n");
      if (!pages.replace(/\[Page \d+\]/g, "").trim()) {
        throw new ValidationError(`"${name}" has no extractable text (it may be a scanned image). Upload page images instead.`);
      }
      return { ...base, mimeType: "application/pdf", kind: "text", extractedText: pages, extractionMethod: `pdf-text (${totalPages} pages)` };
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError(`Could not read "${name}" as a PDF.`);
    }
  }
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    try {
      const { value } = await mammoth.extractRawText({ buffer: bytes });
      return {
        ...base,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        kind: "text",
        extractedText: value,
        extractionMethod: "docx-text",
      };
    } catch {
      throw new ValidationError(`Could not read "${name}" as a Word document.`);
    }
  }
  throw new ValidationError(`"${name}": unsupported file type. Supported: text/markdown/CSV/JSON/HTML/email, PDF, Word (.docx) and images (PNG, JPEG, WebP, GIF).`);
}
