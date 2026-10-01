/**
 * Audit tests (area 3): the provider shapes server/lib/fnLlm.ts has to survive, and the
 * bytes a streaming function then puts on the wire. fnLlm.test.ts covers the happy path,
 * the fallback chain and the Vertex resolution; these cover the tail of a stream, the
 * frames it cannot parse, and the usage it throws away.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const router = vi.hoisted(() => ({
  chatRoute: vi.fn(),
  longDocRoute: vi.fn(),
  fallbackRoutes: vi.fn(),
  routeHasAuth: vi.fn(),
  resolveRouteAuth: vi.fn(),
}));
const usage = vi.hoisted(() => ({ logUsage: vi.fn() }));

vi.mock("../core/kemmaRouter", () => router);
vi.mock("../core/usage", () => usage);

import { complete, stream } from "./fnLlm";

const route = (model: string, extra?: Partial<Parameters<typeof router.chatRoute>[0]>) => ({
  model,
  provider: "qwen" as const,
  baseUrl: "https://llm.example/v1",
  apiKey: "k",
  label: `${model} (qwen)`,
  ...extra,
});

const options = { userId: 7, purpose: "test_purpose" };

/** A response body that hands out raw text blocks and then closes the stream. */
const sseBody = (blocks: string[]) => {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => (i < blocks.length ? { done: false, value: encoder.encode(blocks[i++]) } : { done: true, value: undefined }),
      }),
    },
    text: async () => blocks.join(""),
  } as never;
};

const frame = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => "" }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  router.routeHasAuth.mockImplementation((r: { apiKey?: string; authKind?: string }) => r.authKind === "vertex" || !!r.apiKey);
  router.resolveRouteAuth.mockImplementation(async (r: { baseUrl: string; model: string; apiKey: string }) => ({
    baseUrl: r.baseUrl,
    model: r.model,
    auth: r.apiKey,
  }));
  router.chatRoute.mockReturnValue(route("chat-model"));
  router.longDocRoute.mockReturnValue(route("long-model"));
  router.fallbackRoutes.mockReturnValue([route("chat-model")]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the end of a streamed answer", () => {
  it("delivers the last delta when the provider closes without a trailing newline", async () => {
    // A cut-off stream, or a server that ends right after the payload: the closing
    // newline never arrives, so the last line sits in the parse buffer unparsed.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseBody([frame("visible body. "), `data: ${JSON.stringify({ choices: [{ delta: { content: "lost tail" } }] })}`])));

    const received: string[] = [];
    const out = await stream([{ role: "user", content: "hi" }], options, (t) => received.push(t));
    expect(received).toEqual(["visible body. ", "lost tail"]);
    expect(out.text).toBe("visible body. lost tail");
  });

  it("reassembles a frame split inside the JSON payload", async () => {
    const whole = frame("split across chunks");
    const cut = Math.floor(whole.length / 2);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseBody([whole.slice(0, cut), whole.slice(cut), "data: [DONE]\n\n"])));

    const received: string[] = [];
    await stream([{ role: "user", content: "hi" }], options, (t) => received.push(t));
    expect(received.join("")).toBe("split across chunks");
  });

  it("refuses a 200 body that carries no data lines instead of calling it an answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseBody(['{"choices":[{"message":{"content":"answered anyway"}}]}'])));
    await expect(stream([{ role: "user", content: "hi" }], options, () => {})).rejects.toThrow("Empty LLM response");
  });

  it("drops reasoning deltas and a null content frame, so a thinking-only answer fails", async () => {
    // Vertex streams thinking as delta.reasoning_content. Nothing reads it, so a model
    // that runs out of budget while thinking reaches the client as an error frame.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseBody([
          `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "thinking hard" } }] })}\n\n`,
          `data: ${JSON.stringify({ choices: [{ delta: { content: null }, finish_reason: "length" }] })}\n\n`,
          "data: [DONE]\n\n",
        ])
      )
    );
    await expect(stream([{ role: "user", content: "hi" }], options, () => {})).rejects.toThrow("Empty LLM response");
  });

  it("stops parsing at [DONE] but keeps the frames already handed over", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseBody([frame("keep"), "data: [DONE]\n\n", frame("after done")])));
    const received: string[] = [];
    const out = await stream([{ role: "user", content: "hi" }], options, (t) => received.push(t));
    expect(out.text).toBe("keep");
    // The payload after [DONE] stays in the buffer: this documents the current, safe half.
    expect(received).toEqual(["keep"]);
  });

  it("bills a streamed call with zero tokens even when the provider reports usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseBody([frame("answer"), `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 900, completion_tokens: 120 } })}\n\n`, "data: [DONE]\n\n"])
      )
    );
    const out = await stream([{ role: "user", content: "hi" }], options, () => {});
    expect(out.text).toBe("answer");
    // Parsed and thrown away: usage_logs gets 0/0 for every streamed brief and insight.
    expect(usage.logUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 0, outputTokens: 0 }));
    expect(out.inputTokens).toBe(0);
    expect(out.outputTokens).toBe(0);
  });
});

describe("complete() against the shapes Vertex answers with", () => {
  it("moves to the next route when content is null and keeps one that carries text", async () => {
    router.fallbackRoutes.mockReturnValue([route("chat-model"), route("back-model")]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ choices: [{ message: { content: null }, finish_reason: "length" }] }))
      .mockResolvedValueOnce(json({ choices: [{ message: { content: "from the backup" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await complete([{ role: "user", content: "hi" }], options);
    expect(out.text).toBe("from the backup");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads a tool_calls answer as no text and falls through", async () => {
    router.fallbackRoutes.mockReturnValue([route("chat-model"), route("back-model")]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ choices: [{ message: { content: null, tool_calls: [{ id: "1", function: { name: "web_search", arguments: "{}" } }] } }] }))
      .mockResolvedValueOnce(json({ choices: [{ message: { content: "plain answer" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(complete([{ role: "user", content: "hi" }], options)).resolves.toMatchObject({ text: "plain answer" });
  });

  it("sends the resolved Vertex bearer, never an empty one", async () => {
    const vertex = route("gemini-3.8-flash", { provider: "gemini" as const, authKind: "vertex" as const } as never);
    router.chatRoute.mockReturnValue(vertex);
    router.resolveRouteAuth.mockResolvedValue({
      baseUrl: "https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi",
      model: "google/gemini-3.8-flash",
      auth: "fake-token",
    });
    const fetchMock = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: "from vertex" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await complete([{ role: "user", content: "hi" }], options);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer fake-token");
    expect(init.headers.Authorization).not.toBe("Bearer ");
    expect(JSON.parse(init.body).model).toBe("google/gemini-3.8-flash");
  });

  it("keeps the provider status out of the answer but not out of the thrown fault", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "quota on qwen" } as never));
    await expect(complete([{ role: "user", content: "hi" }], options)).rejects.toThrow("LLM API error (429): quota on qwen");
    expect(usage.logUsage).not.toHaveBeenCalled();
  });
});
