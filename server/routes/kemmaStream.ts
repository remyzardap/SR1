import type { Request, Response } from "express";
import { kemmaExecute, type KemmaMessage } from "../kemma/engine";
import { getQuotaSummary, checkQuota } from "../core/quotaCheck";
import { getChatSessionSettings, addChatMessage } from "../db";
import { resolveSettings, type ThreadSettings, type MessageSettings } from "../kemma/settings";

function sendEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function kemmaStreamRoute(req: Request, res: Response) {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { messages, sessionId, isThinking = false, isVoice = false, settings = {} } = req.body as any;
  if (!Array.isArray(messages) || messages.length === 0) { res.status(400).json({ error: "messages required" }); return; }

  const threadSettings: ThreadSettings = sessionId ? (await getChatSessionSettings(sessionId, user.id) as ThreadSettings) : {};
  const resolved = resolveSettings(threadSettings, settings as MessageSettings);

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

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 20000);
  let aborted = false;
  const clientGone = () => { aborted = true; clearInterval(heartbeat); };
  // The request readable is auto-destroyed once express.json() consumed the body, so its
  // "close" can fire before this listener is attached: watch the response side for real
  // disconnects, and the request side only for abandoned uploads (same fix as /api/fn).
  req.on("close", () => { if (!req.readableEnded) clientGone(); });
  res.on("close", () => { if (!res.writableEnded) clientGone(); });

  let assistantContent = "";
  try {
    if (sessionId) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser?.content) {
        await addChatMessage(sessionId, user.id, lastUser.content, "user", undefined, settings);
      }
    }

    let finalModels: string[] = [];

    const output = await kemmaExecute({
      userId: user.id,
      userName: user.name ?? undefined,
      messages: messages as KemmaMessage[],
      tier: quota.tier,
      isThinking,
      isVoice,
      sessionId,
      modelOverride: resolved.model === "auto" ? undefined : resolved.model,
      allowedTools: resolved.allowedTools,
      onStream: (chunk) => {
        assistantContent += chunk;
        if (!aborted) sendEvent(res, "token", chunk);
      },
      onToolStart: (tool, input) => { if (!aborted) { sendEvent(res, "tool_start", { tool, input }); sendEvent(res, "agent", true); } },
      onToolEnd: (tool, result, durationMs) => { if (!aborted) sendEvent(res, "tool_end", { tool, input: {}, output: result, step: 0, durationMs }); },
      onStepStart: (step, model) => { if (!aborted) { finalModels.push(model); sendEvent(res, "model", { step, label: model }); } },
      onStepEnd: (_step) => {},
      onQuotaWarn: (message) => { if (!aborted) sendEvent(res, "quota_warn", { message }); },
      onNotice: (message) => { if (!aborted) sendEvent(res, "notice", { message }); },
      onSkillUsed: (skill) => { if (!aborted) sendEvent(res, "skill", skill); },
    });

    // An engine-level error never reaches onStream; surface it through the SSE "error" event
    // (the client shows it and removes the blank assistant message) without persisting the
    // error text as an assistant message. Same for an answer that is entirely empty.
    if (!assistantContent && (output.isError || !output.response)) {
      if (!aborted) sendEvent(res, "error", output.isError ? output.response : "Kemma returned an empty response. Please try again.");
      return;
    }

    // Final text the engine produced without streaming it (e.g. the "Done." truncation
    // fallback): deliver and persist it like a streamed answer instead of leaving a blank chat.
    if (!assistantContent && output.response) {
      assistantContent = output.response;
      if (!aborted) sendEvent(res, "token", assistantContent);
    }

    if (sessionId && assistantContent && !aborted) {
      await addChatMessage(sessionId, user.id, assistantContent, "assistant", finalModels[finalModels.length - 1] ?? resolved.model ?? undefined);
    }

    if (!aborted && output.sources.length > 0) {
      sendEvent(res, "sources", output.sources);
    }

    if (!aborted) {
      sendEvent(res, "usage", {
        inputTokens: output.tokensUsed.input,
        outputTokens: output.tokensUsed.output,
        totalTokens: output.tokensUsed.total,
      });
    }

    if (!aborted) sendEvent(res, "done", finalModels[finalModels.length - 1] ?? "Kemma");
  } catch (err) {
    if (!aborted) sendEvent(res, "error", (err as Error).message ?? "Unknown error");
  } finally {
    clearInterval(heartbeat);
    if (!aborted) res.end();
  }
}
