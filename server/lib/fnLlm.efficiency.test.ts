import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// fnLlm request efficiency: same-route retry before falling through, metered streams, cached-token
// accounting, and the stream_options fallback. Mocked router and usage; no network.

const router = vi.hoisted(() => ({
  chatRoute: vi.fn(),
  longDocRoute: vi.fn(),
  fallbackRoutes: vi.fn(),
  routeHasAuth: vi.fn((route: { apiKey?: string; authKind?: string }) => route.authKind === "vertex" || !!route.apiKey),
  resolveRouteAuth: vi.fn((route: { baseUrl: string; model: string; apiKey: string }) =>
    Promise.resolve({ baseUrl: route.baseUrl, model: route.model, auth: route.apiKey })
  ),
}));
const usage = vi.hoisted(() => ({ logUsage: vi.fn() }));

vi.mock("../core/kemmaRouter", () => router);
vi.mock("../core/usage", () => usage);

import { complete, stream } from "./fnLlm";

const route = (model: string, provider = "qwen") => ({
  model, provider, baseUrl: "https://llm.example/v1", apiKey: "k", label: `${model} (${provider})`, authKind: "api_key",
});
const options = { userId: 7, purpose: "test" };
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const enc = new TextEncoder();
const sseRes = (chunks: string[]) =>
  new Response(new ReadableStream<Uint8Array>({ start(c) { chunks.forEach((x) => c.enqueue(enc.encode(x))); c.close(); } }), { status: 200 });
const frame = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
const usageFrame = (u: unknown) => `data: ${JSON.stringify({ choices: [], usage: u })}\n\n`;
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

beforeEach(() => {
  vi.clearAllMocks();
  router.chatRoute.mockReturnValue(route("primary"));
  router.longDocRoute.mockReturnValue(route("primary"));
  router.fallbackRoutes.mockReturnValue([route("backup")]);
  vi.stubEnv("KEMMA_HTTP_ATTEMPTS", "2");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("fnLlm retry", () => {
  it("retries a 503 on the same route before using the fallback route", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: "recovered" } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await complete([{ role: "user", content: "hi" }], options);
    expect(out.text).toBe("recovered");
    expect(out.model).toBe("primary");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls through to the next route when the first stays down", async () => {
    const fetchMock = vi.fn(async (_u: unknown, init: any) =>
      JSON.parse(init.body).model === "primary" ? new Response("down", { status: 503 }) : jsonRes({ choices: [{ message: { content: "from backup" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await complete([{ role: "user", content: "hi" }], options);
    expect(out.model).toBe("backup");
    expect(fetchMock.mock.calls.filter((c) => bodyOf(c as unknown[]).model === "primary")).toHaveLength(2);
  });
});

describe("fnLlm usage", () => {
  it("logs cached prompt tokens from a normal completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 5000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 4000 } },
    })));
    const out = await complete([{ role: "user", content: "hi" }], options);
    expect(out.inputTokens).toBe(5000);
    expect(usage.logUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 5000, outputTokens: 200, cachedInputTokens: 4000 }));
  });

  it("asks Qwen for a usage chunk on streams and meters the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseRes([frame("a"), usageFrame({ prompt_tokens: 40, completion_tokens: 8 }), "data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    const out = await stream([{ role: "user", content: "hi" }], options, () => {});
    expect(bodyOf(fetchMock.mock.calls[0]).stream_options).toEqual({ include_usage: true });
    expect(out).toMatchObject({ text: "a", inputTokens: 40, outputTokens: 8 });
    expect(usage.logUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 40, outputTokens: 8 }));
  });

  it("does not send stream_options to providers outside the known-good list", async () => {
    router.chatRoute.mockReturnValue(route("g", "gemini"));
    router.fallbackRoutes.mockReturnValue([]);
    const fetchMock = vi.fn().mockResolvedValue(sseRes([frame("a"), "data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    await stream([{ role: "user", content: "hi" }], options, () => {});
    expect(bodyOf(fetchMock.mock.calls[0]).stream_options).toBeUndefined();
  });

  it("retries once without stream_options when the provider rejects it, on the same route", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('unknown field "stream_options"', { status: 400 }))
      .mockResolvedValueOnce(sseRes([frame("ok"), "data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    const out = await stream([{ role: "user", content: "hi" }], options, () => {});
    expect(out.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[1]).stream_options).toBeUndefined();
    expect(bodyOf(fetchMock.mock.calls[1]).model).toBe("primary");
  });

  it("surfaces an unrelated 400 instead of retrying it", async () => {
    router.fallbackRoutes.mockReturnValue([]);
    const fetchMock = vi.fn().mockResolvedValue(new Response("prompt too long", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(stream([{ role: "user", content: "hi" }], options, () => {})).rejects.toThrow(/400.*prompt too long/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
