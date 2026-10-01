import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Tests for the web_search response cache and in-flight dedupe in executors/webSearch.ts.
// Every test loads a fresh module, so the module-level cache starts empty.

const PERPLEXITY = "https://api.perplexity.ai/chat/completions";
const ENV_NAMES = ["SONAR_API_KEY", "PERPLEXITY_API_KEY", "KEMMA_MODEL_SEARCH", "KEMMA_SEARCH_RPM", "KEMMA_SEARCH_CACHE_TTL_SEC",
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS"];
const saved = new Map<string, string | undefined>();
let fetchMock: ReturnType<typeof vi.fn>;
let handler: (n: number, query: string) => Response;

const answer = (tag: string) => new Response(JSON.stringify({
  id: "x", model: "sonar-pro", object: "chat.completion", created: 1,
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: `answer ${tag}` } }],
  search_results: [{ title: `Result ${tag}`, url: `https://${tag}.example/page`, snippet: `snippet ${tag}` }],
}), { status: 200 });

async function load() {
  return (await import("./webSearch")) as typeof import("./webSearch");
}

beforeEach(() => {
  vi.resetModules();
  for (const n of ENV_NAMES) { saved.set(n, process.env[n]); delete process.env[n]; }
  process.env.SONAR_API_KEY = "s";
  process.env.KEMMA_SEARCH_RPM = "100000"; // keep the throttle out of the way
  handler = (_n, q) => answer(q.replace(/\W+/g, "-"));
  fetchMock = vi.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    return handler(fetchMock.mock.calls.length - 1, body.messages[0].content);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const [n, v] of saved) { if (v === undefined) delete process.env[n]; else process.env[n] = v; }
  saved.clear();
});

describe("web_search cache", () => {
  it("serves an identical query from memory", async () => {
    const { webSearch } = await load();
    const first = await webSearch("solar tariffs indonesia");
    const second = await webSearch("solar tariffs indonesia");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(PERPLEXITY);
    expect(second).toEqual(first);
  });

  it("treats case and whitespace differences as the same query", async () => {
    const { webSearch } = await load();
    await webSearch("Solar   Tariffs Indonesia");
    await webSearch("  solar tariffs indonesia ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not conflate different queries", async () => {
    const { webSearch } = await load();
    const a = await webSearch("query one");
    const b = await webSearch("query two");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(a).not.toEqual(b);
  });

  it("returns copies, so a caller mutating results cannot corrupt the cache", async () => {
    const { webSearch } = await load();
    const first = await webSearch("mutate me");
    first[0].title = "TAMPERED";
    first.push({ title: "extra", url: "https://extra", snippet: "" });
    const second = await webSearch("mutate me");
    expect(second[0].title).not.toBe("TAMPERED");
    expect(second.some((r) => r.title === "extra")).toBe(false);
  });

  it("expires entries after KEMMA_SEARCH_CACHE_TTL_SEC", async () => {
    process.env.KEMMA_SEARCH_CACHE_TTL_SEC = "60";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
    const { webSearch } = await load();
    await webSearch("ttl query");
    vi.setSystemTime(new Date("2026-10-02T00:00:59Z"));
    await webSearch("ttl query");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-02T00:01:01Z"));
    await webSearch("ttl query");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caps the lifetime of time-sensitive queries at two minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
    const { webSearch } = await load();
    await webSearch("latest solar news today");
    await webSearch("how do inverters work");
    vi.setSystemTime(new Date("2026-10-02T00:03:00Z")); // 180 s later, default TTL is 900 s
    await webSearch("latest solar news today");
    await webSearch("how do inverters work");
    expect(fetchMock).toHaveBeenCalledTimes(3); // only the time-sensitive one went upstream again
  });

  it("is disabled by KEMMA_SEARCH_CACHE_TTL_SEC=0", async () => {
    process.env.KEMMA_SEARCH_CACHE_TTL_SEC = "0";
    const { webSearch } = await load();
    await webSearch("no cache");
    await webSearch("no cache");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one upstream request between identical concurrent queries", async () => {
    const { webSearch } = await load();
    const [a, b, c] = await Promise.all([webSearch("parallel q"), webSearch("parallel q"), webSearch("Parallel Q")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("does not cache errors, and every sharer of an in-flight failure sees it", async () => {
    handler = () => new Response("boom", { status: 500 });
    const { webSearch, PerplexityAPIError } = await load();
    const results = await Promise.allSettled([webSearch("failing"), webSearch("failing")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r.status).toBe("rejected");
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(PerplexityAPIError);
    }
    handler = (_n, q) => answer(q);
    await expect(webSearch("failing")).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache an empty answer", async () => {
    handler = () => new Response(JSON.stringify({ choices: [] }), { status: 200 });
    const { webSearch } = await load();
    expect(await webSearch("empty")).toEqual([]);
    await webSearch("empty");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still reports a missing key as a configuration error when an answer is cached", async () => {
    const { webSearch, PerplexityConfigError } = await load();
    await webSearch("cached then keyless");
    delete process.env.SONAR_API_KEY;
    await expect(webSearch("cached then keyless")).rejects.toThrow(PerplexityConfigError);
  });

  it("still rejects an empty query", async () => {
    const { webSearch } = await load();
    await expect(webSearch("   ")).rejects.toThrow("Search query cannot be empty");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("evicts the least recently used entry beyond 200", async () => {
    const { webSearch } = await load();
    for (let i = 0; i < 201; i++) await webSearch(`distinct query ${i}`);
    expect(fetchMock).toHaveBeenCalledTimes(201);
    await webSearch("distinct query 200"); // newest: still cached
    expect(fetchMock).toHaveBeenCalledTimes(201);
    await webSearch("distinct query 0"); // oldest: evicted
    expect(fetchMock).toHaveBeenCalledTimes(202);
  });

  it("clearSearchCache forces a fresh upstream call", async () => {
    const { webSearch, clearSearchCache } = await load();
    await webSearch("clear me");
    clearSearchCache();
    await webSearch("clear me");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
