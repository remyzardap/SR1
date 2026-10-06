import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildPerplexitySearchRequestBody,
  mapPerplexitySearchResponse,
  perplexitySearchConfigured,
  perplexitySearchProvider,
} from "./perplexity";

const ENV = ["PERPLEXITY_API_KEY", "SONAR_API_KEY"];
const saved = new Map<string, string | undefined>();
beforeEach(() => { for (const n of ENV) { saved.set(n, process.env[n]); delete process.env[n]; } });
afterEach(() => { for (const [n, v] of saved) if (v === undefined) delete process.env[n]; else process.env[n] = v; });

describe("buildPerplexitySearchRequestBody", () => {
  it("maps recency to search_recency_filter", () => {
    expect(buildPerplexitySearchRequestBody("q", { recency: "month" }).search_recency_filter).toBe("month");
  });

  it("folds include/exclude domains into search_domain_filter, excludes prefixed with -", () => {
    const body = buildPerplexitySearchRequestBody("q", { includeDomains: ["a.com"], excludeDomains: ["b.com"] });
    expect(body.search_domain_filter).toEqual(["a.com", "-b.com"]);
  });

  it("omits search_domain_filter when no domains are given", () => {
    expect(buildPerplexitySearchRequestBody("q", {}).search_domain_filter).toBeUndefined();
  });
});

describe("mapPerplexitySearchResponse", () => {
  it("maps the results-only response shape", () => {
    const hits = mapPerplexitySearchResponse({ results: [{ title: "A", url: "https://a.example", snippet: "s", date: "2024-01-01" }] });
    expect(hits).toEqual([{ title: "A", url: "https://a.example", snippet: "s", date: "2024-01-01", provider: "perplexity" }]);
  });

  it("treats a null date as absent", () => {
    const hits = mapPerplexitySearchResponse({ results: [{ url: "https://a.example", date: null }] });
    expect(hits[0].date).toBeUndefined();
  });
});

describe("perplexitySearchProvider.search", () => {
  it("falls back to SONAR_API_KEY when PERPLEXITY_API_KEY is unset, and is unconfigured with neither", async () => {
    expect(perplexitySearchConfigured()).toBe(false);
    process.env.SONAR_API_KEY = "s";
    expect(perplexitySearchConfigured()).toBe(true);
  });

  it("posts to the results-only endpoint with a bearer token", async () => {
    process.env.PERPLEXITY_API_KEY = "p";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await perplexitySearchProvider.search("q", {});
    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe("https://api.perplexity.ai/search");
    expect(init.headers.Authorization).toBe("Bearer p");
    vi.unstubAllGlobals();
  });
});
