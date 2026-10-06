/**
 * llmStream.ts
 *
 * Robust SSE stream parser and accumulator for OpenAI-compatible chat completion streams.
 *
 * Features:
 *   - Parse SSE robustly: lines can split across network chunks, multiline data: fields, comments (:),
 *     and clean termination on [DONE] that exits the outer read loop immediately.
 *   - Accumulate delta.tool_calls[] by index (or position if index is missing), concatenating
 *     arguments fragments and retaining extra_content (e.g. Gemini thought_signature).
 *   - Collect reasoning deltas from delta.reasoning_content (Qwen, DeepSeek) or delta.reasoning (OpenRouter)
 *     into onReasoning without polluting message content.
 *   - Extract usage from the final stream chunk (when stream_options.include_usage was requested)
 *     and finish_reason from choices.
 *   - Fallback for providers that ignore stream=true and return a single plain JSON completion body.
 *
 * @module core/llmStream
 * @see docs/spec/PHASE-1.md "P1-03 Stream every turn, plus thinking and segment events"
 */

import { parseUsage, type TokenUsage } from "./llmHttp";
import type { ToolCall } from "../kemma/engine";

export interface ChatStreamHandlers {
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface ChatStreamResult {
  content: string | null;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  finishReason?: string;
}

interface AccumulatedToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
  extra_content?: {
    google?: {
      thought_signature?: string;
    };
    [key: string]: unknown;
  };
}

/**
 * Extracts complete lines from an input string buffer, preserving any incomplete
 * trailing fragment in remainder. Supports \r\n, \n, and standalone \r.
 */
function extractLines(input: string, isFlush: boolean): { lines: string[]; remainder: string } {
  const lines: string[] = [];
  let lineStart = 0;
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];
    if (ch === "\r") {
      if (i + 1 < len) {
        if (input[i + 1] === "\n") {
          lines.push(input.slice(lineStart, i));
          i += 2;
          lineStart = i;
        } else {
          lines.push(input.slice(lineStart, i));
          i += 1;
          lineStart = i;
        }
      } else {
        if (isFlush) {
          lines.push(input.slice(lineStart, i));
          i += 1;
          lineStart = i;
        } else {
          break;
        }
      }
    } else if (ch === "\n") {
      lines.push(input.slice(lineStart, i));
      i += 1;
      lineStart = i;
    } else {
      i += 1;
    }
  }

  if (isFlush && lineStart < len) {
    lines.push(input.slice(lineStart));
    lineStart = len;
  }

  return { lines, remainder: input.slice(lineStart) };
}

/**
 * Parses a plain JSON completion response body (the fallback for providers that ignore stream=true).
 */
function parseJsonFallback(rawBody: string, h: ChatStreamHandlers): ChatStreamResult | null {
  const trimmed = rawBody.trimStart();
  if (!trimmed.startsWith("{")) return null;
  try {
    const data = JSON.parse(trimmed);
    const choice = data.choices?.[0];
    const message = choice?.message;
    if (!message && !choice) return null;

    const content = message?.content ?? null;
    if (typeof content === "string" && content.length > 0) {
      h.onText?.(content);
    }

    const reasoning = message?.reasoning_content ?? message?.reasoning;
    if (typeof reasoning === "string" && reasoning.length > 0) {
      h.onReasoning?.(reasoning);
    }

    const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((tc: any) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function?.name ?? "",
        arguments: tc.function?.arguments ?? "",
      },
      ...(tc.extra_content ? { extra_content: tc.extra_content } : {}),
    }));

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? parseUsage(data.usage) : undefined,
      finishReason: choice?.finish_reason ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Reads and decodes an SSE chat completion stream from a fetch Response.
 */
