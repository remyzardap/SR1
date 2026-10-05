/**
 * Engine tests for the request-efficiency layer: prefix-stable prompt layout, Qwen cache markers,
 * cached-token and streamed-usage accounting, and same-model retry before fallback. Mocked fetch,
 * mocked side-effect modules; no network, no DB. Each test loads fresh modules so the process-level
 * circuit breakers (markers rejected, stream_options rejected) never leak between tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const kmax = vi.hoisted(() => ({
  executeToolCall: vi.fn(),
  MAX_TOOL_CALLS: { free: 2, trial: 20, pro: 20, max: 100 } as Record<string, number>,
  DEEP_RESEARCH_ADDITION: "[deep-research-addition]",
}));
const quota = vi.hoisted(() => ({ checkQuota: vi.fn(), incrementQuota: vi.fn(), getQuotaSummary: vi.fn() }));
const usage = vi.hoisted(() => ({ logUsage: vi.fn(), checkSpendCap: vi.fn() }));
const mem = vi.hoisted(() => ({ getMemoriesContext: vi.fn() }));
const skillReviews = vi.hoisted(() => ({ getEnabledSkills: vi.fn() }));
const fileSkills = vi.hoisted(() => ({ buildSkillIndex: vi.fn(() => "") }));
const mcp = vi.hoisted(() => ({ getMcpRegistry: vi.fn() }));
const google = vi.hoisted(() => ({ getConnectionStatus: vi.fn() }));

vi.mock("./kemmaMax", () => kmax);
vi.mock("../core/quotaCheck", () => quota);
vi.mock("../core/usage", () => usage);
vi.mock("./memory", () => mem);
vi.mock("./skillReviews", () => skillReviews);
vi.mock("./fileSkills", () => fileSkills);
vi.mock("./mcp/client", () => mcp);
vi.mock("../services/google", () => google);

import type { EngineInput } from "./engine";

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "KEMMA_MODEL_CHAT", "KEMMA_MODEL_REPORT", "KEMMA_MODEL_LONG_DOC", "KEMMA_MODEL_VISION",
  "KEMMA_MODEL_PLANNER", "KEMMA_MODEL_VERIFY", "KEMMA_MODEL_PRO", "KEMMA_MODEL_PRO_FALLBACK",
  "KEMMA_MODEL_FALLBACK", "KEMMA_MODEL_SEARCH", "KEMMA_TOOL_BUDGET", "KEMMA_MAX_SUBAGENTS",
  "QWEN_API_KEY", "GEMINI_API_KEY", "SONAR_API_KEY", "PERPLEXITY_API_KEY",
  "LITELLM_BASE_URL", "LITELLM_API_KEY", "KOBOILLM_API_KEY",
  "KEMMA_PROMPT_CACHE", "KEMMA_HTTP_ATTEMPTS", "KEMMA_HTTP_TIMEOUT_MS",
];
const savedEnv = new Map<string, string | undefined>();
const ALLOWED = { allowed: true, remaining: 99, limit: 100, resetAt: new Date() };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const name of ENV_NAMES) {
    savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.QWEN_API_KEY = "q";
  process.env.GEMINI_API_KEY = "studio-key";
  process.env.KEMMA_HTTP_ATTEMPTS = "1"; // individual tests opt in to retries

  quota.checkQuota.mockImplementation(async () => ALLOWED);
  quota.incrementQuota.mockResolvedValue(undefined);
  quota.getQuotaSummary.mockResolvedValue({ tier: "trial" });
  usage.logUsage.mockResolvedValue(undefined);
  usage.checkSpendCap.mockResolvedValue({ allowed: true });
  mem.getMemoriesContext.mockResolvedValue(undefined);
  skillReviews.getEnabledSkills.mockResolvedValue([]);
  mcp.getMcpRegistry.mockReturnValue({ tools: async () => [] });
  google.getConnectionStatus.mockResolvedValue({ connected: false });
  kmax.executeToolCall.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
});

// ── helpers ──────────────────────────────────────────────────────────────────
interface FetchCall { url: string; body: any }

function stubFetch(handler: (index: number, body: any) => Response) {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init: any) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const index = calls.length;
    calls.push({ url: String(url), body });
    return handler(index, body);
  }));
  return { calls };
}

const jsonRes = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const errorRes = (status: number, text: string) => new Response(text, { status });

function completion(content: string | null, extra: { usage?: unknown; toolCalls?: unknown[] } = {}) {
  const message: any = { role: "assistant", content };
  if (extra.toolCalls) message.tool_calls = extra.toolCalls;
  return { choices: [{ message, finish_reason: extra.toolCalls ? "tool_calls" : "stop" }], ...(extra.usage ? { usage: extra.usage } : {}) };
}

const enc = new TextEncoder();
function sseRes(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
const sseDelta = (content: string) => `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`;
const sseUsage = (u: unknown) => `data: ${JSON.stringify({ choices: [], usage: u })}\n\n`;
const SSE_DONE = "data: [DONE]\n\n";

const tc = (id: string, name: string) => ({ id, type: "function", function: { name, arguments: "{}" } });

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return { userId: 7, userName: "Ruth", messages: [{ role: "user", content: "hello" }], tier: "trial", isThinking: false, ...overrides } as EngineInput;
}

async function run(overrides: Partial<EngineInput> = {}) {
  const { kemmaExecute } = await import("./engine");
  return kemmaExecute(baseInput(overrides));
}

const textOf = (content: unknown): string =>
  typeof content === "string" ? content : Array.isArray(content) ? content.map((p: any) => p.text ?? "").join("") : "";

// ═════════════════════════════════════════════════════════════════════════════
describe("prefix-stable prompt layout", () => {
  it("keeps retrieved memories out of the system prompt and on the last user message", async () => {
    process.env.KEMMA_PROMPT_CACHE = "off";
    mem.getMemoriesContext.mockResolvedValue("- Remy works in solar investment");
    const net = stubFetch(() => jsonRes(completion("ok")));
    await run({ messages: [{ role: "user", content: "what should I read?" }] });

    const [sys, user] = net.calls[0].body.messages;
    expect(sys.role).toBe("system");
    expect(sys.content).not.toContain("solar investment");
    expect(sys.content).not.toContain("Memory context");
    expect(user.content).toContain("Remy works in solar investment");
    expect(user.content.endsWith("what should I read?")).toBe(true);
  });

  it("produces a byte-identical system prompt whatever memories were retrieved", async () => {
    process.env.KEMMA_PROMPT_CACHE = "off";
    const net = stubFetch(() => jsonRes(completion("ok")));
    mem.getMemoriesContext.mockResolvedValue("- fact A");
    await run();
    mem.getMemoriesContext.mockResolvedValue("- completely different fact B");
    await run();
    expect(net.calls[0].body.messages[0].content).toBe(net.calls[1].body.messages[0].content);
  });

  it("leaves earlier history untouched so it stays cacheable across turns", async () => {
    process.env.KEMMA_PROMPT_CACHE = "off";
    mem.getMemoriesContext.mockResolvedValue("- fact");
    const net = stubFetch(() => jsonRes(completion("ok")));
    await run({
      messages: [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "second question" },
      ],
    });
    const wire = net.calls[0].body.messages;
    expect(wire[1].content).toBe("first question");
    expect(wire[2].content).toBe("first answer");
    expect(wire[3].content).toContain("- fact");
  });

  it("sends the same context on every iteration of a tool loop", async () => {
    process.env.KEMMA_PROMPT_CACHE = "off";
    mem.getMemoriesContext.mockResolvedValue("- fact");
    const net = stubFetch((i) => (i === 0 ? jsonRes(completion(null, { toolCalls: [tc("t1", "web_search")] })) : jsonRes(completion("done"))));
    await run();
    const firstUser = net.calls[0].body.messages[1].content;
    const secondUser = net.calls[1].body.messages[1].content;
    expect(secondUser).toBe(firstUser);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("Qwen explicit cache markers", () => {
  it("marks the system message and the last user message on the main loop", async () => {
    const net = stubFetch(() => jsonRes(completion("ok")));
    await run();
    const [sys, user] = net.calls[0].body.messages;
    expect(sys.content).toEqual([{ type: "text", text: expect.stringContaining("You are Sutaeru"), cache_control: { type: "ephemeral" } }]);
    expect(user.content).toEqual([{ type: "text", text: "hello", cache_control: { type: "ephemeral" } }]);
  });

  it("never marks tool-result or assistant tool-call messages in a loop", async () => {
    const net = stubFetch((i) => (i === 0 ? jsonRes(completion(null, { toolCalls: [tc("t1", "web_search")] })) : jsonRes(completion("done"))));
    await run();
    const second = net.calls[1].body.messages;
    const tool = second.find((m: any) => m.role === "tool");
    const assistant = second.find((m: any) => m.role === "assistant");
    expect(typeof tool.content).toBe("string");
    expect(assistant.content === null || typeof assistant.content === "string").toBe(true);
    expect(Array.isArray(second.find((m: any) => m.role === "user").content)).toBe(true);
  });

  it("keeps the marked prefix identical between loop iterations", async () => {
    const net = stubFetch((i) => (i === 0 ? jsonRes(completion(null, { toolCalls: [tc("t1", "web_search")] })) : jsonRes(completion("done"))));
    await run();
    const a = net.calls[0].body.messages.slice(0, 2);
    const b = net.calls[1].body.messages.slice(0, 2);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("is off when KEMMA_PROMPT_CACHE=off", async () => {
    process.env.KEMMA_PROMPT_CACHE = "off";
    const net = stubFetch(() => jsonRes(completion("ok")));
    await run();
    expect(typeof net.calls[0].body.messages[0].content).toBe("string");
    expect(typeof net.calls[0].body.messages[1].content).toBe("string");
  });

  it("is never sent to non-Qwen providers", async () => {
    process.env.KEMMA_MODEL_CHAT = "gemini-3.8-flash";
    const net = stubFetch(() => jsonRes(completion("ok")));
    await run();
    expect(typeof net.calls[0].body.messages[0].content).toBe("string");
    expect(JSON.stringify(net.calls[0].body)).not.toContain("cache_control");
  });

  it("is not used for one-shot calls such as report synthesis", async () => {
    process.env.KEMMA_MAX_SUBAGENTS = "2";
    const net = stubFetch((_i, body) => {
      const sys = textOf(body.messages?.[0]?.content);
      if (sys.includes("research planner")) return jsonRes(completion('["a","b"]'));
      if (sys.includes("synthesize")) return jsonRes(completion("Synthesized."));
      return jsonRes(completion("sub answer"));
    });
    const out = await run({ messages: [{ role: "user", content: "Please research and analyze the renewable energy market in detail" }] });
    expect(out.response).toBe("Synthesized.");
    const synth = net.calls.find((c) => textOf(c.body.messages[0].content).includes("synthesize"))!;
    expect(typeof synth.body.messages[0].content).toBe("string");
    expect(typeof synth.body.messages[1].content).toBe("string");
  });

  it("retries a rejected request without markers on the same model and keeps them off afterwards", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const net = stubFetch((i) => (i === 0 ? errorRes(400, "bad request") : jsonRes(completion("ok"))));
    const first = await run();
    expect(first.response).toBe("ok");
    expect(net.calls).toHaveLength(2);
    expect(net.calls[1].body.model).toBe(net.calls[0].body.model); // no model fallback
    expect(Array.isArray(net.calls[0].body.messages[0].content)).toBe(true);
    expect(typeof net.calls[1].body.messages[0].content).toBe("string");

    await run();
    expect(net.calls).toHaveLength(3);
    expect(typeof net.calls[2].body.messages[0].content).toBe("string"); // breaker stays open
  });

  it("reports the real error when the stripped request fails too, and does not trip the breaker", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.KEMMA_MODEL_VISION = "qwen3.8-max"; // single-model chain so the error surfaces
    const net = stubFetch(() => errorRes(400, "context length exceeded"));
    const out = await run();
    expect(out.isError).toBe(true);
    expect(out.response).toContain("context length exceeded");
    net.calls.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init: any) => {
      net.calls.push({ url: "", body: JSON.parse(String(init.body)) });
      return jsonRes(completion("ok"));
    }));
    await run();
    expect(Array.isArray(net.calls[0].body.messages[0].content)).toBe(true); // markers still on
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("usage accounting", () => {
  it("records cached prompt tokens from a normal response", async () => {
    stubFetch(() => jsonRes(completion("ok", { usage: { prompt_tokens: 2000, completion_tokens: 30, total_tokens: 2030, prompt_tokens_details: { cached_tokens: 1800 } } })));
    const out = await run();
    expect(usage.logUsage.mock.calls[0][0]).toMatchObject({ inputTokens: 2000, outputTokens: 30, cachedInputTokens: 1800 });
    expect(out.tokensUsed).toEqual({ input: 2000, output: 30, total: 2030 });
  });

  it("meters streamed answers (previously logged as zero) and asks Qwen for the usage chunk", async () => {
    const onStream = vi.fn();
    const net = stubFetch(() => sseRes([
      sseDelta("Hello "), sseDelta("world"),
      sseUsage({ prompt_tokens: 120, completion_tokens: 10, total_tokens: 130, prompt_tokens_details: { cached_tokens: 100 } }),
      SSE_DONE,
    ]));
    const out = await run({ onStream, toolBudget: 0 });
    expect(net.calls[0].body.stream).toBe(true);
    expect(net.calls[0].body.stream_options).toEqual({ include_usage: true });
    expect(onStream).toHaveBeenCalledWith("Hello ");
    expect(out.response).toBe("Hello world");
    expect(usage.logUsage.mock.calls[0][0]).toMatchObject({ inputTokens: 120, outputTokens: 10, cachedInputTokens: 100 });
    expect(out.tokensUsed).toEqual({ input: 120, output: 10, total: 130 });
  });

  it("does not send stream_options to Gemini but still reads a usage chunk if one arrives", async () => {
    process.env.KEMMA_MODEL_CHAT = "gemini-3.8-flash";
    const net = stubFetch(() => sseRes([sseDelta("hi"), sseUsage({ prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }), SSE_DONE]));
    await run({ onStream: vi.fn(), toolBudget: 0 });
    expect(net.calls[0].body.stream_options).toBeUndefined();
    expect(usage.logUsage.mock.calls[0][0]).toMatchObject({ inputTokens: 5, outputTokens: 1 });
  });

  it("retries without stream_options when the provider rejects it, with no model fallback", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.KEMMA_PROMPT_CACHE = "off";
    const onStream = vi.fn();
    const net = stubFetch((i) => (i === 0 ? errorRes(400, 'Unknown parameter: "stream_options"') : sseRes([sseDelta("ok"), SSE_DONE])));
    const out = await run({ onStream, toolBudget: 0 });
    expect(net.calls).toHaveLength(2);
    expect(net.calls[0].body.stream_options).toEqual({ include_usage: true });
    expect(net.calls[1].body.stream_options).toBeUndefined();
    expect(net.calls[1].body.model).toBe(net.calls[0].body.model);
    expect(out.response).toBe("ok");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("same-model retry before fallback", () => {
  it("retries a 503 on the same model instead of dropping to the fallback model", async () => {
    process.env.KEMMA_HTTP_ATTEMPTS = "2";
    process.env.KEMMA_PROMPT_CACHE = "off";
    const onNotice = vi.fn();
    const net = stubFetch((i) => (i === 0 ? errorRes(503, "overloaded") : jsonRes(completion("recovered"))));
    const out = await run({ onNotice });
    expect(out.response).toBe("recovered");
    expect(net.calls.map((c) => c.body.model)).toEqual(["qwen3.8-max", "qwen3.8-max"]);
    expect(onNotice).not.toHaveBeenCalled();
  });

  it("still falls back when the primary stays down", async () => {
    process.env.KEMMA_HTTP_ATTEMPTS = "2";
    process.env.KEMMA_PROMPT_CACHE = "off";
    const onNotice = vi.fn();
    const net = stubFetch((_i, body) => (body.model === "qwen3.8-max" ? errorRes(503, "down") : jsonRes(completion("from gemini"))));
    const out = await run({ onNotice });
    expect(out.response).toBe("from gemini");
    expect(net.calls.map((c) => c.body.model)).toEqual(["qwen3.8-max", "qwen3.8-max", "gemini-3.8-flash"]);
    expect(onNotice).toHaveBeenCalledWith("Primary model unavailable; trying a backup...");
  });

  it("does not retry a 401 on the same model", async () => {
    process.env.KEMMA_HTTP_ATTEMPTS = "3";
    process.env.KEMMA_PROMPT_CACHE = "off";
    const net = stubFetch((_i, body) => (body.model === "qwen3.8-max" ? errorRes(401, "bad key") : jsonRes(completion("ok"))));
    await run();
    expect(net.calls.filter((c) => c.body.model === "qwen3.8-max")).toHaveLength(1);
  });
});
