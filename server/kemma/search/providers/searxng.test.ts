import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSearxngRequestUrl, mapSearxngResponse, searxngConfigured, searxngProvider, searxngUrl } from "./searxng";

const ENV = ["SEARXNG_URL"];
const saved = new Map<string, string | undefined>();
beforeEach(() => { for (const n of ENV) { saved.set(n, process.env[n]); delete process.env[n]; } });
afterEach(() => { for (const [n, v] of saved) if (v === undefined) delete process.env[n]; else process.env[n] = v; });

describe("searxngUrl / searxngConfigured", () => {
  it("strips a trailing slash and is unconfigured when empty", () => {
    expect(searxngConfigured()).toBe(false);
    process.env.SEARXNG_URL = "https://searx.example/";
    expect(searxngUrl()).toBe("https://searx.example");
    expect(searxngConfigured()).toBe(true);
  });
});

describe("buildSearxngRequestUrl", () => {
  it("requests JSON and maps recency to a supported time_range (week falls to day)", () => {
    expect(buildSearxngRequestUrl("https://searx.example", "q", {})).toContain("format=json");
    expect(buildSearxngRequestUrl("https://searx.example", "q", { recency: "day" })).toContain("time_range=day");
    expect(buildSearxngRequestUrl("https://searx.example", "q", { recency: "week" })).toContain("time_range=day");
    expect(buildSearxngRequestUrl("https://searx.example", "q", { recency: "year" })).toContain("time_range=year");
  });

  it("sets the news category for the news vertical", () => {
    expect(buildSearxngRequestUrl("https://searx.example", "q", { vertical: "news" })).toContain("categories=news");
  });
});

describe("mapSearxngResponse", () => {
  const raw = {
    results: [
      { title: "A", url: "https://a.example/page", content: "c1", publishedDate: "2024-01-01" },
      { title: "B", url: "https://sub.b.example/page", content: "c2" },
    ],
  };

  it("maps results to SearchHit[]", () => {
    expect(mapSearxngResponse(raw)).toEqual([
      { title: "A", url: "https://a.example/page", snippet: "c1", date: "2024-01-01", provider: "searxng" },
      { title: "B", url: "https://sub.b.example/page", snippet: "c2", provider: "searxng" },
    ]);
  });

  it("applies include-domain filtering (subdomains count) since SearXNG has no native param", () => {
    const hits = mapSearxngResponse(raw, { includeDomains: ["b.example"] });
    expect(hits.map((h) => h.url)).toEqual(["https://sub.b.example/page"]);
  });

  it("applies exclude-domain filtering", () => {
    const hits = mapSearxngResponse(raw, { excludeDomains: ["a.example"] });
    expect(hits.map((h) => h.url)).toEqual(["https://sub.b.example/page"]);
  });
});

describe("searxngProvider.search", () => {
  it("throws without SEARXNG_URL configured", async () => {
    await expect(searxngProvider.search("q", {})).rejects.toThrow(/not configured/);
  });

  it("makes an unauthenticated GET request", async () => {
    process.env.SEARXNG_URL = "https://searx.example";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await searxngProvider.search("q", {});
    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toContain("https://searx.example/search?");
    expect(init.headers.Authorization).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
