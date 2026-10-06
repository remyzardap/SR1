/**
 * research function (POST /api/fn/research), the Deep Research path of the chat.
 *
 * Request body, from client/src/pages/Chat.tsx with mode "deep":
 *   { messages: [{ role, content }], files?: [{ filename, mediaType?, url }],
 *     attachments?: Attachment[] }
 * `files` takes http(s) URLs, which are fetched through the SSRF guard, and
 * data: URLs, which are read straight from the body. `attachments` is the
 * shared attachment shape of server/lib/attachments.ts (device or Drive).
 *
 * The SSE stream carries exactly the events that loop reads:
 *   token      JSON string delta
 *   agent      true, the answer is agentic
 *   model      { step, label }
 *   tool_start { tool, input }
 *   skill      { id, name }
 *   notice     { message }
 *   sources    [{ id, url, title, ... }]
 *   usage      { inputTokens, outputTokens, totalTokens }
 *   done       final model label
 *   error      JSON string message
 *
 * Research runs on the existing Kemma pipeline (planner, web tools, citation
 * verification).
 */

import type { Request, Response } from "express";
import { kemmaExecute, type KemmaMessage } from "../../kemma/engine";
import { getQuotaSummary, checkQuota } from "../../core/quotaCheck";
import {
  attachmentLimits,
  attachmentsToContext,
  hasDriveAttachment,
  isDataUrl,
  parseAttachment,
  parseAttachments,
  requireDriveConnection,
  withContextOnLastUserMessage,
  type Attachment,
} from "../../lib/attachments";
import { bytesToText } from "../../lib/fnDocument";
import { MAX_REFERENCE_FILES, fetchCapped } from "../../lib/fnFetch";
import { FnError } from "../../lib/fnErrors";
import { flag } from "../../core/flags";
import { asRecord, sendError, startHeartbeat, startSse, writeSseEvent } from "./shared";

export const MAX_RESEARCH_MESSAGES = 200;
export const MAX_RESEARCH_CHARS = 200000;
export const MAX_FILE_TEXT_CHARS = 20000;
export const MAX_TOTAL_FILE_CHARS = 60000;
const TOKEN_CHUNK_CHARS = 800;

interface IncomingFile {
  filename: string;
  mediaType?: string;
  url: string;
}

