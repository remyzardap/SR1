import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { braveApiKey, braveConfigured, braveProvider, buildBraveRequestUrl, mapBraveResponse } from "./brave";

const ENV = ["BRAVE_SEARCH_API_KEY", "SEARCH_COST_BRAVE", "KEMMA_SEARCH_RPM", "KEMMA_SEARCH_RPM_BRAVE"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const n of ENV) {
    saved.set(n, process.env[n]);
    delete process.env[n];
  }
});
afterEach(() => {
  for (const [n, v] of saved) if (v === undefined) delete process.env[n]; else process.env[n] = v;
});

describe("brave configuration", () => {
  it("is configured only with BRAVE_SEARCH_API_KEY set", () => {
    expect(braveConfigured()).toBe(false);
    process.env.BRAVE_SEARCH_API_KEY = "k";
    expect(braveConfigured()).toBe(true);
    expect(braveApiKey()).toBe("k");
  });
});

describe("buildBraveRequestUrl", () => {
  it("builds the web endpoint with count and no freshness by default", () => {
    const url = buildBraveRequestUrl("solar tariffs", {});
    expect(url).toContain("https://api.search.brave.com/res/v1/web/search?");
    expect(url).toContain("q=solar+tariffs");
    expect(url).toContain("count=10");
    expect(url).not.toContain("freshness");
  });

  it("maps recency to Brave's freshness codes", () => {
    expect(buildBraveRequestUrl("q", { recency: "day" })).toContain("freshness=pd");
    expect(buildBraveRequestUrl("q", { recency: "week" })).toContain("freshness=pw");
    expect(buildBraveRequestUrl("q", { recency: "month" })).toContain("freshness=pm");
    expect(buildBraveRequestUrl("q", { recency: "year" })).toContain("freshness=py");
  });

  it("switches to the news endpoint for the news vertical", () => {
    const url = buildBraveRequestUrl("q", { vertical: "news" });
    expect(url).toContain("/news/search?");
  });

  it("folds include/exclude domains into the query with site: operators", () => {
    const url = buildBraveRequestUrl("q", { includeDomains: ["a.com", "b.com"], excludeDomains: ["c.com"] });
    const decoded = decodeURIComponent(url.split("q=")[1].split("&")[0].replace(/\+/g, " "));
    expect(decoded).toContain("site:a.com OR site:b.com");
    expect(decoded).toContain("-site:c.com");
  });

  it("clamps count to Brave's 1-20 range", () => {
    expect(buildBraveRequestUrl("q", { k: 0 })).toContain("count=1");
    expect(buildBraveRequestUrl("q", { k: 99 })).toContain("count=20");
  });
});

describe("mapBraveResponse", () => {
  it("maps web.results to SearchHit[]", () => {
    const hits = mapBraveResponse({
      web: { results: [{ title: "A", url: "https://a.example", description: "desc a", page_age: "2024-05-01" }] },
    });
    expect(hits).toEqual([{ title: "A", url: "https://a.example", snippet: "desc a", date: "2024-05-01", provider: "brave" }]);
  });

  it("falls back to news.results and bare results, and skips entries without a url", () => {
    expect(mapBraveResponse({ news: { results: [{ title: "N", url: "https://n.example", description: "d" }] } })).toHaveLength(1);
    expect(mapBraveResponse({ results: [{ title: "N2", url: "https://n2.example" }] })).toHaveLength(1);
    expect(mapBraveResponse({ web: { results: [{ title: "no url" }] } })).toEqual([]);
  });

  it("falls back to the URL as title when a result has none", () => {
    const hits = mapBraveResponse({ web: { results: [{ url: "https://no-title.example" }] } });
    expect(hits[0].title).toBe("https://no-title.example");
  });
});

describe("braveProvider.search", () => {
  it("throws a plain error without a key, before calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(braveProvider.search("q", {})).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("sends the subscription token header and maps a successful response", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "k";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ web: { results: [{ title: "A", url: "https://a.example", description: "d" }] } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hits = await braveProvider.search("q", {});
    expect(hits).toEqual([{ title: "A", url: "https://a.example", snippet: "d", provider: "brave" }]);
    const [, init] = fetchMock.mock.calls[0] as [string, any];
    expect(init.headers["X-Subscription-Token"]).toBe("k");
    vi.unstubAllGlobals();
  });

  it("throws on a non-2xx response without leaking the body", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "k";
    process.env.KEMMA_HTTP_ATTEMPTS = "1";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret internal detail", { status: 500 })));
    await expect(braveProvider.search("q", {})).rejects.toThrow(/status 500/);
    vi.unstubAllGlobals();
    delete process.env.KEMMA_HTTP_ATTEMPTS;
  });

  it("costPerRequestUsd reads SEARCH_COST_BRAVE at call time", () => {
    process.env.SEARCH_COST_BRAVE = "0.123";
    expect(braveProvider.costPerRequestUsd).toBe(0.123);
    process.env.SEARCH_COST_BRAVE = "0.456";
    expect(braveProvider.costPerRequestUsd).toBe(0.456);
  });
});
