import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Audit tests for server/_core/llm.ts: which base URL, model id and credential a call really
// uses for each KEMMA_MODEL_CHAT configuration. invokeLLM is the entry point used by
// server/aiService.ts (receipt and WhatsApp extraction).

const authState = vi.hoisted(() => ({ token: "fake-access-token" }));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: authState.token }) };
    }
    async getProjectId() {
      return "adc-project-123";
    }
  },
}));

const fsState = vi.hoisted(() => ({ readable: true }));

vi.mock("node:fs", () => ({
  accessSync: vi.fn(() => {
    if (!fsState.readable) throw new Error("ENOENT");
  }),
  constants: { R_OK: 4 },
}));

const ENV_NAMES = [
  "KEMMA_MODEL_CHAT", "QWEN_BASE_URL", "QWEN_API_KEY", "GEMINI_API_KEY", "GEMINI",
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "LITELLM_BASE_URL", "LITELLM_API_KEY", "KOBOILLM_API_KEY", "SONAR_API_KEY", "PERPLEXITY_API_KEY",
  "BUILT_IN_FORGE_API_URL", "BUILT_IN_FORGE_API_KEY",
];

const saved = new Map<string, string | undefined>();
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  authState.token = "fake-access-token";
  fsState.readable = true;
  fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({
        id: "chatcmpl-1",
        created: 1,
        model: "echo",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

const load = async () => import("./llm");

const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, any];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body) };
};

const messages = [{ role: "user" as const, content: "hi" }];

