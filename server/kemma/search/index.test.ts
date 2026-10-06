import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearSearchV2Cache } from "./cache";
import type { SearchHit, SearchProvider } from "./types";

// In-memory stand-in for kv_cache (L2), so L2 behavior is testable without a real database.
const kvStore = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../../core/kvCache", () => ({
  kvGet: vi.fn(async (_ns: string, key: string) => kvStore.get(key) ?? null),
  kvSet: vi.fn(async (_ns: string, key: string, value: unknown) => { kvStore.set(key, value); }),
}));

const logFixedCostUsage = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../core/usage", () => ({ logFixedCostUsage }));

// Fake providers registered directly, so the orchestrator's selection/fast-path/fan-out logic is
// tested independently of any real provider's HTTP call.
const providerState = vi.hoisted(() => ({
  brave: { configured: true, hits: [] as SearchHit[], error: null as Error | null, calls: 0 },
  tavily: { configured: true, hits: [] as SearchHit[], error: null as Error | null, calls: 0 },
  exa: { configured: false, hits: [] as SearchHit[], error: null as Error | null, calls: 0 },
  perplexity: { configured: false, hits: [] as SearchHit[], error: null as Error | null, calls: 0 },
  searxng: { configured: false, hits: [] as SearchHit[], error: null as Error | null, calls: 0 },
  sonar: { configured: true, hits: [] as SearchHit[], error: null as Error | null, calls: 0 },
}));

function makeProvider(id: keyof typeof providerState, costUsd: number): SearchProvider {
  return {
    id,
    configured: () => providerState[id].configured,
    get costPerRequestUsd() {
      return costUsd;
    },
    search: async () => {
      providerState[id].calls++;
      if (providerState[id].error) throw providerState[id].error;
      return providerState[id].hits;
    },
  };
}

vi.mock("./providers/brave", () => ({ braveProvider: makeProvider("brave", 0.005) }));
vi.mock("./providers/tavily", () => ({ tavilyProvider: makeProvider("tavily", 0.008) }));
vi.mock("./providers/exa", () => ({ exaProvider: makeProvider("exa", 0.01) }));
vi.mock("./providers/perplexity", () => ({ perplexitySearchProvider: makeProvider("perplexity", 0.008) }));
vi.mock("./providers/searxng", () => ({ searxngProvider: makeProvider("searxng", 0) }));
vi.mock("./providers/sonar", () => ({ sonarProvider: makeProvider("sonar", 0.03) }));

const ENV = ["KEMMA_SEARCH_PROVIDERS", "KEMMA_SEARCH_CACHE_TTL_SEC"];
const saved = new Map<string, string | undefined>();

const DEFAULT_CONFIGURED: Record<keyof typeof providerState, boolean> = {
  brave: true, tavily: true, exa: false, perplexity: false, searxng: false, sonar: true,
};

beforeEach(() => {
  kvStore.clear();
  clearSearchV2Cache();
  logFixedCostUsage.mockClear();
  for (const id of Object.keys(providerState) as (keyof typeof providerState)[]) {
    providerState[id].hits = [];
    providerState[id].error = null;
    providerState[id].calls = 0;
    providerState[id].configured = DEFAULT_CONFIGURED[id];
  }
  for (const n of ENV) { saved.set(n, process.env[n]); delete process.env[n]; }
  process.env.KEMMA_SEARCH_PROVIDERS = "brave,tavily,sonar";
});
afterEach(() => { for (const [n, v] of saved) if (v === undefined) delete process.env[n]; else process.env[n] = v; });

const hit = (url: string, provider: string): SearchHit => ({ title: url, url, snippet: "", provider });

describe("configuredSearchProviders", () => {
  it("filters KEMMA_SEARCH_PROVIDERS to providers that report configured()", async () => {
    const { configuredSearchProviders } = await import("./index");
    providerState.exa.configured = true;
    process.env.KEMMA_SEARCH_PROVIDERS = "exa,brave,searxng";
    expect(configuredSearchProviders().map((p) => p.id)).toEqual(["exa", "brave"]);
  });
});

