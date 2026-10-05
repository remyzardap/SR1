import { describe, it, expect, vi, afterEach } from "vitest";
import { readWithFirecrawl } from "./firecrawl";
import { ReaderTierError } from "./jina";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FIRECRAWL_API_KEY;
});

describe("readWithFirecrawl", () => {
  it("throws when no API key is configured", async () => {
    await expect(readWithFirecrawl("https://example.com/x")).rejects.toBeInstanceOf(ReaderTierError);
  });

  it("posts to the scrape endpoint and returns markdown on success", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { markdown: "# Title\n\nBody.", metadata: { title: "Title", publishedTime: "2025-02-02T00:00:00Z" } } }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await readWithFirecrawl("https://example.com/article");
    expect(result.title).toBe("Title");
    expect(result.markdown).toContain("Body.");
    expect(result.publishedAt).toBe("2025-02-02T00:00:00Z");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(init.headers.Authorization).toBe("Bearer fc-key");
    expect(JSON.parse(init.body)).toMatchObject({ url: "https://example.com/article", formats: ["markdown"] });
  });

  it("throws a ReaderTierError with the status on a 403", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));
    await expect(readWithFirecrawl("https://example.com/x")).rejects.toMatchObject({ status: 403 });
  });

  it("throws when the response reports success:false", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error: "nope" }), { status: 200 })));
    await expect(readWithFirecrawl("https://example.com/x")).rejects.toThrow();
  });
});
