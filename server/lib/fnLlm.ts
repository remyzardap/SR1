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
  /** Recorded in usage_logs for cost tracking. */
  purpose: string;
  maxTokens?: number;
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
  { stream, maxTokens = 2000 }: { stream: boolean; maxTokens?: number }
): Promise<Response> {
  const target = await resolveRouteAuth(route);
  const res = await fetch(endpointFor(target.baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.auth}` },
    body: JSON.stringify({ model: target.model, messages, max_tokens: maxTokens, stream }),
  });
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
      const res = await request(route, messages, { stream: false, maxTokens: options.maxTokens });
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty LLM response");
      const inputTokens = data.usage?.prompt_tokens ?? 0;
      // Vertex bills thinking as completion_tokens_details.reasoning_tokens; keep it in the output count.
      const outputTokens = (data.usage?.completion_tokens ?? 0) + (data.usage?.completion_tokens_details?.reasoning_tokens ?? 0);
      void logUsage({ userId: options.userId, provider: route.provider, model: route.model, inputTokens, outputTokens, purpose: options.purpose });
      return { text, model: route.model, provider: route.provider, inputTokens, outputTokens };
    } catch (err) {
      lastError = err;
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
          const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
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
      void logUsage({ userId: options.userId, provider: route.provider, model: route.model, inputTokens: 0, outputTokens: 0, purpose: options.purpose });
      return { text, model: route.model, provider: route.provider, inputTokens: 0, outputTokens: 0 };
    } catch (err) {
      lastError = err;
      if (text.length > 0) break; // something already reached the client
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Language model request failed.");
}