describe("searchV2 fast path", () => {
  it("returns the first configured provider's hits without trying the next", async () => {
    providerState.brave.hits = [hit("https://a.example", "brave")];
    const { searchV2 } = await import("./index");
    const hits = await searchV2("q", {}, { userId: 1 });
    expect(hits.map((h) => h.url)).toEqual(["https://a.example"]);
    expect(providerState.brave.calls).toBe(1);
    expect(providerState.tavily.calls).toBe(0);
  });

  it("fails over to the next provider on an upstream error", async () => {
    providerState.brave.error = new Error("brave 500");
    providerState.tavily.hits = [hit("https://b.example", "tavily")];
    const { searchV2 } = await import("./index");
    const hits = await searchV2("q", {}, { userId: 1 });
    expect(hits.map((h) => h.url)).toEqual(["https://b.example"]);
    expect(providerState.brave.calls).toBe(1);
    expect(providerState.tavily.calls).toBe(1);
  });

  it("fails over to the next provider on an empty result list", async () => {
    providerState.brave.hits = [];
    providerState.tavily.hits = [hit("https://b.example", "tavily")];
    const { searchV2 } = await import("./index");
    const hits = await searchV2("q", {}, { userId: 1 });
    expect(hits.map((h) => h.url)).toEqual(["https://b.example"]);
  });

  it("throws SearchUnavailableError when all configured providers throw (all 500)", async () => {
    providerState.brave.error = new Error("brave 500");
    providerState.tavily.error = new Error("tavily 500");
    providerState.sonar.error = new Error("sonar 500");
    const { searchV2, SearchUnavailableError } = await import("./index");
    await expect(searchV2("q", {}, { userId: 1 })).rejects.toThrow(SearchUnavailableError);
    expect(providerState.brave.calls).toBe(1);
    expect(providerState.tavily.calls).toBe(1);
    expect(providerState.sonar.calls).toBe(1);
    expect(logFixedCostUsage).toHaveBeenCalledTimes(3);
  });

  it("returns empty array when one provider 500s and the next provider returns empty results", async () => {
    providerState.brave.error = new Error("brave 500");
    providerState.tavily.hits = [];
    providerState.sonar.hits = [];
    const { searchV2 } = await import("./index");
    const hits = await searchV2("q", {}, { userId: 1 });
    expect(hits).toEqual([]);
    expect(providerState.brave.calls).toBe(1);
    expect(providerState.tavily.calls).toBe(1);
    expect(providerState.sonar.calls).toBe(1);
    expect(logFixedCostUsage).toHaveBeenCalledTimes(3);
  });

  it("returns hits when one provider 500s and the next provider returns hits", async () => {
    providerState.brave.error = new Error("brave 500");
    providerState.tavily.hits = [hit("https://hit.example", "tavily")];
    const { searchV2 } = await import("./index");
    const hits = await searchV2("q", {}, { userId: 1 });
    expect(hits.map((h) => h.url)).toEqual(["https://hit.example"]);
    expect(providerState.brave.calls).toBe(1);
    expect(providerState.tavily.calls).toBe(1);
    expect(providerState.sonar.calls).toBe(0);
  });

  it("throws NoSearchProviderConfiguredError when nothing in the order is configured", async () => {
    process.env.KEMMA_SEARCH_PROVIDERS = "exa,searxng,perplexity";
    const { searchV2, NoSearchProviderConfiguredError } = await import("./index");
    await expect(searchV2("q", {}, { userId: 1 })).rejects.toThrow(NoSearchProviderConfiguredError);
  });

  it("rejects an empty query before touching any provider", async () => {
    const { searchV2 } = await import("./index");
    await expect(searchV2("   ", {}, { userId: 1 })).rejects.toThrow(/cannot be empty/);
    expect(providerState.brave.calls).toBe(0);
  });
});

