/**
 * chat-insights function (POST /api/fn/chat-insights).
 *
 * Request body, from client/src/components/ChatInsightsDialog.tsx:
 *   { conversation: string, focus: "decisions" | "gaps" | "brief" | "followups", audience?: string }
 *
 * Response is an SSE stream: `token` carries a JSON string, `error` carries
 * `{ message, retryable }`. The dialog ends on stream close, so the final
 * `done` frame is informational.
 */

import type { Request, Response } from "express";
import { LlmUnavailableError, stream, type ChatMessage } from "../../lib/fnLlm";
import { FnError } from "../../lib/fnErrors";
import {
  asRecord,
  optionalText,
  requireOneOf,
  requireText,
  startHeartbeat,
  startSse,
  writeSseEvent,
} from "./shared";

export const MAX_INSIGHT_CONVERSATION_CHARS = 200000;
export const MIN_INSIGHT_CONVERSATION_CHARS = 20;
export const MAX_AUDIENCE_CHARS = 300;
const MAX_INSIGHT_OUTPUT_TOKENS = 2500;

export const FOCUS = ["decisions", "gaps", "brief", "followups"] as const;
export type InsightFocus = (typeof FOCUS)[number];

const COMMON = `You analyse a conversation between a person and an AI assistant and write markdown.
Use only what the conversation says. Quote exact wording when it matters.
Never invent facts. If something is missing, say it is missing. No preamble, no closing pleasantries.`;

const FOCUS_PROMPTS: Record<InsightFocus, string> = {
  decisions: `Extract what was decided and what has to be done next.
Format:
## Decisions
- decision, with the line that shows it
## Next steps
- task, owner and date if either is given
## Blocked
- anything waiting on a decision or missing input, or "None."`,
  gaps: `Find the open questions and the missing information.
Format:
## Open questions
- question, and why it is still open
## Missing information
- what has to be supplied before this can move, and who was expected to supply it
## Contradictions
- statements that do not fit together, or "None."`,
  brief: `Write an executive brief for the stated audience, using only this conversation.
Format:
## Summary
Three or four sentences the audience can act on.
## What was decided
## What it costs or commits us to
## Risks and unknowns
## What we need from you
Short, plain language, no jargon the audience would not use.`,
  followups: `Suggest what to ask or look into next.
Format:
## Ask next
- the sharpest open question, and why asking it now pays off
## Dig deeper
- a thread in this conversation worth pulling, with the angle
## Watch
- a stated assumption or number that could be wrong`,
};

export async function handleChatInsights(userId: number, req: Request, res: Response): Promise<void> {
  const body = asRecord(req.body);
  const conversation = requireText(body, "conversation", MAX_INSIGHT_CONVERSATION_CHARS, MIN_INSIGHT_CONVERSATION_CHARS);
  const focus = requireOneOf(body.focus, FOCUS, "focus");
  const audience = optionalText(body, "audience", MAX_AUDIENCE_CHARS);

  if (focus === "brief" && (!audience || audience.length < 2)) {
    throw new FnError(400, "Describe who the brief is for.");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: `${COMMON}\n${FOCUS_PROMPTS[focus]}` },
    {
      role: "user",
      content: `${audience ? `Audience: ${audience}\n\n` : ""}Conversation:\n${conversation}`,
    },
  ];

  startSse(res);
  const stopHeartbeat = startHeartbeat(res);
  // The client closes this dialog by aborting the fetch. Node destroys the request
  // stream as soon as the body has been read, while this response is still open, so a
  // req "close" after a full body is not a disconnect: watch the response instead, and
  // treat a half-read request as one.
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
    const result = await stream(
      messages,
      { userId, purpose: "chat_insights", maxTokens: MAX_INSIGHT_OUTPUT_TOKENS },
      (token) => send("token", token)
    );
    send("done", { model: result.model, focus });
  } catch (err) {
    send("error", {
      message:
        err instanceof LlmUnavailableError
          ? "Chat insights are not configured yet."
          : "This analysis could not be completed. Please try again.",
      retryable: !(err instanceof LlmUnavailableError),
    });
  } finally {
    stopHeartbeat();
    if (!res.writableEnded) res.end();
  }
}
