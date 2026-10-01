/**
 * document-brief function (POST /api/fn/document-brief).
 *
 * Request body, from client/src/components/BriefDialog.tsx:
 *   { filename: string, text?: string, file?: string, mediaType?: string }
 * `text` carries .txt and .md uploads; `file` is a base64 data URL with
 * `mediaType` for .pdf and .docx uploads.
 *
 * The response is a server-sent-event stream using the event names
 * kemmaCloud.ts dispatches on: token, done, error.
 */

import type { Request, Response } from "express";
import { LlmUnavailableError, stream, type ChatMessage } from "../../lib/fnLlm";
import { documentText, type DocumentPayload } from "../../lib/fnDocument";
import { FnError } from "../../lib/fnErrors";
import { asRecord, optionalText, requireText, startHeartbeat, startSse, writeSseEvent } from "./shared";

/** Characters of document text handed to the model in one brief. */
export const MAX_BRIEF_DOC_CHARS = 120000;
/**
 * Ceiling on the base64 upload string. The server parses JSON bodies up to
 * 10 MB, so this keeps the rejection inside this function instead of letting
 * the body parser answer with its own error. It is about 7 MB of document.
 */
export const MAX_BRIEF_FILE_CHARS = 9_500_000;
const MAX_BRIEF_OUTPUT_TOKENS = 3000;

const BRIEF_SYSTEM_PROMPT = `You are an analyst producing a brief of one document for a busy reader.
Write markdown with these sections, in this order:
## Overview
Two or three sentences on what the document is and what it argues.
## Key figures
A bullet list of the concrete numbers, dates and names the document states, each with the exact quote it comes from in quotation marks.
## Timeline
The sequence of events or steps the document describes, with dates where given.
## Section takeaways
One short line per major section of the document.
## Watch out
Anything unclear, undated, unexplained or internally inconsistent.
Use only what the document says. Quote exactly. Say "not stated in the document" rather than guessing.`;

export async function handleDocumentBrief(userId: number, req: Request, res: Response): Promise<void> {
  const payload = readPayload(req.body);

  let source: { text: string; chars: number };
  try {
    source = await documentText(payload, userId);
  } catch (err) {
    if (err instanceof FnError) throw err;
    if (err instanceof LlmUnavailableError) throw new FnError(503, "Document briefs are not configured yet.");
    throw new FnError(400, "The document could not be read.");
  }

  if (!source.text.trim()) throw new FnError(400, "That document has no readable text.");

  const messages: ChatMessage[] = [
    { role: "system", content: BRIEF_SYSTEM_PROMPT },
    { role: "user", content: `Filename: ${payload.filename}\n\nDocument:\n${source.text.slice(0, MAX_BRIEF_DOC_CHARS)}` },
  ];

  startSse(res);
  const stopHeartbeat = startHeartbeat(res);
  // The dialog can be closed mid-read; writes after that are dropped. Node destroys the
  // request stream as soon as the body has been read, while this response is still open,
  // so a req "close" after a full body is not the disconnect: the response is.
  let aborted = false;
  const clientGone = () => {
    aborted = true;
    stopHeartbeat();
  };
  req.on("close", () => {
    if (!req.readableEnded) clientGone();
  });
  res.on("close", () => {
    if (!res.writableEnded) clientGone();
  });
  const send = (event: "token" | "done" | "error", data: unknown) => {
    if (!aborted && !res.writableEnded) writeSseEvent(res, event, data);
  };

  try {
    const result = await stream(messages, { userId, slot: "longDoc", purpose: "document_brief", maxTokens: MAX_BRIEF_OUTPUT_TOKENS }, (token) =>
      send("token", token)
    );
    send("done", { model: result.model, filename: payload.filename, chars: source.chars });
  } catch (err) {
    send("error", {
      message: err instanceof LlmUnavailableError ? "Document briefs are not configured yet." : "The brief could not be completed. Please try again.",
      retryable: !(err instanceof LlmUnavailableError),
    });
  } finally {
    stopHeartbeat();
    if (!res.writableEnded) res.end();
  }
}

/** Validates the shape BriefDialog.tsx sends. */
export function readPayload(body: unknown): DocumentPayload {
  const obj = asRecord(body);
  const filename = requireText(obj, "filename", 255);
  const text = optionalText(obj, "text", MAX_BRIEF_DOC_CHARS);
  const mediaType = optionalText(obj, "mediaType", 100);
  const rawFile = obj.file;

  if (typeof rawFile !== "string" && rawFile !== undefined && rawFile !== null) {
    throw new FnError(400, "File is not valid.");
  }
  const file = rawFile ? String(rawFile) : undefined;

  if (!text && !file) throw new FnError(400, "A document is required.");
  if (file && file.length > MAX_BRIEF_FILE_CHARS) {
    throw new FnError(413, "Uploaded documents must stay under 7 MB.");
  }

  return { filename, text, file, mediaType };
}
