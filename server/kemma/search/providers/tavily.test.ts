import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildTavilyRequestBody, mapTavilyResponse, tavilyConfigured, tavilyProvider } from "./tavily";

const ENV = ["TAVILY_API_KEY"];
const saved = new Map<string, string | undefined>();
beforeEach(() => { for (const n of ENV) { saved.set(n, process.env[n]); delete process.env[n]; } });
afterEach(() => { for (const [n, v] of saved) if (v === undefined) delete process.env[n]; else process.env[n] = v; });

describe("buildTavilyRequestBody", () => {
  it("defaults to the general topic with no time_range", () => {
    const body = buildTavilyRequestBody("q", {});
    expect(body).toMatchObject({ query: "q", topic: "general", max_results: 10 });
    expect(body.time_range).toBeUndefined();
  });

  it("maps recency to time_range and vertical to the news topic", () => {
    expect(buildTavilyRequestBody("q", { recency: "week" }).time_range).toBe("week");
    expect(buildTavilyRequestBody("q", { vertical: "news" }).topic).toBe("news");
  });

  it("passes include/exclude domains through as-is", () => {
    const body = buildTavilyRequestBody("q", { includeDomains: ["a.com"], excludeDomains: ["b.com"] });
    expect(body.include_domains).toEqual(["a.com"]);
    expect(body.exclude_domains).toEqual(["b.com"]);
  });
});

describe("mapTavilyResponse", () => {
  it("maps results to SearchHit[]", () => {
    const hits = mapTavilyResponse({ results: [{ title: "A", url: "https://a.example", content: "c", published_date: "2024-01-01" }] });
    expect(hits).toEqual([{ title: "A", url: "https://a.example", snippet: "c", date: "2024-01-01", provider: "tavily" }]);
  });

  it("skips results without a url", () => {
    expect(mapTavilyResponse({ results: [{ title: "no url" }] })).toEqual([]);
  });
});

describe("tavilyProvider.search", () => {
  it("is unconfigured without a key and throws before fetching", async () => {
    expect(tavilyConfigured()).toBe(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(tavilyProvider.search("q", {})).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("posts the bearer token and maps the response", async () => {
    process.env.TAVILY_API_KEY = "k";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [{ title: "A", url: "https://a.example", content: "c" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const hits = await tavilyProvider.search("q", {});
    expect(hits[0].url).toBe("https://a.example");
    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe("https://api.tavily.com/search");
    expect(init.headers.Authorization).toBe("Bearer k");
    vi.unstubAllGlobals();
  });
});
