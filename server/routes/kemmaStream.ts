import type { Request, Response } from "express";
import { kemmaExecute, type KemmaMessage } from "../kemma/engine";
import { describePhase, describeToolEnd, describeToolStart, type ActivityEvent } from "../kemma/activity";
import { getQuotaSummary, checkQuota } from "../core/quotaCheck";
import { getChatSessionSettings, addChatMessage, ensureChatSession } from "../db";
import { resolveSettings, type ThreadSettings, type MessageSettings } from "../kemma/settings";
import {
  attachmentNote,
  attachmentsToContext,
  hasDriveAttachment,
  parseAttachments,
  requireDriveConnection,
  withContextOnLastUserMessage,
  type Attachment,
} from "../lib/attachments";
import { FnError } from "../lib/fnErrors";
import { flag } from "../core/flags";

function sendEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function kemmaStreamRoute(req: Request, res: Response) {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { messages, sessionId, isThinking = false, isVoice = false, settings = {}, attachments } = req.body as any;
  if (!Array.isArray(messages) || messages.length === 0) { res.status(400).json({ error: "messages required" }); return; }

  // Attachments are checked before the stream opens, so a bad list is a plain
  // `{ error }` answer. Reading them happens after: that can take seconds.
  let attached: Attachment[];
  try {
    attached = parseAttachments(attachments);
    if (hasDriveAttachment(attached)) await requireDriveConnection(user.id);
  } catch (err) {
    const failure = err instanceof FnError ? err : new FnError(400, "The attachments are not valid.");
    res.status(failure.status).json({ error: failure.message });
    return;
  }

  // The Chat page mints thread ids client-side; without a chat_sessions row, history,
  // per-thread settings and export have nothing to attach to. Create the row (title from
  // the first user message) before anything is persisted, and refuse ids that already
  // belong to another user.
  if (sessionId) {
    const firstUser = (messages as KemmaMessage[]).find((m) => m.role === "user");
    const title = (typeof firstUser?.content === "string" ? firstUser.content.trim() : "") || "New chat";
    const ownership = await ensureChatSession(sessionId, user.id, title.slice(0, 60));
    if (ownership === "foreign") {
      res.status(403).json({ error: "This session belongs to another user" });
      return;
    }
  }

  const threadSettings: ThreadSettings = sessionId ? (await getChatSessionSettings(sessionId, user.id) as ThreadSettings) : {};
  const resolved = resolveSettings(threadSettings, settings as MessageSettings, undefined, { isAdmin: user.role === "admin" });

  const msgCheck = await checkQuota(user.id, "message");
  if (!msgCheck.allowed) { res.status(429).json({ error: msgCheck.reason ?? "Daily message limit reached" }); return; }

  if (isThinking) {
    const thinkCheck = await checkQuota(user.id, "think");
    if (!thinkCheck.allowed) { res.status(429).json({ error: thinkCheck.reason ?? "Daily Think limit reached" }); return; }
  }

  const quota = await getQuotaSummary(user.id);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const streamToolTurns = flag("STREAM_TOOL_TURNS");
  const runId = (typeof req.body?.runId === "string" && req.body.runId) ? req.body.runId : crypto.randomUUID();
  if (streamToolTurns) {
    sendEvent(res, "meta", {
      protocol: 2,
      runId,
      ...(sessionId ? { sessionId } : {}),
    });
  }

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 20000);
  let aborted = false;
  const abortController = new AbortController();
  const clientGone = () => {
    aborted = true;
    clearInterval(heartbeat);
    if (!abortController.signal.aborted) abortController.abort();
  };
  // The request readable is auto-destroyed once express.json() consumed the body, so its
  // "close" can fire before this listener is attached: watch the response side for real
  // disconnects, and the request side only for abandoned uploads (same fix as /api/fn).
  req.on("close", () => { if (!req.readableEnded) clientGone(); });
  res.on("close", () => { if (!res.writableEnded) clientGone(); });

  let assistantContent = "";
  let assistantSaved = false;
  let finalModels: string[] = [];
  try {
    // Reading the files happens once the stream is open: a Drive download or an
    // image description takes seconds, and a file that fails is a notice rather
    // than an error. Only the names are stored; the text goes on the wire.
    let wireMessages = messages as KemmaMessage[];
    let attachedNote = "";
    if (attached.length > 0) {
      const read = await attachmentsToContext(user.id, attached);
      for (const message of read.notices) if (!aborted) sendEvent(res, "notice", { message });
      wireMessages = withContextOnLastUserMessage(wireMessages, read.text);
      attachedNote = attachmentNote(read.names);
    }

    if (sessionId) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser?.content) {
        const stored = attachedNote ? `${lastUser.content}\n\n${attachedNote}` : lastUser.content;
        await addChatMessage(sessionId, user.id, stored, "user", undefined, settings);
      }
    }

    // Live activity feed ("activity" SSE events): one row per tool call / phase, updated by id.
    let toolSeq = 0;
    const activeTools = new Map<string, { id: string; input: unknown; tool: string }>();
    let thinkId: string | null = null;
    let writing = false;
    const sendActivity = (event: ActivityEvent) => { if (!aborted) sendEvent(res, "activity", event); };

    const output = await kemmaExecute({
      userId: user.id,
      userName: user.name ?? undefined,
      messages: wireMessages,
      tier: quota.tier,
      isThinking,
      isVoice,
      sessionId,
      modelOverride: resolved.model === "auto" ? undefined : resolved.model,
      sensitiveRouting: resolved.sensitiveRouting,
      allowedTools: resolved.allowedTools,
      signal: abortController.signal,
      onStream: (chunk) => {
        assistantContent += chunk;
        if (!aborted) {
          if (!writing) { writing = true; sendActivity(describePhase("write", "write")); }
          sendEvent(res, "token", chunk);
        }
      },
      onReasoning: (delta) => {
        if (aborted) return;
        const isReasoningOff = (process.env.KEMMA_REASONING_EFFORT ?? "").trim().toLowerCase() === "off";
        if (streamToolTurns && !isReasoningOff) {
          sendEvent(res, "thinking", delta);
        }
      },
      onSegmentEnd: (kind) => {
        if (aborted) return;
        if (streamToolTurns) {
          sendEvent(res, "segment", { kind });
        }
      },
      onToolStart: (tool, input, callId) => {
        if (aborted) return;
        const id = callId || `tool-${++toolSeq}`;
        activeTools.set(id, { id, input, tool });
        if (streamToolTurns) {
          sendEvent(res, "tool_start", { id, tool, input });
        } else {
          sendEvent(res, "tool_start", { tool, input });
        }
        sendEvent(res, "agent", true);
        sendActivity(describeToolStart(id, tool, input));
      },
      onToolEnd: (tool, result, durationMs, callId) => {
        if (aborted) return;
        let started = callId ? activeTools.get(callId) : undefined;
        if (started && callId) {
          activeTools.delete(callId);
        } else if (!started) {
          const fallbackEntry = [...activeTools.entries()].find(([_k, v]) => v.tool === tool) ?? [...activeTools.entries()][0];
          if (fallbackEntry) {
            started = fallbackEntry[1];
            activeTools.delete(fallbackEntry[0]);
          } else {
            started = { id: callId || `tool-${++toolSeq}`, input: {}, tool };
          }
        }
        const id = started.id;
        if (streamToolTurns) {
          sendEvent(res, "tool_end", { id, tool, input: started.input, output: result, step: 0, durationMs });
        } else {
          sendEvent(res, "tool_end", { tool, input: started.input, output: result, step: 0, durationMs });
        }
        sendActivity(describeToolEnd(id, tool, started.input, result, durationMs));
      },
      onStepStart: (step, model) => {
        if (aborted) return;
        finalModels.push(model);
        sendEvent(res, "model", { step, label: model });
        thinkId = `think-${step}`;
        sendActivity(describePhase(thinkId, "think"));
      },
      onStepEnd: (_step) => {
        if (thinkId && !aborted) sendActivity(describePhase(thinkId, "think", "done"));
        thinkId = null;
      },
      onQuotaWarn: (message) => { if (!aborted) sendEvent(res, "quota_warn", { message }); },
      onNotice: (message) => { if (!aborted) sendEvent(res, "notice", { message }); },
      onSkillUsed: (skill) => { if (!aborted) sendEvent(res, "skill", skill); },
    });

    if (writing) sendActivity(describePhase("write", "write", "done"));

    // An engine-level error never reaches onStream; surface it through the SSE "error" event
    // (the client shows it and removes the blank assistant message) without persisting the
    // error text as an assistant message. Same for an answer that is entirely empty.
    if (!assistantContent && (output.isError || !output.response)) {
      if (!aborted && !output.cancelled) sendEvent(res, "error", output.isError ? output.response : "Sutaeru returned an empty response. Please try again.");
      return;
    }

    // Final text the engine produced without streaming it (e.g. the "Done." truncation
    // fallback): deliver and persist it like a streamed answer instead of leaving a blank chat.
    if (!assistantContent && output.response) {
      assistantContent = output.response;
      if (!aborted && !output.cancelled) sendEvent(res, "token", assistantContent);
    }

    if (sessionId && assistantContent) {
      if (aborted || output.cancelled) {
        await addChatMessage(sessionId, user.id, assistantContent, "assistant", finalModels[finalModels.length - 1] ?? resolved.model ?? undefined, undefined, { cancelled: true });
      } else {
        await addChatMessage(sessionId, user.id, assistantContent, "assistant", finalModels[finalModels.length - 1] ?? resolved.model ?? undefined);
      }
      assistantSaved = true;
    }

    if (!aborted && !output.cancelled && output.sources.length > 0) {
      sendEvent(res, "sources", output.sources);
    }

    if (!aborted && !output.cancelled) {
      sendEvent(res, "usage", {
        inputTokens: output.tokensUsed.input,
        outputTokens: output.tokensUsed.output,
        totalTokens: output.tokensUsed.total,
      });
    }

    if (!aborted && !output.cancelled) sendEvent(res, "done", finalModels[finalModels.length - 1] ?? "Sutaeru");
  } catch (err) {
    if (sessionId && assistantContent && !assistantSaved && (aborted || abortController.signal.aborted)) {
      try {
        await addChatMessage(sessionId, user.id, assistantContent, "assistant", finalModels[finalModels.length - 1] ?? resolved.model ?? undefined, undefined, { cancelled: true });
        assistantSaved = true;
      } catch {
        // non-fatal
      }
    }
    if (!aborted) sendEvent(res, "error", (err as Error).message ?? "Unknown error");
  } finally {
    clearInterval(heartbeat);
    if (!aborted) res.end();
  }
}
