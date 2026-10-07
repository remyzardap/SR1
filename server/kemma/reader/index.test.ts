import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => dns);

const kv = vi.hoisted(() => ({ kvGet: vi.fn(), kvSet: vi.fn() }));
vi.mock("../../core/kvCache", () => kv);

const dbMock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../../db", () => dbMock);

const jinaMock = vi.hoisted(() => ({ readWithJina: vi.fn() }));
vi.mock("./jina", async () => {
  const actual = await vi.importActual<typeof import("./jina")>("./jina");
  return { ...actual, readWithJina: jinaMock.readWithJina };
});

const firecrawlMock = vi.hoisted(() => ({ readWithFirecrawl: vi.fn() }));
vi.mock("./firecrawl", () => firecrawlMock);

const kemmaMaxMock = vi.hoisted(() => ({ browse: vi.fn(), browseWithAgent: vi.fn() }));
vi.mock("../kemmaMax", () => kemmaMaxMock);

import { readPage, canonicalizeUrl, SsrfBlockedError } from "./index";

const htmlRes = (body: string, init?: ResponseInit) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

const LONG_PARAGRAPH = Array.from({ length: 10 }, (_, i) => `This is sentence number ${i + 1} of a reasonably long test paragraph.`).join(" ");
const GOOD_ARTICLE = `<!doctype html><html><head><title>A Real Article</title></head><body><article><h1>A Real Article</h1><p>${LONG_PARAGRAPH}</p><p>${LONG_PARAGRAPH}</p></article></body></html>`;

beforeEach(() => {
  vi.clearAllMocks();
  dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  kv.kvGet.mockResolvedValue(null);
  kv.kvSet.mockResolvedValue(undefined);
  delete process.env.READER_FALLBACK;
  delete process.env.BROWSER_USE_API_KEY;
  delete process.env.JINA_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readPage SSRF guards", () => {
  it("refuses a literal private IP and never calls tier 2 or 3 even when configured", async () => {
    process.env.READER_FALLBACK = "jina";
    process.env.BROWSER_USE_API_KEY = "bu-key";
    await expect(readPage("http://169.254.169.254/latest/meta-data")).rejects.toThrow(SsrfBlockedError);
    expect(jinaMock.readWithJina).not.toHaveBeenCalled();
    expect(kemmaMaxMock.browseWithAgent).not.toHaveBeenCalled();
  });

  it("refuses a redirect that lands on a private address without calling tier 2 or 3", async () => {
    process.env.READER_FALLBACK = "jina";
    process.env.BROWSER_USE_API_KEY = "bu-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(redirect("http://127.0.0.1/admin")));
    await expect(readPage("https://good.example.com/start")).rejects.toThrow(SsrfBlockedError);
    expect(jinaMock.readWithJina).not.toHaveBeenCalled();
    expect(kemmaMaxMock.browseWithAgent).not.toHaveBeenCalled();
  });

  it("refuses a redirect to a private address even after public hops without escalating", async () => {
    process.env.READER_FALLBACK = "jina";
    process.env.BROWSER_USE_API_KEY = "bu-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirect("https://also-public.example.com/next"))
      .mockResolvedValueOnce(redirect("http://10.0.0.5/secret"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readPage("https://good.example.com/start")).rejects.toThrow(SsrfBlockedError);
    expect(jinaMock.readWithJina).not.toHaveBeenCalled();
    expect(kemmaMaxMock.browseWithAgent).not.toHaveBeenCalled();
  });

  it("refuses a file: URL on standard and interactive paths without escalating", async () => {
    process.env.READER_FALLBACK = "jina";
    process.env.BROWSER_USE_API_KEY = "bu-key";
    await expect(readPage("file:///etc/passwd")).rejects.toThrow(SsrfBlockedError);
    await expect(readPage("file:///etc/passwd", { interactive: true })).rejects.toThrow(SsrfBlockedError);
    expect(jinaMock.readWithJina).not.toHaveBeenCalled();
    expect(kemmaMaxMock.browseWithAgent).not.toHaveBeenCalled();
  });

  it("refuses a private IP on interactive path without calling tier 3", async () => {
    process.env.BROWSER_USE_API_KEY = "bu-key";
    await expect(readPage("http://127.0.0.1:8080/dashboard", { interactive: true })).rejects.toThrow(SsrfBlockedError);
    expect(kemmaMaxMock.browseWithAgent).not.toHaveBeenCalled();
  });

  it("stops after too many redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(redirect("https://good.example.com/loop"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readPage("https://good.example.com/start")).rejects.toThrow(/redirect/i);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
  });
});

