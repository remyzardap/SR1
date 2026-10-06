import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildExaRequestBody, exaConfigured, exaProvider, mapExaResponse } from "./exa";

const ENV = ["EXA_API_KEY"];
const saved = new Map<string, string | undefined>();
beforeEach(() => { for (const n of ENV) { saved.set(n, process.env[n]); delete process.env[n]; } });
afterEach(() => { for (const [n, v] of saved) if (v === undefined) delete process.env[n]; else process.env[n] = v; });

const NOW = new Date("2024-06-10T00:00:00Z").getTime();

describe("buildExaRequestBody", () => {
  it("defaults to type auto with no date filter", () => {
    const body = buildExaRequestBody("q", {}, NOW);
    expect(body).toMatchObject({ query: "q", type: "auto", numResults: 10 });
    expect(body.startPublishedDate).toBeUndefined();
  });

  it("maps recency to a startPublishedDate and vertical to the news category", () => {
    const body = buildExaRequestBody("q", { recency: "day" }, NOW);
    expect(body.startPublishedDate).toBe(new Date(NOW - 24 * 60 * 60 * 1000).toISOString());
    expect(buildExaRequestBody("q", { vertical: "news" }, NOW).category).toBe("news");
  });

  it("passes include/exclude domains through", () => {
    const body = buildExaRequestBody("q", { includeDomains: ["a.com"], excludeDomains: ["b.com"] }, NOW);
    expect(body.includeDomains).toEqual(["a.com"]);
    expect(body.excludeDomains).toEqual(["b.com"]);
  });
});

describe("mapExaResponse", () => {
  it("maps results, preferring text over highlights for the snippet", () => {
    const hits = mapExaResponse({ results: [{ title: "A", url: "https://a.example", text: "full text", highlights: ["h"], publishedDate: "2024-01-01" }] });
    expect(hits).toEqual([{ title: "A", url: "https://a.example", snippet: "full text", date: "2024-01-01", provider: "exa" }]);
  });

  it("falls back to the first highlight when there is no text", () => {
    const hits = mapExaResponse({ results: [{ url: "https://a.example", highlights: ["h1"] }] });
    expect(hits[0].snippet).toBe("h1");
  });
});

describe("exaProvider.search", () => {
  it("is unconfigured without a key", async () => {
    expect(exaConfigured()).toBe(false);
    await expect(exaProvider.search("q", {})).rejects.toThrow(/not configured/);
  });

  it("sends the x-api-key header", async () => {
    process.env.EXA_API_KEY = "k";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [{ url: "https://a.example" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await exaProvider.search("q", {});
    const [, init] = fetchMock.mock.calls[0] as [string, any];
    expect(init.headers["x-api-key"]).toBe("k");
    vi.unstubAllGlobals();
  });
});