describe("searchV2 fan-out (depth: deep)", () => {
  it("runs the first two configured providers in parallel and fuses with RRF", async () => {
    providerState.brave.hits = [hit("https://shared.example", "brave"), hit("https://brave-only.example", "brave")];
    providerState.tavily.hits = [hit("https://shared.example", "tavily"), hit("https://tavily-only.example", "tavily")];
    const { searchV2 } = await import("./index");
    const hits = await searchV2("q", { depth: "deep" }, { userId: 1 });
    expect(providerState.brave.calls).toBe(1);
    expect(providerState.tavily.calls).toBe(1);
    expect(providerState.sonar.calls).toBe(0); // only the first two configured providers run
    expect(hits[0].url).toBe("https://shared.example"); // rank 1 in both lists: highest RRF score
    expect(hits.map((h) => h.url)).toHaveLength(3); // deduped across the two lists
  });

  it("keeps the other list's hits when one of the two fails (one 500 and one with hits)", async () => {
    providerState.brave.error = new Error("down");
    providerState.tavily.hits = [hit("https://b.example", "tavily")];
    const { searchV2 } = await import("./index");
    const hits = await searchV2("q", { depth: "deep" }, { userId: 1 });
    expect(hits.map((h) => h.url)).toEqual(["https://b.example"]);
  });

  it("returns empty array when one fan-out provider fails and the other returns empty (one 500 and one empty)", async () => {
    providerState.brave.error = new Error("down");
    providerState.tavily.hits = [];
    const { searchV2 } = await import("./index");
    const hits = await searchV2("q", { depth: "deep" }, { userId: 1 });
    expect(hits).toEqual([]);
    expect(logFixedCostUsage).toHaveBeenCalledTimes(2);
  });

  it("throws SearchUnavailableError when all fan-out providers fail (all 500)", async () => {
    providerState.brave.error = new Error("brave 500");
    providerState.tavily.error = new Error("tavily 500");
    const { searchV2, SearchUnavailableError } = await import("./index");
    await expect(searchV2("q", { depth: "deep" }, { userId: 1 })).rejects.toThrow(SearchUnavailableError);
    expect(logFixedCostUsage).toHaveBeenCalledTimes(2);
  });
});

describe("searchV2 usage logging", () => {
  it("logs one usage_logs row per upstream request made, with provider id, model search and the configured cost", async () => {
    providerState.brave.error = new Error("down");
    providerState.tavily.hits = [hit("https://b.example", "tavily")];
    const { searchV2 } = await import("./index");
    await searchV2("q", {}, { userId: 7, sessionId: "s1" });
    expect(logFixedCostUsage).toHaveBeenCalledTimes(2);
    expect(logFixedCostUsage).toHaveBeenNthCalledWith(1, {
      userId: 7, sessionId: "s1", reportId: undefined, provider: "brave", model: "search", estimatedCostUsd: 0.005, purpose: "search",
    });
    expect(logFixedCostUsage).toHaveBeenNthCalledWith(2, {
      userId: 7, sessionId: "s1", reportId: undefined, provider: "tavily", model: "search", estimatedCostUsd: 0.008, purpose: "search",
    });
  });

  it("logs nothing on a cache hit (no upstream request was made)", async () => {
    providerState.brave.hits = [hit("https://a.example", "brave")];
    const { searchV2 } = await import("./index");
    await searchV2("cache me", {}, { userId: 1 });
    expect(logFixedCostUsage).toHaveBeenCalledTimes(1);
    logFixedCostUsage.mockClear();
    await searchV2("cache me", {}, { userId: 1 });
    expect(logFixedCostUsage).not.toHaveBeenCalled();
    expect(providerState.brave.calls).toBe(1); // still just the one real call
  });
});

describe("searchV2 caching", () => {
  it("serves an L1 (in-process) hit without calling any provider again", async () => {
    providerState.brave.hits = [hit("https://a.example", "brave")];
    const { searchV2 } = await import("./index");
    await searchV2("l1 query", {}, { userId: 1 });
    await searchV2("l1 query", {}, { userId: 1 });
    expect(providerState.brave.calls).toBe(1);
  });

  it("serves an L2 (kv_cache) hit when it exists, even if the in-process cache does not", async () => {
    kvStore.set(JSON.stringify({ q: "l2 query", k: undefined, recency: undefined, include: [], exclude: [], vertical: undefined, depth: "standard", providers: ["brave", "tavily", "sonar"] }), [
      { title: "cached", url: "https://cached.example", snippet: "", provider: "brave" },
    ]);
    const { searchV2 } = await import("./index");
    const hits = await searchV2("l2 query", {}, { userId: 1 });
    expect(hits[0].url).toBe("https://cached.example");
    expect(providerState.brave.calls).toBe(0);
  });

  it("does not cache when KEMMA_SEARCH_CACHE_TTL_SEC=0", async () => {
    process.env.KEMMA_SEARCH_CACHE_TTL_SEC = "0";
    providerState.brave.hits = [hit("https://a.example", "brave")];
    const { searchV2 } = await import("./index");
    await searchV2("no cache", {}, { userId: 1 });
    await searchV2("no cache", {}, { userId: 1 });
    expect(providerState.brave.calls).toBe(2);
  });
});