export async function handleResearch(userId: number, req: Request, res: Response): Promise<void> {
  const body = asRecord(req.body);
  const messages = readMessages(body);
  const files = readFiles(body);
  const attachments = readAttachments(body, files);
  if (hasDriveAttachment(attachments)) await requireDriveConnection(userId);

  const msgCheck = await checkQuota(userId, "message");
  if (!msgCheck.allowed) {
    sendError(res, 429, msgCheck.reason ?? "Daily message limit reached");
    return;
  }

  const quota = await getQuotaSummary(userId);
  const toolBudget = Number(process.env.KEMMA_TOOL_BUDGET) || 60;

  startSse(res);
  const stopHeartbeat = startHeartbeat(res);
  let aborted = false;
  // Node destroys the request stream once its body has been read, which happens while
  // this response is still open: a req "close" after a complete body says nothing about
  // the client. A response closed before our own res.end() does, and so does a request
  // that gave up before finishing the upload.
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
  const send = (event: string, data: unknown) => {
    if (!aborted && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const notice = (message: string) => send("notice", { message });
    const hosted = files.filter((file) => !isDataUrl(file.url));

    const fetched = await referenceContext(hosted, userId, notice);
    const read = await attachmentsToContext(userId, attachments, {
      maxTotalChars: Math.max(0, MAX_TOTAL_FILE_CHARS - fetched.length),
      limits: attachmentLimits(),
    });
    for (const message of read.notices) notice(message);
    const context = [fetched, read.text].filter(Boolean).join("\n\n");
    const prepared = context ? withReferenceContext(messages, context) : messages;

    // With KEMMA_MAX_SUBAGENTS above 1 the engine plans and fans out on its own;
    // that path returns no deltas, so the finished answer is streamed in pieces.
    const fanOut = Number(process.env.KEMMA_MAX_SUBAGENTS ?? "1") > 1;
    let streamedChars = 0;

    const streamToolTurns = flag("STREAM_TOOL_TURNS");
    const runId = (typeof body?.runId === "string" && body.runId) ? body.runId : crypto.randomUUID();
    if (streamToolTurns) {
      send("meta", { protocol: 2, runId });
    }

    const output = await kemmaExecute({
      userId,
      messages: prepared,
      tier: quota.tier,
      isThinking: false,
      allowedTools: ["web_search", "browse", "run_code"],
      toolBudget,
      onStream: fanOut
        ? undefined
        : (chunk) => {
            streamedChars += chunk.length;
            send("token", chunk);
          },
      onReasoning: (delta) => {
        const isReasoningOff = (process.env.KEMMA_REASONING_EFFORT ?? "").trim().toLowerCase() === "off";
        if (streamToolTurns && !isReasoningOff) {
          send("thinking", delta);
        }
      },
      onSegmentEnd: (kind) => {
        if (streamToolTurns) {
          send("segment", { kind });
        }
      },
      onToolStart: (tool, input, callId) => {
        if (streamToolTurns && callId) {
          send("tool_start", { id: callId, tool, input });
        } else {
          send("tool_start", { tool, input });
        }
        send("agent", true);
      },
      onToolEnd: (tool, result, durationMs, callId) => {
        if (streamToolTurns) {
          send("tool_end", { ...(callId ? { id: callId } : {}), tool, output: result, durationMs });
        }
      },
      onStepStart: (step, model) => send("model", { step, label: model }),
      onNotice: (message) => send("notice", { message }),
      onQuotaWarn: (message) => send("notice", { message }),
      onSkillUsed: (skill) => send("skill", skill),
    });

    // The engine reports a refused or failed run as an answer with no model and
    // no step behind it. That is an error frame, not tokens.
    if (output.modelsUsed.length === 0 && output.stepsUsed === 0) {
      console.error(`[fn] research produced no answer for user ${userId}`);
      send("error", "Deep research could not be completed. Please try again.");
      return;
    }

    const answer = output.response ?? "";
    if (fanOut || streamedChars === 0) {
      for (let i = 0; i < answer.length; i += TOKEN_CHUNK_CHARS) send("token", answer.slice(i, i + TOKEN_CHUNK_CHARS));
    }
    if (!aborted && output.sources.length > 0) send("sources", output.sources);
    send("usage", {
      inputTokens: output.tokensUsed.input,
      outputTokens: output.tokensUsed.output,
      totalTokens: output.tokensUsed.total,
    });
    send("done", output.modelsUsed[output.modelsUsed.length - 1] ?? "Sutaeru");
  } catch (err) {
    const message = err instanceof FnError ? err.message : "Deep research could not be completed. Please try again.";
    if (res.writableEnded || aborted) return;
    if (!res.headersSent) {
      sendError(res, err instanceof FnError ? err.status : 500, message);
      return;
    }
    writeSseEvent(res, "error", message);
  } finally {
    stopHeartbeat();
    if (!aborted && !res.writableEnded) res.end();
  }
}

/** Validates the conversation the client sends. */
export function readMessages(body: Record<string, unknown>): KemmaMessage[] {
  const raw = body.messages;
  if (!Array.isArray(raw) || raw.length === 0) throw new FnError(400, "messages required");
  if (raw.length > MAX_RESEARCH_MESSAGES) throw new FnError(400, "This conversation is too long to research.");

  let total = 0;
  const out: KemmaMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") throw new FnError(400, "A message is not valid.");
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant" && role !== "system") throw new FnError(400, "A message role is not valid.");
    if (typeof content !== "string") throw new FnError(400, "A message has no text.");
    total += content.length;
    if (total > MAX_RESEARCH_CHARS) throw new FnError(400, "This conversation is too long to research.");
    out.push({ role, content });
  }
  if (!out.some((m) => m.role === "user")) throw new FnError(400, "Ask a question to research.");
  return out;
}

