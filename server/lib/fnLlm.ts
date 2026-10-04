/**
 * Small LLM helpers for the /api/fn cloud-function replacements.
 *
 * They reuse the platform model router (server/core/kemmaRouter) and the same
 * OpenAI-compatible call shape the Kemma engine uses, with a fallback chain and
 * usage logging. No new providers are integrated.
 */

import {
  chatRoute,
  fallbackRoutes,
  longDocRoute,
  resolveRouteAuth,
  routeHasAuth,
  type ModelProvider,
  type RouteConfig,
} from "../core/kemmaRouter";
import { logUsage } from "../core/usage";
import { fetchWithRetry, parseUsage, isStreamOptionsRejection, supportsStreamUsageOption, type TokenUsage } from "../core/llmHttp";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmResult {
  text: string;
  model: string;
  provider: ModelProvider;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmOptions {
  userId: number;
  /** Which model slot to start from; the router picks the provider and key. */
  slot?: "chat" | "longDoc";
  /** Thinking budget for models that support it. Default: the same setting the chat engine uses (low for flash). */
  reasoning?: "low" | "medium" | "high";
  /** Recorded in usage_logs for cost tracking. */
  purpose: string;
  maxTokens?: number;
  /** Aborts the request (and any retry wait) when the caller goes away. */
  signal?: AbortSignal;
}

export class LlmUnavailableError extends Error {
  constructor(message = "No language model is configured.") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/** Routes that can be authenticated (static key or Vertex service account), primary first, deduplicated by model name. */
export function resolveRoutes(slot: LlmOptions["slot"]): RouteConfig[] {
  const primary = slot === "longDoc" ? longDocRoute() : chatRoute();
  const chain = [primary, ...fallbackRoutes()];
  const seen = new Set<string>();
  return chain.filter((route) => {
    if (!routeHasAuth(route) || seen.has(route.model)) return false;
    seen.add(route.model);
    return true;
  });
}

function endpointFor(baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/chat/completions`;
}

async function request(
  route: RouteConfig,
  messages: ChatMessage[],
  { stream, maxTokens = 2000, signal, reasoning }: { stream: boolean; maxTokens?: number; signal?: AbortSignal; reasoning?: "low" | "medium" | "high" }
): Promise<Response> {
  const target = await resolveRouteAuth(route);
  // Loaded lazily: the engine imports a lot, and this keeps the two modules from importing each other at load time.
  const { reasoningEffortFor } = await import("../kemma/engine");
  // Only routes that take a thinking budget get one; an override just picks the level for them.
  const routeEffort = reasoningEffortFor(route);
  const effort = routeEffort ? (reasoning ?? routeEffort) : undefined;
  // Transient failures (429, 5xx, network) retry on the same model before the caller tries the next
  // route. Streams ask for a final usage chunk so they are metered; a provider that rejects the
  // option gets one retry without it.
  const send = (streamUsage: boolean) =>
    fetchWithRetry(endpointFor(target.baseUrl), {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.auth}` },
      body: JSON.stringify({
        model: target.model,
        messages,
        max_tokens: maxTokens,
        stream,
        ...(effort ? { reasoning_effort: effort } : {}),
        ...(stream && streamUsage ? { stream_options: { include_usage: true } } : {}),
      }),
    });

  const wantUsage = stream && supportsStreamUsageOption(route.provider);
  let res = await send(wantUsage);
  if (!res.ok && wantUsage && res.status === 400) {
    const detail = await res.text().catch(() => "");
    if (isStreamOptionsRejection(400, detail)) {
      res = await send(false);
    } else {
      throw new Error(`LLM API error (400)${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM API error (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return res;
}

/** Non-streaming completion with the router fallback chain. */
export async function complete(messages: ChatMessage[], options: LlmOptions): Promise<LlmResult> {
  const routes = resolveRoutes(options.slot);
  if (routes.length === 0) throw new LlmUnavailableError();

  let lastError: unknown;
  for (const route of routes) {
    try {
      const res = await request(route, messages, { stream: false, maxTokens: options.maxTokens, signal: options.signal, reasoning: options.reasoning });
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: unknown;
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty LLM response");
      // parseUsage keeps Vertex reasoning tokens in the output count and reads cached prompt tokens.
      const used = parseUsage(data.usage);
      const inputTokens = used.input;
      const outputTokens = used.output;
      void logUsage({ userId: options.userId, provider: route.provider, model: route.model, inputTokens, outputTokens, cachedInputTokens: used.cachedInput ?? 0, purpose: options.purpose });
      return { text, model: route.model, provider: route.provider, inputTokens, outputTokens };
    } catch (err) {
      lastError = err;
      if (options.signal?.aborted) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Language model request failed.");
}

/**
 * Streaming completion. onToken is called for every text delta; the returned
 * text is the full accumulation. Falls through to the next route only while
 * nothing has been emitted yet, so a half-streamed answer is never repeated.
 */
export async function stream(
  messages: ChatMessage[],
  options: LlmOptions,
  onToken: (text: string) => void
): Promise<LlmResult> {
  const routes = resolveRoutes(options.slot);
  if (routes.length === 0) throw new LlmUnavailableError();

  let lastError: unknown;
  for (const route of routes) {
    let text = "";
    let streamed: TokenUsage | undefined;
    try {
      const res = await request(route, messages, { stream: true, maxTokens: options.maxTokens });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Empty LLM response stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let closed = false;
      const takeLine = (line: string): boolean => {
        if (!line.startsWith("data:")) return false;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return true;
        try {
          const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }>; usage?: unknown };
          if (parsed.usage) streamed = parseUsage(parsed.usage);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            onToken(delta);
          }
        } catch {
          // Keep-alives and partial frames carry no JSON payload.
        }
        return false;
      };
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) {
          // The last line of a stream usually has no newline after it: read what is left.
          if (buffer.trim()) closed = takeLine(buffer.trim());
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (takeLine(line)) {
            closed = true;
            break;
          }
        }
      }
      // [DONE] is the end of the answer; the provider may keep the connection open.
      if (closed) await Promise.resolve(reader.cancel?.()).catch(() => {});
      if (!text.trim()) throw new Error("Empty LLM response");
      const inputTokens = streamed?.input ?? 0;
      const outputTokens = streamed?.output ?? 0;
      void logUsage({ userId: options.userId, provider: route.provider, model: route.model, inputTokens, outputTokens, cachedInputTokens: streamed?.cachedInput ?? 0, purpose: options.purpose });
      return { text, model: route.model, provider: route.provider, inputTokens, outputTokens };
    } catch (err) {
      lastError = err;
      if (text.length > 0) break; // something already reached the client
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Language model request failed.");
}