describe("readPage abort cancellation", () => {
  it("rejects immediately on pre-aborted signal without fetching or calling tier 2/3", async () => {
    process.env.READER_FALLBACK = "jina";
    process.env.BROWSER_USE_API_KEY = "bu-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(readPage("https://good.example.com/page", { signal: controller.signal })).rejects.toThrow(/abort/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(jinaMock.readWithJina).not.toHaveBeenCalled();
    expect(kemmaMaxMock.browseWithAgent).not.toHaveBeenCalled();
  });

  it("rejects when aborted mid-tier-1 without escalating to tier 2 or tier 3", async () => {
    process.env.READER_FALLBACK = "jina";
    process.env.BROWSER_USE_API_KEY = "bu-key";
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        controller.abort();
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      })
    );

    await expect(readPage("https://good.example.com/page", { signal: controller.signal })).rejects.toThrow(/abort/i);
    expect(jinaMock.readWithJina).not.toHaveBeenCalled();
    expect(kemmaMaxMock.browseWithAgent).not.toHaveBeenCalled();
  });
});

describe("readPage tier 1", () => {
  it("reads a normal HTML page and returns markdown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlRes(GOOD_ARTICLE)));
    const result = await readPage("https://good.example.com/article");
    expect(result.tier).toBe(1);
    expect(result.title).toContain("A Real Article");
    expect(result.markdown).toContain("sentence number 1");
    expect(result.truncated).toBe(false);
  });

  it("caches the page under its canonical url", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlRes(GOOD_ARTICLE)));
    await readPage("https://good.example.com/article?utm_source=newsletter");
    expect(kv.kvSet).toHaveBeenCalledWith("page", canonicalizeUrl("https://good.example.com/article?utm_source=newsletter"), expect.anything(), 86400);
  });
});

