import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import { LlmUnavailableError, complete, resolveRoutes, stream } from "./fnLlm";

const route = (model: string, apiKey: string) => ({
  model,
  provider: "qwen",
  baseUrl: "https://llm.example/v1",
  apiKey,
  label: `${model} (qwen)`,
});

const json = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => "" }) as never;

/** A response body that hands out the chunks, then optionally dies mid-stream. */
const sse = (chunks: string[], failWith?: Error) => {
  const encoder = new TextEncoder();
  let i = 0;
  const read = async () => {
    if (failWith && i >= chunks.length) throw failWith;
    if (i >= chunks.length) return { done: true, value: undefined as undefined };
    return { done: false, value: encoder.encode(chunks[i++]) };
  };
  return ({ ok: true, status: 200, body: { getReader: () => ({ read }) }, text: async () => "" }) as never;
};

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

const options = { userId: 7, purpose: "test_purpose" };

beforeEach(() => {
  vi.clearAllMocks();
  router.routeHasAuth.mockImplementation((route: { apiKey?: string; authKind?: string }) => route.authKind === "vertex" || !!route.apiKey);
  router.resolveRouteAuth.mockImplementation(async (route: { baseUrl: string; model: string; apiKey: string }) => ({
    baseUrl: route.baseUrl,
    model: route.model,
    auth: route.apiKey,
  }));
  router.chatRoute.mockReturnValue(route("chat-model", "k"));
  router.longDocRoute.mockReturnValue(route("long-model", "k"));
  router.fallbackRoutes.mockReturnValue([route("chat-model", "k"), route("backup-model", "b")]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveRoutes", () => {
  it("keeps only routes with a key and drops duplicate models", () => {
    router.fallbackRoutes.mockReturnValue([route("chat-model", "k"), route("chat-model", "k"), route("other", "")]);
    expect(resolveRoutes("chat").map((r) => r.model)).toEqual(["chat-model"]);
  });

  it("starts at the requested slot", () => {
    expect(resolveRoutes("longDoc")[0].model).toBe("long-model");
  });

  it("says nothing is configured when no route has a key", () => {
    router.chatRoute.mockReturnValue(route("chat-model", ""));
    router.fallbackRoutes.mockReturnValue([route("chat-model", ""), route("backup-model", "")]);
    expect(resolveRoutes("chat")).toEqual([]);
  });
});

describe("complete", () => {
  it("posts to the chat completions endpoint and returns the text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({ choices: [{ message: { content: '[{"type":"fact"}]' } }], usage: { prompt_tokens: 10, completion_tokens: 4 } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await complete([{ role: "user", content: "hi" }], options);
    expect(out.text).toBe('[{"type":"fact"}]');
    expect(fetchMock.mock.calls[0][0]).toBe("https://llm.example/v1/chat/completions");
    expect(bodyOf(fetchMock.mock.calls[0])).toMatchObject({ model: "chat-model", stream: false });
    expect(usage.logUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, purpose: "test_purpose", inputTokens: 10, outputTokens: 4 }));
  });

  it("keeps Vertex reasoning tokens in the output count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({
      choices: [{ message: { content: "thinking" } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 6 } },
    })));

    const out = await complete([{ role: "user", content: "hi" }], options);
    expect(out.outputTokens).toBe(10);
    expect(usage.logUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 10, outputTokens: 10 }));
  });

  it("tries the next route when the first one fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "busy" } as never)
      .mockResolvedValueOnce(json({ choices: [{ message: { content: "from the backup" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await complete([{ role: "user", content: "hi" }], options);
    expect(out.text).toBe("from the backup");
    expect(out.model).toBe("backup-model");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when nothing is configured", async () => {
    router.fallbackRoutes.mockReturnValue([]);
    router.chatRoute.mockReturnValue(route("chat-model", ""));
    await expect(complete([{ role: "user", content: "hi" }], options)).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("uses the resolved Vertex base URL and bearer token", async () => {
    const vertexRoute = { ...route("gemini-3.8-flash", ""), provider: "gemini" as const, authKind: "vertex" as const };
    router.chatRoute.mockReturnValue(vertexRoute);
    router.fallbackRoutes.mockReturnValue([]);
    router.resolveRouteAuth.mockImplementation(async (r: { baseUrl: string; model: string; auth?: string }) => ({
      baseUrl: "https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi",
      model: `google/${r.model}`,
      auth: "vertex-token",
    }));

    const fetchMock = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: "from vertex" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await complete([{ role: "user", content: "hi" }], options);
    expect(out.text).toBe("from vertex");
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer vertex-token");
    expect(JSON.parse(init.body).model).toBe("google/gemini-3.8-flash");
  });
});

describe("stream", () => {
  const delta = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

  it("hands every delta to the caller and returns the whole text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([delta("## Overview\n"), delta("It grew. "), ": keep-alive\n\n", "data: [DONE]\n\n"])));

    const received: string[] = [];
    const out = await stream([{ role: "user", content: "hi" }], options, (t) => received.push(t));
    expect(received).toEqual(["## Overview\n", "It grew. "]);
    expect(out.text).toBe("## Overview\nIt grew. ");
    expect(bodyOf(vi.mocked(fetch).mock.calls[0])).toMatchObject({ model: "chat-model", stream: true });
  });

  it("does not restart on a fallback once tokens have reached the client", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sse([delta("half an answer")], new Error("connection reset")))
      .mockResolvedValue(json({ choices: [{ message: { content: "duplicate" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const received: string[] = [];
    await expect(stream([{ role: "user", content: "hi" }], options, (t) => received.push(t))).rejects.toThrow("connection reset");
    expect(received).toEqual(["half an answer"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls through while nothing has been sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" } as never)
        .mockResolvedValueOnce(sse([delta("clean answer")]))
    );

    const received: string[] = [];
    const out = await stream([{ role: "user", content: "hi" }], options, (t) => received.push(t));
    expect(out.text).toBe("clean answer");
    expect(received).toEqual(["clean answer"]);
  });
});