/**
 * Validates the file list: at most five entries, each an http(s) url or an
 * inline base64 data url. The hosted entries go through the SSRF-guarded
 * reader; the inline ones are treated as device attachments.
 */
export function readFiles(body: Record<string, unknown>): IncomingFile[] {
  const raw = body.files;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new FnError(400, "files is not valid.");
  if (raw.length > MAX_REFERENCE_FILES) throw new FnError(400, `Up to ${MAX_REFERENCE_FILES} files can be researched at once.`);

  return raw.map((item) => {
    if (!item || typeof item !== "object") throw new FnError(400, "A file reference is not valid.");
    const file = item as { filename?: unknown; mediaType?: unknown; url?: unknown };
    if (typeof file.url !== "string") throw new FnError(400, "A file reference is not a valid URL.");
    // A hosted url is shortened for safety; an inline one is bounded by the
    // attachment size ceiling instead, so slicing it would only corrupt it.
    const inline = isDataUrl(file.url);
    const url = inline ? file.url.trim() : file.url.trim().slice(0, 2000);
    if (!inline) {
      const protocol = /^([a-zA-Z]+):/.exec(url)?.[1]?.toLowerCase();
      if (protocol !== "http" && protocol !== "https") throw new FnError(400, "File references must be http or https URLs.");
    }
    return {
      filename: typeof file.filename === "string" && file.filename.trim() ? file.filename.trim().slice(0, 255) : "reference",
      mediaType: typeof file.mediaType === "string" ? file.mediaType.slice(0, 100) : undefined,
      url,
    };
  });
}

/**
 * The attachment list of a research request: the shared `attachments` shape,
 * plus the `files` entries the browser sent as inline data URLs. All of them
 * share the five-file ceiling with the hosted references.
 */
export function readAttachments(body: Record<string, unknown>, files: IncomingFile[]): Attachment[] {
  const inline = files.filter((file) => isDataUrl(file.url));
  const hosted = files.length - inline.length;
  const attached = [
    ...inline.map((file) =>
      parseAttachment({
        source: "device",
        filename: file.filename,
        ...(file.mediaType ? { mediaType: file.mediaType } : {}),
        dataUrl: file.url,
      })
    ),
    ...parseAttachments(body.attachments),
  ];
  if (hosted + attached.length > MAX_REFERENCE_FILES) {
    throw new FnError(400, `Up to ${MAX_REFERENCE_FILES} files can be researched at once.`);
  }
  return attached;
}

/**
 * Reads every reference file into one context block. A file that cannot be
 * fetched or parsed is reported as a notice and skipped: the research still
 * runs on the question.
 */
export async function referenceContext(
  files: IncomingFile[],
  userId: number,
  notice: (message: string) => void
): Promise<string> {
  if (files.length === 0) return "";

  const blocks: string[] = [];
  let used = 0;
  for (const file of files) {
    if (used >= MAX_TOTAL_FILE_CHARS) {
      notice(`Skipped ${file.filename}: the reference budget is full.`);
      continue;
    }
    try {
      const fetched = await fetchCapped(file.url);
      const mediaType = file.mediaType || fetched.contentType;
      const text = await bytesToText({ filename: file.filename, mediaType }, fetched.buffer, userId);
      const slice = text.slice(0, Math.min(MAX_FILE_TEXT_CHARS, MAX_TOTAL_FILE_CHARS - used));
      if (!slice.trim()) {
        notice(`Skipped ${file.filename}: no readable text.`);
        continue;
      }
      used += slice.length;
      blocks.push(`File: ${file.filename}\n${slice}`);
    } catch (err) {
      notice(`Skipped ${file.filename}: ${err instanceof FnError ? err.message : "it could not be read."}`);
    }
  }

  if (blocks.length === 0) return "";
  return `REFERENCE FILES PROVIDED BY THE USER, use them as sources:\n\n${blocks.join("\n\n---\n\n")}`;
}

/** Attaches the reference block to the last user message. */
export function withReferenceContext(messages: KemmaMessage[], context: string): KemmaMessage[] {
  return withContextOnLastUserMessage(messages, context);
}
