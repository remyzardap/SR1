import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseUsage,
  retryAfterMs,
  fetchWithRetry,
  placeDynamicContext,
  applyQwenCacheMarkers,
  usesExplicitCacheMarkers,
  disableQwenExplicitCache,
  resetCacheCircuitForTests,
  isCacheMarkerRejection,
  isStreamOptionsRejection,
  supportsStreamUsageOption,
} from "./llmHttp";

const noSleep = async () => {};

describe("parseUsage", () => {
  it("reads prompt, completion, total and cached tokens", () => {
    expect(parseUsage({ prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050, prompt_tokens_details: { cached_tokens: 800 } }))
      .toEqual({ input: 1000, output: 50, total: 1050, cachedInput: 800 });
  });

  it("folds reasoning tokens into output", () => {
    expect(parseUsage({ prompt_tokens: 10, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 20 }, total_tokens: 35 }))
      .toMatchObject({ input: 10, output: 25, total: 35 });
  });

  it("tolerates missing or malformed usage", () => {
    expect(parseUsage(undefined)).toEqual({ input: 0, output: 0, total: 0, cachedInput: 0 });
    expect(parseUsage({ prompt_tokens: "x" })).toMatchObject({ input: 0 });
  });

  it("never reports more cached tokens than input tokens", () => {
    expect(parseUsage({ prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 500 } }).cachedInput).toBe(100);
  });

  it("derives total when the provider omits it", () => {
    expect(parseUsage({ prompt_tokens: 7, completion_tokens: 3 }).total).toBe(10);
  });
});

describe("retryAfterMs", () => {
  const res = (value?: string) => new Response("", { status: 429, headers: value ? { "retry-after": value } : {} });

  it("parses delta-seconds", () => expect(retryAfterMs(res("3"))).toBe(3000));
  it("parses an HTTP date relative to now", () => {
    const now = Date.parse("2026-10-02T00:00:00Z");
    expect(retryAfterMs(res("Fri, 02 Oct 2026 00:00:05 GMT"), now)).toBe(5000);
  });
  it("returns null when absent or garbage", () => {
    expect(retryAfterMs(res())).toBeNull();
    expect(retryAfterMs(res("soon"))).toBeNull();
  });
});