describe("readPage cache", () => {
  it("returns the cached page without fetching again", async () => {
    kv.kvGet.mockResolvedValue({ finalUrl: "https://good.example.com/cached", title: "Cached", markdown: LONG_PARAGRAPH, tier: 1 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await readPage("https://good.example.com/cached");
    expect(result.title).toBe("Cached");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches under both canonical URL and requested URL on redirects/canonical links", async () => {
    const articleWithCanonical = `<!doctype html><html><head><title>A Real Article</title><link rel="canonical" href="https://good.example.com/real-article" /></head><body><article><h1>A Real Article</h1><p>${LONG_PARAGRAPH}</p></article></body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlRes(articleWithCanonical)));

    await readPage("https://good.example.com/shortlink");

    expect(kv.kvSet).toHaveBeenCalledWith(
      "page",
      canonicalizeUrl("https://good.example.com/real-article"),
      expect.objectContaining({ finalUrl: "https://good.example.com/real-article" }),
      86400
    );
    expect(kv.kvSet).toHaveBeenCalledWith(
      "page",
      canonicalizeUrl("https://good.example.com/shortlink"),
      expect.objectContaining({ finalUrl: "https://good.example.com/real-article" }),
      86400
    );
  });

  it("does not use the cache for interactive reads", async () => {
    kv.kvGet.mockResolvedValue({ finalUrl: "https://good.example.com/cached", title: "Cached", markdown: "x", tier: 1 });
    kemmaMaxMock.browseWithAgent.mockResolvedValue({ title: "Fresh", content: "fresh content" });
    const result = await readPage("https://good.example.com/cached", { interactive: true });
    expect(result.title).toBe("Fresh");
    expect(kv.kvGet).not.toHaveBeenCalled();
    expect(kemmaMaxMock.browseWithAgent).toHaveBeenCalledWith("https://good.example.com/cached", {
      extractText: true,
      maxLength: 50_000,
      interactive: true,
    });
  });
});

describe("readPage escalation", () => {
  it("escalates on a 403 and uses tier 2 when configured", async () => {
    process.env.READER_FALLBACK = "jina";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));
    jinaMock.readWithJina.mockResolvedValue({ title: "Tier2 Title", markdown: LONG_PARAGRAPH });

    const result = await readPage("https://blocked.example.com/page");
    expect(result.tier).toBe(2);
    expect(result.title).toBe("Tier2 Title");
  });

  it("escalates when the extracted text is under 400 characters", async () => {
    process.env.READER_FALLBACK = "jina";
    const thin = `<html><body><p>Too short.</p></body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlRes(thin)));
    jinaMock.readWithJina.mockResolvedValue({ title: "T", markdown: LONG_PARAGRAPH });
    const result = await readPage("https://thin.example.com/page");
    expect(result.tier).toBe(2);
  });

  it("escalates on a JS-app-shell page", async () => {
    process.env.READER_FALLBACK = "jina";
    const shell = `<html><head><script id="__NEXT_DATA__">{}</script></head><body><div id="root"></div></body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlRes(shell)));
    jinaMock.readWithJina.mockResolvedValue({ title: "T", markdown: LONG_PARAGRAPH });
    const result = await readPage("https://spa.example.com/app");
    expect(result.tier).toBe(2);
  });

  it("escalates on a fetch error", async () => {
    process.env.READER_FALLBACK = "jina";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    jinaMock.readWithJina.mockResolvedValue({ title: "T", markdown: LONG_PARAGRAPH });
    const result = await readPage("https://down.example.com/page");
    expect(result.tier).toBe(2);
  });

  it("escalates to tier 3 when tier 1 and tier 2 both fail and browser-use is configured", async () => {
    process.env.BROWSER_USE_API_KEY = "bu-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));
    kemmaMaxMock.browseWithAgent.mockResolvedValue({ title: "Agent Title", content: "agent content" });

    const result = await readPage("https://blocked.example.com/page");
    expect(result.tier).toBe(3);
    expect(result.title).toBe("Agent Title");
  });

  it("throws when every tier is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));
    await expect(readPage("https://blocked.example.com/page")).rejects.toThrow();
  });
});

describe("readPage query-focused selection", () => {
  it("truncates and keeps truncated:false when the content fits", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlRes(GOOD_ARTICLE)));
    const result = await readPage("https://good.example.com/article", { maxChars: 100_000 });
    expect(result.truncated).toBe(false);
  });

  it("marks truncated:true and keeps the query-relevant part when content is cut down", async () => {
    const big = Array.from({ length: 40 }, (_, i) => `<p>Filler paragraph ${i}. ${LONG_PARAGRAPH}</p>`).join("\n");
    const html = `<!doctype html><html><head><title>Big Page</title></head><body><article><h1>Big</h1>${big}<h2>Pricing</h2><p>Unique pricing marker term appears here. ${LONG_PARAGRAPH}</p></article></body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlRes(html)));
    const result = await readPage("https://good.example.com/big", { query: "unique pricing marker term", maxChars: 4000 });
    expect(result.truncated).toBe(true);
    expect(result.markdown).toContain("pricing marker term");
  });
});

describe("usage logging", () => {
  function fakeDb() {
    const insert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    return { insert };
  }

  it("writes a usage row for a tier 2 read when userId is given", async () => {
    process.env.READER_FALLBACK = "jina";
    const db = fakeDb();
    dbMock.getDb.mockResolvedValue(db);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));
    jinaMock.readWithJina.mockResolvedValue({ title: "T", markdown: LONG_PARAGRAPH });

    await readPage("https://blocked.example.com/page", { userId: 42 });
    expect(db.insert).toHaveBeenCalled();
  });

  it("writes no usage row when userId is omitted", async () => {
    process.env.READER_FALLBACK = "jina";
    const db = fakeDb();
    dbMock.getDb.mockResolvedValue(db);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));
    jinaMock.readWithJina.mockResolvedValue({ title: "T", markdown: LONG_PARAGRAPH });

    await readPage("https://blocked.example.com/page");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("writes no usage row for a tier 1 read", async () => {
    const db = fakeDb();
    dbMock.getDb.mockResolvedValue(db);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlRes(GOOD_ARTICLE)));
    await readPage("https://good.example.com/article", { userId: 42 });
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("canonicalizeUrl", () => {
  it("lowercases the host, strips tracking params, fragment and trailing slash", () => {
    expect(canonicalizeUrl("https://Example.COM/Path/?utm_source=x&b=2&a=1#frag")).toBe("https://example.com/Path?a=1&b=2");
  });

  it("treats a trailing slash and no trailing slash the same", () => {
    expect(canonicalizeUrl("https://example.com/path/")).toBe(canonicalizeUrl("https://example.com/path"));
  });
});