describe("invokeLLM routing by chat slot", () => {
  it("a qwen chat slot posts the slot model to the Qwen base URL with the Qwen key", async () => {
    process.env.QWEN_API_KEY = "q";
    const { invokeLLM } = await load();
    await invokeLLM({ messages });
    const call = sent();
    expect(call.url).toBe("https://token-plan.maas.qwencloudapi.com/compatible-mode/v1/chat/completions");
    expect(call.headers.authorization).toBe("Bearer q");
    expect(call.body.model).toBe("qwen3.8-max");
  });

  it("QWEN_BASE_URL is read at call time, matching the router's view of the same provider", async () => {
    process.env.QWEN_API_KEY = "q";
    const { invokeLLM } = await load();
    const router = await import("../core/kemmaRouter");
    process.env.QWEN_BASE_URL = "https://late.example.com/compatible-mode/v1/";
    await invokeLLM({ messages });
    expect(sent().url).toBe("https://late.example.com/compatible-mode/v1/chat/completions");
    // Both paths must agree; a divergence here means two providers for one model id.
    expect(router.routeFor("qwen3.8-max").baseUrl).toBe("https://late.example.com/compatible-mode/v1");
  });

  it("a forge base URL takes precedence over QWEN_BASE_URL for the qwen path", async () => {
    process.env.QWEN_API_KEY = "q";
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example.com/";
    process.env.BUILT_IN_FORGE_API_KEY = "forge-key";
    const { invokeLLM } = await load();
    await invokeLLM({ messages });
    expect(sent().url).toBe("https://forge.example.com/v1/chat/completions");
    expect(sent().headers.authorization).toBe("Bearer forge-key");
  });

  it("an unknown model id in the chat slot is routed to Qwen and warns once (batch-2 fix #20)", async () => {
    process.env.QWEN_API_KEY = "q";
    process.env.KEMMA_MODEL_CHAT = "gpt-4o";
    const { invokeLLM } = await load();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await invokeLLM({ messages });
    const call = sent();
    expect(call.url).toBe("https://token-plan.maas.qwencloudapi.com/compatible-mode/v1/chat/completions");
    expect(call.headers.authorization).toBe("Bearer q");
    expect(call.body.model).toBe("gpt-4o");
    expect(warnSpy.mock.calls.flat().map(String).join(" ")).toContain("gpt-4o");

    // What the provider answers for that request: the error is surfaced verbatim, no fallback.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "The model `gpt-4o` does not exist" } }), {
        status: 404,
        statusText: "Not Found",
      }) as any,
    );
    const err = await invokeLLM({ messages }).then(() => null, (e: Error) => e.message);
    expect(err).toContain("LLM invoke failed: 404 Not Found");
    expect(err).toContain("does not exist");
  });

  it("a litellm/ chat slot goes to the gateway with the prefix stripped and the gateway key", async () => {
    process.env.LITELLM_API_KEY = "gw";
    process.env.KEMMA_MODEL_CHAT = "LITELLM/deepseek-ai/deepseek-v3.2-maas";
    const { invokeLLM } = await load();
    await invokeLLM({ messages });
    expect(sent().url).toBe("https://api.koboillm.com/v1/chat/completions");
    expect(sent().body.model).toBe("deepseek-ai/deepseek-v3.2-maas");
    expect(sent().headers.authorization).toBe("Bearer gw");
  });

  it("a gemini chat slot on AI Studio uses the studio key", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    process.env.KEMMA_MODEL_CHAT = "gemini-3.8-flash";
    const { invokeLLM } = await load();
    await invokeLLM({ messages });
    expect(sent().url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(sent().headers.authorization).toBe("Bearer studio-key");
    expect(sent().body.model).toBe("gemini-3.8-flash");
  });

  it("a gemini chat slot in vertex mode uses the vertex URL, the google/ model and the bearer token", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    process.env.VERTEX_PROJECT = "env-project";
    process.env.KEMMA_MODEL_CHAT = "google/gemini-3.8-flash";
    const { invokeLLM } = await load();
    await invokeLLM({ messages });
    expect(sent().url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/endpoints/openapi/chat/completions",
    );
    expect(sent().body.model).toBe("google/gemini-3.8-flash");
    expect(sent().headers.authorization).toBe("Bearer fake-access-token");
  });

  it("refuses to send a blank credential when nothing is configured", async () => {
    const { invokeLLM } = await load();
    await expect(invokeLLM({ messages })).rejects.toThrow(/No LLM API key configured/);
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.KEMMA_MODEL_CHAT = "gemini-3.8-flash";
    const second = await load();
    await expect(second.invokeLLM({ messages })).rejects.toThrow(/Gemini backend is not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("invokeLLM payload", () => {
  it("honors maxTokens / max_tokens and defaults to 8192", async () => {
    process.env.QWEN_API_KEY = "q";
    const { invokeLLM } = await load();
    await invokeLLM({ messages, maxTokens: 123 });
    expect(sent().body.max_tokens).toBe(123);
    fetchMock.mockClear();
    await invokeLLM({ messages, max_tokens: 456 });
    expect(sent().body.max_tokens).toBe(456);
    fetchMock.mockClear();
    await invokeLLM({ messages });
    expect(sent().body.max_tokens).toBe(8192);
  });

  it("normalizes response_format, tools and tool_choice", async () => {
    process.env.QWEN_API_KEY = "q";
    const { invokeLLM } = await load();
    await invokeLLM({
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
      tool_choice: "required",
      output_schema: { name: "out", schema: { type: "object" } },
    });
    const body = sent().body;
    // A single text part collapses to a plain string for provider compatibility.
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "lookup" } });
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: { name: "out", schema: { type: "object" } } });
    await expect(
      invokeLLM({ messages, tool_choice: "required" }),
    ).rejects.toThrow(/no tools were configured/);
  });
});

describe("aiService extraction fallbacks", () => {
  it("returns a reviewable empty receipt instead of throwing when the LLM call fails", async () => {
    process.env.QWEN_API_KEY = "q";
    const { extractReceiptData } = await import("../aiService");
    fetchMock.mockResolvedValue(new Response("upstream down", { status: 503 }) as any);
    const result = await extractReceiptData({ text: "coffee 5.00" });
    expect(result.confidence).toBe(0);
    expect(result.needsReview).toBe(true);
    expect(result.currency).toBe("IDR");
    expect(result.description).toBe("coffee 5.00");
  });

  it("classifies a WhatsApp message and degrades to unknown on a parse failure", async () => {
    process.env.QWEN_API_KEY = "q";
    const { parseWhatsAppMessage } = await import("../aiService");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ type: "task", data: { text: "buy milk" }, rawText: "x" }) } }],
        }),
        { status: 200 },
      ) as any,
    );
    const parsed = await parseWhatsAppMessage("buy milk tomorrow");
    expect(parsed.type).toBe("task");
    expect(parsed.rawText).toBe("buy milk tomorrow"); // the caller's text wins over the model echo

    fetchMock.mockResolvedValue(new Response("not json at all", { status: 200 }) as any);
    const bad = await parseWhatsAppMessage("hello");
    expect(bad).toEqual({ type: "unknown", data: {}, rawText: "hello" });
  });
});
