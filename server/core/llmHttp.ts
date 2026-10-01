/**
 * llmHttp.ts
 * Shared plumbing for OpenAI-compatible chat/completions calls:
 *
 *   - fetchWithRetry: exponential backoff with jitter on transient failures (408/425/429/5xx and
 *     network errors), honouring Retry-After. A retry on the SAME model is far cheaper than
 *     dropping to the next model in the fallback chain.
 *   - parseUsage: one place that reads token usage, including cached prompt tokens
 *     (usage.prompt_tokens_details.cached_tokens, reported by Gemini and Qwen).
 *   - Prompt-cache helpers. Gemini (2.5 and newer) and Qwen cache a repeated prompt PREFIX
 *     automatically, so for them the job is keeping the prefix byte-stable (see
 *     placeDynamicContext). Qwen additionally supports explicit cache markers
 *     (applyQwenCacheMarkers) that guarantee a hit for 5 minutes at 10% of the input price.
 *
 * Nothing in here logs request bodies or credentials.
 */

import type { ModelProvider } from "./kemmaRouter";

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE
// ═══════════════════════════════════════════════════════════════════════════════

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  /** Prompt tokens served from the provider's cache (subset of input). 0 when unreported. */
  cachedInput?: number;
}

/** Reads an OpenAI-style usage object. Reasoning tokens are folded into output so costs do not drop them. */
export function parseUsage(usage: any): TokenUsage {
  const input = Number(usage?.prompt_tokens ?? 0) || 0;
  const reasoning = Number(usage?.completion_tokens_details?.reasoning_tokens ?? 0) || 0;
  const output = (Number(usage?.completion_tokens ?? 0) || 0) + reasoning;
  const total = Number(usage?.total_tokens ?? 0) || input + output;
  const cached = Number(usage?.prompt_tokens_details?.cached_tokens ?? 0) || 0;
  return { input, output, total, cachedInput: Math.min(cached, input) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETRY
// ═══════════════════════════════════════════════════════════════════════════════

export interface RetryOptions {
  /** Total attempts including the first. Default env KEMMA_HTTP_ATTEMPTS or 3. */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Abort a request that has not produced response headers in this time. 0 disables. Default env KEMMA_HTTP_TIMEOUT_MS or 90000. */
  headerTimeoutMs?: number;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Retry-After as milliseconds (delta-seconds or HTTP-date); null when absent or unparseable. */
export function retryAfterMs(res: Response, now = Date.now()): number | null {
  const header = res.headers?.get?.("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

/**
 * fetch with retry. Returns the final Response even when it is a non-2xx (so the caller can read
 * the error body); throws only when every attempt failed at the network level, or the caller's own
 * signal aborted. The header timeout never applies once the response has started streaming.
 */
export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions = {}): Promise<Response> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? envInt("KEMMA_HTTP_ATTEMPTS", 3));
  const baseDelay = opts.baseDelayMs ?? 800;
  const maxDelay = opts.maxDelayMs ?? 20_000;
  const headerTimeout = opts.headerTimeoutMs ?? envInt("KEMMA_HTTP_TIMEOUT_MS", 90_000);
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const callerSignal = init.signal ?? undefined;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal) {
      if (callerSignal.aborted) throw callerSignal.reason ?? new Error("Aborted");
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
    const timer = headerTimeout > 0 ? setTimeout(() => controller.abort(new Error("LLM request timed out waiting for a response")), headerTimeout) : null;

    let delay = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
    delay = Math.round(delay / 2 + random() * (delay / 2)); // jitter: 50-100% of the step

    try {
      const res = await doFetch(url, { ...init, signal: controller.signal });
      if (timer) clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);

      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts) return res;

      const hinted = retryAfterMs(res);
      // Drain the body so the socket is released before we wait.
      await Promise.resolve(res.text?.()).catch(() => "");
      await sleep(Math.min(maxDelay, hinted ?? delay));
    } catch (err) {
      if (timer) clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
      if (callerSignal?.aborted) throw err;
      lastError = err;
      if (attempt === maxAttempts) throw err;
      await sleep(delay);
    }
  }
  throw lastError ?? new Error("fetchWithRetry: exhausted attempts");
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT CACHING
// ═══════════════════════════════════════════════════════════════════════════════

export interface ChatMessageLike {
  role: string;
  content: any;
}

