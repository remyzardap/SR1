/**
 * Document text extraction for the document-brief function.
 *
 * BriefDialog.tsx sends either plain text (for .txt and .md) or a base64 data
 * URL plus its media type (for .pdf and .docx). PDFs go through the existing
 * vision slot in the Kemma engine; DOCX is unzipped with the same approach as
 * the Documents parse endpoint. No new providers are involved.
 */

import { kemmaDocumentScan } from "../kemma/engine";
import { getQuotaSummary } from "../core/quotaCheck";
import { FnError } from "./fnErrors";

export interface DocumentPayload {
  filename: string;
  text?: string;
  file?: string;
  mediaType?: string;
}

/**
 * Decoded upload ceiling. BriefDialog.tsx offers 15 MB, but the server parses a
 * JSON body up to 10 MB and base64 inflates by a third, so 7 MB is what can
 * actually arrive here.
 */
export const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;

const PDF_EXTRACT_PROMPT =
  "Extract all text from this document in reading order. Keep headings, numbers, dates and table rows exactly as written. Output plain text only, with no commentary.";

/** Decodes `data:<mime>;base64,<payload>` or a bare base64 string. */
export function splitDataUrl(dataUrl: string, declaredType?: string): { mediaType: string; base64: string } {
  const match = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([\s\S]*)$/i.exec(dataUrl);
  if (match) return { mediaType: match[1].toLowerCase(), base64: match[2].replace(/\s/g, "") };
  return { mediaType: (declaredType ?? "").toLowerCase(), base64: dataUrl.replace(/\s/g, "") };
}

function kindOf(payload: { filename: string; mediaType?: string }, mediaType: string): "pdf" | "docx" | "text" | "other" {
  const name = payload.filename.toLowerCase();
  const type = mediaType || payload.mediaType || "";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.includes("wordprocessingml") || name.endsWith(".docx")) return "docx";
  if (type.startsWith("text/") || /\.(txt|md|markdown|csv)$/.test(name)) return "text";
  return "other";
}

/** Pulls the readable text out of the payload, with a byte and character guard. */
export async function documentText(payload: DocumentPayload, userId: number): Promise<{ text: string; chars: number }> {
  if (payload.text && payload.text.trim()) {
    const text = payload.text.trim();
    return { text, chars: text.length };
  }
  if (!payload.file) throw new FnError(400, "A document is required.");

  const { mediaType, base64 } = splitDataUrl(payload.file, payload.mediaType);
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new FnError(413, "Uploaded documents must stay under 7 MB.");
  }
  const text = await bytesToText({ filename: payload.filename, mediaType: mediaType || payload.mediaType || "" }, buffer, userId);
  return { text, chars: text.length };
}

/**
 * Reads the text out of already downloaded bytes for a named file. Size limits
 * belong to the caller: an upload through JSON is smaller than a reference the
 * server fetches itself.
 */
export async function bytesToText(
  file: { filename: string; mediaType: string },
  buffer: Buffer,
  userId: number
): Promise<string> {
  if (buffer.byteLength === 0) throw new FnError(400, "That file is empty.");
  const kind = kindOf(file, file.mediaType);
  if (kind === "other") throw new FnError(415, "Only PDF, Word, Markdown and text files can be read.");
  if (kind === "pdf") return extractPdf(buffer, userId);
  return extractDocx(buffer, kind === "docx");
}

async function extractPdf(buffer: Buffer, userId: number): Promise<string> {
  const quota = await getQuotaSummary(userId);
  const scan = await kemmaDocumentScan({
    userId,
    tier: quota.tier,
    imageData: buffer.toString("base64"),
    mimeType: "application/pdf",
    prompt: PDF_EXTRACT_PROMPT,
  });
  const text = (scan.text ?? "").trim();
  if (!text) throw new FnError(422, "No readable text was found in that PDF.");
  return text;
}

async function extractDocx(buffer: Buffer, isDocx: boolean): Promise<string> {
  if (!isDocx) return buffer.toString("utf-8").trim();
  let text: string;
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const entry = zip.file("word/document.xml");
    if (!entry) throw new FnError(422, "No readable text was found in that document.");
    text = await entry.async("string");
  } catch (err) {
    if (err instanceof FnError) throw err;
    throw new FnError(503, "Word documents cannot be read on this server.");
  }
  return text
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