export async function readChatStream(res: Response, h: ChatStreamHandlers = {}): Promise<ChatStreamResult> {
  if (h.signal?.aborted) {
    throw h.signal.reason ?? new Error("Aborted");
  }

  const reader = res.body?.getReader ? res.body.getReader() : null;
  const decoder = new TextDecoder();

  let sseBuffer = "";
  let rawBody = "";
  let dataLines: string[] = [];
  let hasData = false;
  let isDone = false;

  let fullContent = "";
  let hasContent = false;
  const accumulatedToolCalls: Record<number, AccumulatedToolCall> = {};
  let hasToolCalls = false;
  let usage: TokenUsage | undefined;
  let finishReason: string | undefined;

  const onAbort = () => {
    try {
      reader?.cancel();
    } catch {
      // ignore
    }
  };
  h.signal?.addEventListener("abort", onAbort, { once: true });

  const processEventPayload = (eventData: string) => {
    if (eventData.trim() === "[DONE]") {
      isDone = true;
      return;
    }

    try {
      const parsed = JSON.parse(eventData);

      // Usage (can arrive in intermediate chunks or the final usage chunk)
      if (parsed.usage) {
        usage = parseUsage(parsed.usage);
      }

      if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
        const choice = parsed.choices[0];
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice.delta;
        if (delta) {
          // Content delta
          if (typeof delta.content === "string") {
            hasContent = true;
            fullContent += delta.content;
            h.onText?.(delta.content);
          }

          // Reasoning delta (Qwen/DeepSeek: reasoning_content, OpenRouter: reasoning)
          const reasoning = delta.reasoning_content ?? delta.reasoning;
          if (typeof reasoning === "string" && reasoning.length > 0) {
            h.onReasoning?.(reasoning);
          }

          // Tool calls delta
          if (Array.isArray(delta.tool_calls)) {
            for (let pos = 0; pos < delta.tool_calls.length; pos++) {
              const tc = delta.tool_calls[pos];
              let idx: number;
              if (typeof tc.index === "number") {
                idx = tc.index;
              } else if (tc.id) {
                const existingIdx = Object.keys(accumulatedToolCalls)
                  .map(Number)
                  .find((i) => accumulatedToolCalls[i].id === tc.id);
                if (existingIdx !== undefined) {
                  idx = existingIdx;
                } else if (accumulatedToolCalls[pos] && accumulatedToolCalls[pos].id && accumulatedToolCalls[pos].id !== tc.id) {
                  idx = Math.max(-1, ...Object.keys(accumulatedToolCalls).map(Number)) + 1;
                } else {
                  idx = pos;
                }
              } else {
                // index and id both missing: continuation chunk
                const keys = Object.keys(accumulatedToolCalls).map(Number);
                idx = keys.length > 0 ? Math.max(...keys) : pos;
              }
              hasToolCalls = true;

              if (!accumulatedToolCalls[idx]) {
                accumulatedToolCalls[idx] = {
                  id: tc.id ?? "",
                  type: tc.type ?? "function",
                  function: {
                    name: tc.function?.name ?? "",
                    arguments: tc.function?.arguments ?? "",
                  },
                  ...(tc.extra_content ? { extra_content: tc.extra_content } : {}),
                };
              } else {
                const existing = accumulatedToolCalls[idx];
                if (tc.id) existing.id = tc.id;
                if (tc.type) existing.type = tc.type;
                if (tc.function?.name) {
                  if (!existing.function.name) {
                    existing.function.name = tc.function.name;
                  } else if (existing.function.name !== tc.function.name) {
                    existing.function.name += tc.function.name;
                  }
                }
                if (tc.function?.arguments) {
                  existing.function.arguments += tc.function.arguments;
                }
                if (tc.extra_content) {
                  existing.extra_content = {
                    ...(existing.extra_content ?? {}),
                    ...tc.extra_content,
                    ...(tc.extra_content.google
                      ? {
                          google: {
                            ...(existing.extra_content?.google ?? {}),
                            ...tc.extra_content.google,
                          },
                        }
                      : {}),
                  };
                }
              }
            }
          }
        }
      }
    } catch {
      // Skip malformed JSON lines
    }
  };

  const processLines = (lines: string[]) => {
    for (const line of lines) {
      if (line.startsWith(":")) {
        // SSE comment
        continue;
      }
      if (line === "") {
        // Event boundary
        if (hasData) {
          const payload = dataLines.join("\n");
          dataLines = [];
          hasData = false;
          processEventPayload(payload);
          if (isDone) break;
        }
        continue;
      }
      if (line.startsWith("data:")) {
        const val = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
        dataLines.push(val);
        hasData = true;
      }
    }
  };

  try {
    if (reader) {
      while (true) {
        if (h.signal?.aborted) {
          throw h.signal.reason ?? new Error("Aborted");
        }

        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        rawBody += text;
        sseBuffer += text;

        const { lines, remainder } = extractLines(sseBuffer, false);
        sseBuffer = remainder;
        processLines(lines);

        if (isDone) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          break;
        }
      }

      // Flush remainder if any
      const trailing = decoder.decode();
      if (trailing) {
        rawBody += trailing;
        sseBuffer += trailing;
      }
      if (sseBuffer.length > 0 && !isDone) {
        const { lines } = extractLines(sseBuffer, true);
        processLines(lines);
      }
      if (hasData && !isDone) {
        processEventPayload(dataLines.join("\n"));
      }
    } else if (typeof (res as any).text === "function") {
      // Non-streaming response mock / body already consumed
      rawBody = await res.text();
    }
  } catch (err) {
    if (usage && err && typeof err === "object") {
      (err as any).usage = usage;
    }
    throw err;
  } finally {
    h.signal?.removeEventListener("abort", onAbort);
  }

  // Non-stream JSON fallback: when no streaming chunks were produced and rawBody is a valid JSON object
  if (!hasContent && !hasToolCalls && rawBody.trimStart().startsWith("{")) {
    const fallback = parseJsonFallback(rawBody, h);
    if (fallback) return fallback;
  }

  const toolCalls: ToolCall[] = Object.keys(accumulatedToolCalls)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => accumulatedToolCalls[i])
    .filter((tc) => tc.id || tc.function.name || tc.function.arguments);

  return {
    content: hasContent ? fullContent : null,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
    finishReason,
  };
}