/**
 * Prefix-stable prompt layout. Providers cache the longest identical PREFIX of the request, so
 * anything that changes per turn (retrieved memories) must not sit in the system message or early
 * in the history: one changed byte there invalidates the cache for everything after it.
 *
 * The context is attached to the LAST user message instead. Within one turn (a tool loop) that
 * message keeps its index, so every loop iteration re-reads the same prefix; across turns the
 * divergence starts at the previous user message, so the system prompt, tool definitions and all
 * earlier history stay cacheable.
 */
export function placeDynamicContext<T extends ChatMessageLike>(messages: T[], context: string | undefined): T[] {
  const text = context?.trim();
  if (!text) return messages;
  let idx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") { idx = i; break; }
  }
  if (idx === -1 || typeof messages[idx].content !== "string") return messages;
  const copy = messages.slice();
  copy[idx] = {
    ...copy[idx],
    content: `<retrieved_memories>\nBackground about the user, retrieved for this message. It is not part of what they wrote.\n${text}\n</retrieved_memories>\n\n${copy[idx].content}`,
  } as T;
  return copy;
}

// Qwen explicit cache: the content field must be an array for a marker to apply.
// Verified against Alibaba Model Studio docs: up to 4 markers per request, 1,024-token minimum per
// cached block, 5-minute TTL renewed on hit, creation billed at 125%, hits at 10% of input price.
// Multiple system messages merge into one segment, so spread markers across different roles.
let qwenExplicitCacheTripped = false;

export function qwenExplicitCacheEnabled(): boolean {
  if (qwenExplicitCacheTripped) return false;
  return (process.env.KEMMA_PROMPT_CACHE ?? "on").trim().toLowerCase() !== "off";
}

/** Called when the provider rejected cache markers; stops sending them for the life of the process. */
export function disableQwenExplicitCache(reason: string): void {
  if (!qwenExplicitCacheTripped) {
    qwenExplicitCacheTripped = true;
    console.warn(`[llm] explicit prompt cache disabled for this process: ${reason}`);
  }
}

export function resetCacheCircuitForTests(): void {
  qwenExplicitCacheTripped = false;
}

function withMarker(content: unknown): unknown[] | null {
  if (typeof content === "string") {
    return content.length === 0 ? null : [{ type: "text", text: content, cache_control: { type: "ephemeral" } }];
  }
  if (Array.isArray(content) && content.length > 0) {
    const parts = content.slice();
    const last = parts[parts.length - 1];
    if (last && typeof last === "object" && (last as any).type === "text") {
      parts[parts.length - 1] = { ...(last as object), cache_control: { type: "ephemeral" } };
      return parts;
    }
  }
  return null;
}

/**
 * Qwen explicit cache markers: one on the system message (the static prefix) and one on the last
 * USER message (the end of the stable part of the request). Everything up to that user message is
 * then cached for the 5-minute TTL, so each iteration of a tool loop, and each following turn of a
 * chat, re-reads it at 10% of the input price. Assistant and tool messages are never marked: the
 * array content form is only documented for text parts, and a rejected tool message would fail
 * every tool turn. The growing tool tail is left to Qwen's implicit cache.
 *
 * Only worth sending when the prefix will be reused: creation bills at 125%, so one-shot calls
 * (planner, synthesis, verification) must not use it. Callers opt in per request.
 */
export function applyQwenCacheMarkers<T extends ChatMessageLike>(messages: T[]): T[] {
  if (messages.length === 0) return messages;
  const out = messages.slice();
  const mark = (i: number) => {
    const marked = withMarker(out[i].content);
    if (marked) out[i] = { ...out[i], content: marked } as T;
  };
  const firstSystem = out.findIndex((m) => m.role === "system");
  if (firstSystem !== -1) mark(firstSystem);
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "user") { if (i !== firstSystem) mark(i); break; }
  }
  return out;
}

/** True when this provider benefits from request-side cache markers. Others cache implicit prefixes with no request changes. */
export function usesExplicitCacheMarkers(provider: ModelProvider): boolean {
  return provider === "qwen" && qwenExplicitCacheEnabled();
}

/** Detects an error body that is the provider rejecting cache_control, so the caller can retry without it. */
export function isCacheMarkerRejection(status: number, body: string): boolean {
  return status === 400 && /cache_control|cache control|ephemeral/i.test(body);
}

/** Detects an error body that is the provider rejecting stream_options. */
export function isStreamOptionsRejection(status: number, body: string): boolean {
  return status === 400 && /stream_options|include_usage/i.test(body);
}

/** Only providers known to accept OpenAI's stream_options get it; the rest report usage on their own or not at all. */
export function supportsStreamUsageOption(provider: ModelProvider): boolean {
  return provider === "qwen" || provider === "litellm";
}
