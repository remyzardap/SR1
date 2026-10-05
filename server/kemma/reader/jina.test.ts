import { describe, it, expect, vi, afterEach } from "vitest";
import { readWithJina, ReaderTierError } from "./jina";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.JINA_API_KEY;
});

describe("readWithJina", () => {
  it("fetches the reader endpoint and returns markdown content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { title: "Example", content: "# Example\n\nBody text.", publishedTime: "2025-01-01T00:00:00Z" } }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await readWithJina("https://example.com/article");
    expect(result.title).toBe("Example");
    expect(result.markdown).toContain("Body text.");
    expect(result.publishedAt).toBe("2025-01-01T00:00:00Z");
    expect(fetchMock.mock.calls[0][0]).toBe("https://r.jina.ai/https://example.com/article");
  });

  it("sends an Authorization header when an API key is configured", async () => {
    process.env.JINA_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { title: "T", content: "content" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await readWithJina("https://example.com/x");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBe("Bearer test-key");
  });

  it("omits the Authorization header without a key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { title: "T", content: "content" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await readWithJina("https://example.com/x");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("throws a ReaderTierError carrying the status on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));
    await expect(readWithJina("https://example.com/x")).rejects.toMatchObject({ status: 403 });
    await expect(readWithJina("https://example.com/x")).rejects.toBeInstanceOf(ReaderTierError);
  });

  it("throws when the response has no usable content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { title: "T", content: "" } }), { status: 200 })));
    await expect(readWithJina("https://example.com/x")).rejects.toThrow();
  });

  it("throws on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(readWithJina("https://example.com/x")).rejects.toBeInstanceOf(ReaderTierError);
  });
});