describe("fetchWithRetry", () => {
  const ok = () => new Response("{}", { status: 200 });
  const status = (n: number, headers: Record<string, string> = {}) => new Response(`err ${n}`, { status: n, headers });

  it("returns the first successful response without retrying", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const res = await fetchWithRetry("https://x", {}, { fetchImpl, sleep: noSleep });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500, 502, 503, 504, 529])("retries a %i and succeeds on the next attempt", async (code) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(status(code)).mockResolvedValueOnce(ok());
    const res = await fetchWithRetry("https://x", {}, { fetchImpl, sleep: noSleep });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 422])("does not retry a %i", async (code) => {
    const fetchImpl = vi.fn(async () => status(code));
    const res = await fetchWithRetry("https://x", {}, { fetchImpl, sleep: noSleep });
    expect(res.status).toBe(code);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns the last response, body intact, once attempts are exhausted", async () => {
    const fetchImpl = vi.fn(async () => status(503));
    const res = await fetchWithRetry("https://x", {}, { fetchImpl, sleep: noSleep, maxAttempts: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("err 503");
  });

  it("honours Retry-After over the computed backoff", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi.fn().mockResolvedValueOnce(status(429, { "retry-after": "4" })).mockResolvedValueOnce(ok());
    await fetchWithRetry("https://x", {}, { fetchImpl, sleep: async (ms) => { sleeps.push(ms); } });
    expect(sleeps).toEqual([4000]);
  });

  it("caps an excessive Retry-After at maxDelayMs", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi.fn().mockResolvedValueOnce(status(429, { "retry-after": "3600" })).mockResolvedValueOnce(ok());
    await fetchWithRetry("https://x", {}, { fetchImpl, sleep: async (ms) => { sleeps.push(ms); }, maxDelayMs: 5000 });
    expect(sleeps).toEqual([5000]);
  });

  it("backs off exponentially with jitter between 50% and 100% of the step", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi.fn(async () => status(500));
    await fetchWithRetry("https://x", {}, {
      fetchImpl, maxAttempts: 4, baseDelayMs: 1000, random: () => 0, sleep: async (ms) => { sleeps.push(ms); },
    });
    expect(sleeps).toEqual([500, 1000, 2000]); // steps 1000, 2000, 4000 at the 50% floor
  });

  it("retries network errors and rethrows the last one when exhausted", async () => {
    const boom = new TypeError("fetch failed");
    const fetchImpl = vi.fn(async () => { throw boom; });
    await expect(fetchWithRetry("https://x", {}, { fetchImpl, sleep: noSleep, maxAttempts: 2 })).rejects.toBe(boom);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("recovers from a transient network error", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(ok());
    const res = await fetchWithRetry("https://x", {}, { fetchImpl, sleep: noSleep });
    expect(res.status).toBe(200);
  });

  it("does not retry when the caller aborted", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => { controller.abort(new Error("user cancelled")); throw new Error("aborted"); });
    await expect(fetchWithRetry("https://x", { signal: controller.signal }, { fetchImpl, sleep: noSleep })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("aborts a request that gets no response headers in time, then retries", async () => {
    let call = 0;
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      call++;
      if (call === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        });
      }
      return Promise.resolve(ok());
    }) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://x", {}, { fetchImpl, sleep: noSleep, headerTimeoutMs: 20 });
    expect(res.status).toBe(200);
    expect(call).toBe(2);
  });

  it("respects KEMMA_HTTP_ATTEMPTS", async () => {
    vi.stubEnv("KEMMA_HTTP_ATTEMPTS", "1");
    const fetchImpl = vi.fn(async () => status(503));
    await fetchWithRetry("https://x", {}, { fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});

describe("placeDynamicContext", () => {
  const msgs = [
    { role: "user", content: "first" },
    { role: "assistant", content: "reply" },
    { role: "user", content: "second" },
    { role: "assistant", content: null, tool_calls: [] },
    { role: "tool", content: "{}" },
  ];

  it("attaches context to the LAST user message only, leaving earlier history byte-identical", () => {
    const out = placeDynamicContext(msgs, "likes solar");
    expect(out[0]).toBe(msgs[0]);
    expect(out[1]).toBe(msgs[1]);
    expect(out[2].content).toContain("likes solar");
    expect(out[2].content).toMatch(/second$/);
    expect(out[3]).toBe(msgs[3]);
    expect(out[4]).toBe(msgs[4]);
  });

  it("does not mutate the input array or its messages", () => {
    const before = JSON.stringify(msgs);
    placeDynamicContext(msgs, "ctx");
    expect(JSON.stringify(msgs)).toBe(before);
  });

  it("is a no-op for empty or whitespace context", () => {
    expect(placeDynamicContext(msgs, undefined)).toBe(msgs);
    expect(placeDynamicContext(msgs, "   ")).toBe(msgs);
  });

  it("is a no-op when there is no user message or its content is not a string", () => {
    const noUser = [{ role: "assistant", content: "x" }];
    expect(placeDynamicContext(noUser, "ctx")).toBe(noUser);
    const parts = [{ role: "user", content: [{ type: "text", text: "hi" }] }];
    expect(placeDynamicContext(parts, "ctx")).toBe(parts);
  });

  it("produces the same output for the same context, so repeated loop iterations share a prefix", () => {
    expect(JSON.stringify(placeDynamicContext(msgs, "ctx"))).toBe(JSON.stringify(placeDynamicContext(msgs, "ctx")));
  });
});

describe("applyQwenCacheMarkers", () => {
  const marker = { type: "ephemeral" };

  it("marks the system message and the last user message", () => {
    const out = applyQwenCacheMarkers([
      { role: "system", content: "sys" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
    ]);
    expect(out[0].content).toEqual([{ type: "text", text: "sys", cache_control: marker }]);
    expect(out[1].content).toBe("u1");
    expect(out[2].content).toBe("a1");
    expect(out[3].content).toEqual([{ type: "text", text: "u2", cache_control: marker }]);
  });

  it("never marks tool or assistant messages, even when they are last", () => {
    const out = applyQwenCacheMarkers([
      { role: "system", content: "sys" },
      { role: "user", content: "u" },
      { role: "assistant", content: null, tool_calls: [{ id: "1" }] },
      { role: "tool", content: "{\"ok\":true}" },
    ]);
    expect(out[2].content).toBeNull();
    expect(out[3].content).toBe("{\"ok\":true}");
    expect(out[1].content).toEqual([{ type: "text", text: "u", cache_control: marker }]);
  });

  it("uses at most two markers (the API allows four)", () => {
    const out = applyQwenCacheMarkers([
      { role: "system", content: "s" }, { role: "user", content: "1" }, { role: "assistant", content: "a" },
      { role: "user", content: "2" }, { role: "assistant", content: "b" }, { role: "user", content: "3" },
    ]);
    const marked = out.filter((m) => Array.isArray(m.content));
    expect(marked).toHaveLength(2);
  });

  it("does not mutate its input", () => {
    const input = [{ role: "system", content: "s" }, { role: "user", content: "u" }];
    const before = JSON.stringify(input);
    applyQwenCacheMarkers(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("marks the last text part of an array-form message", () => {
    const out = applyQwenCacheMarkers([{ role: "user", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }]);
    expect((out[0].content as any[])[1]).toEqual({ type: "text", text: "b", cache_control: marker });
    expect((out[0].content as any[])[0]).toEqual({ type: "text", text: "a" });
  });

  it("skips empty content and handles an empty list", () => {
    expect(applyQwenCacheMarkers([])).toEqual([]);
    const out = applyQwenCacheMarkers([{ role: "system", content: "" }, { role: "user", content: "" }]);
    expect(out.every((m) => m.content === "")).toBe(true);
  });
});

describe("cache circuit and provider gating", () => {
  beforeEach(() => resetCacheCircuitForTests());
  afterEach(() => { resetCacheCircuitForTests(); vi.unstubAllEnvs(); });

  it("explicit markers are for qwen only", () => {
    expect(usesExplicitCacheMarkers("qwen")).toBe(true);
    for (const p of ["gemini", "perplexity", "litellm", "venice"] as const) expect(usesExplicitCacheMarkers(p)).toBe(false);
  });

  it("KEMMA_PROMPT_CACHE=off disables markers", () => {
    vi.stubEnv("KEMMA_PROMPT_CACHE", "off");
    expect(usesExplicitCacheMarkers("qwen")).toBe(false);
  });

  it("stays disabled after the provider rejected markers", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    disableQwenExplicitCache("test");
    expect(usesExplicitCacheMarkers("qwen")).toBe(false);
  });

  it("recognises rejection bodies", () => {
    expect(isCacheMarkerRejection(400, "unknown field cache_control")).toBe(true);
    expect(isCacheMarkerRejection(500, "cache_control")).toBe(false);
    expect(isCacheMarkerRejection(400, "bad json")).toBe(false);
    expect(isStreamOptionsRejection(400, "Unknown name \"stream_options\"")).toBe(true);
    expect(isStreamOptionsRejection(400, "other")).toBe(false);
  });

  it("only sends stream_options to providers known to accept it", () => {
    expect(supportsStreamUsageOption("qwen")).toBe(true);
    expect(supportsStreamUsageOption("litellm")).toBe(true);
    expect(supportsStreamUsageOption("gemini")).toBe(false);
    expect(supportsStreamUsageOption("perplexity")).toBe(false);
  });
});
