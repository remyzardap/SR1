/**
 * Tests for P1-03 streaming tool turns loop in kemmaExecute.
 *
 * Covers:
 * - With flag("STREAM_TOOL_TURNS") on, every model call streams (including tool turns).
 * - Text deltas go to onStream immediately on both narration and final answer steps.
 * - When a step ends with tool calls, onSegmentEnd("narration") is called.
 * - When the final answer completes, onSegmentEnd("answer") is called.
 * - No duplicated "emit after the fact" for final text when flag is on.
 * - Reasoning deltas go to onReasoning, suppressed when KEMMA_REASONING_EFFORT=off.
 * - Tool start and end receive the call id.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const kmax = vi.hoisted(() => ({
  MAX_TOOL_CALLS: { free: 2, trial: 20, pro: 20, max: 100 } as Record<string, number>,
  DEEP_RESEARCH_ADDITION: "[deep-research-addition]",
}));
const registryMock = vi.hoisted(() => ({ runTool: vi.fn() }));
const quota = vi.hoisted(() => ({
  checkQuota: vi.fn(),
  incrementQuota: vi.fn(),
  getQuotaSummary: vi.fn(),
}));
const usage = vi.hoisted(() => ({
  logUsage: vi.fn(),
  checkSpendCap: vi.fn(),
}));
const mem = vi.hoisted(() => ({ getMemoriesContext: vi.fn() }));
const skillReviews = vi.hoisted(() => ({ getEnabledSkills: vi.fn() }));
const fileSkills = vi.hoisted(() => ({ buildSkillIndex: vi.fn(() => "") }));
const mcp = vi.hoisted(() => ({ getMcpRegistry: vi.fn() }));
const google = vi.hoisted(() => ({ getConnectionStatus: vi.fn() }));

vi.mock("./kemmaMax", () => kmax);
vi.mock("./toolkit/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./toolkit/registry")>();
  return { ...actual, runTool: registryMock.runTool };
});
vi.mock("../core/quotaCheck", () => quota);
vi.mock("../core/usage", () => usage);
vi.mock("./memory", () => mem);
vi.mock("./skillReviews", () => skillReviews);
vi.mock("./fileSkills", () => fileSkills);
vi.mock("./mcp/client", () => mcp);
vi.mock("../services/google", () => google);

import { kemmaExecute, type EngineInput } from "./engine";

const savedEnv = new Map<string, string | undefined>();
const ENV_NAMES = [
  "FF_STREAM_TOOL_TURNS",
  "KEMMA_REASONING_EFFORT",
  "QWEN_API_KEY",
  "GEMINI_API_KEY",
  "KEMMA_PROMPT_CACHE",
  "KEMMA_HTTP_ATTEMPTS",
];

const enc = new TextEncoder();

function sseRes(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function stubFetch(handler: (index: number, body: any) => Response) {
  const calls: Array<{ url: string; body: any }> = [];
  const fn = vi.fn(async (url: unknown, init: any) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const index = calls.length;
    calls.push({ url: String(url), body });
    return handler(index, body);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    userId: 7,
    userName: "Alice",
    messages: [{ role: "user", content: "Tell me about routers." }],
    tier: "trial",
    isThinking: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ENV_NAMES) {
    savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.QWEN_API_KEY = "q";
  process.env.GEMINI_API_KEY = "studio-key";
  process.env.KEMMA_PROMPT_CACHE = "off";
  process.env.KEMMA_HTTP_ATTEMPTS = "1";
  process.env.FF_STREAM_TOOL_TURNS = "1";

  quota.checkQuota.mockImplementation(async () => ({ allowed: true, remaining: 99, limit: 100, resetAt: new Date() }));
  quota.incrementQuota.mockResolvedValue(undefined);
  quota.getQuotaSummary.mockResolvedValue({ tier: "trial" });
  usage.logUsage.mockResolvedValue(undefined);
  usage.checkSpendCap.mockResolvedValue({ allowed: true });
  mem.getMemoriesContext.mockResolvedValue(undefined);
  skillReviews.getEnabledSkills.mockResolvedValue([]);
  mcp.getMcpRegistry.mockReturnValue({ tools: async () => [] });
  google.getConnectionStatus.mockResolvedValue({ connected: false });
  registryMock.runTool.mockResolvedValue({
    ok: true,
    data: { success: true, data: [{ title: "Best Routers", url: "https://example.com/r" }] },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
});

describe("engine with STREAM_TOOL_TURNS enabled", () => {
  it("two-step run (tool, then answer) emits text tokens in both steps and segment events in order", async () => {
    // Step 1: Model emits narration text delta, then tool_calls delta, then finish_reason tool_calls
    const step1Chunks = [
      'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Let me search the web for that."}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_sr_1","type":"function","function":{"name":"web_search","arguments":"{\\"query\\":\\"routers\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":20,"completion_tokens":15,"total_tokens":35}}\n\n',
      "data: [DONE]\n\n",
    ];

    // Step 2: Model emits final answer text delta
    const step2Chunks = [
      'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Here are the best routers [1]."}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":40,"completion_tokens":10,"total_tokens":50}}\n\n',
      "data: [DONE]\n\n",
    ];

    const { calls } = stubFetch((index) => {
      if (index === 0) return sseRes(step1Chunks);
      return sseRes(step2Chunks);
    });

    const streamedTokens: string[] = [];
    const segments: string[] = [];
    const toolStarts: Array<{ tool: string; input: unknown; id?: string }> = [];
    const toolEnds: Array<{ tool: string; id?: string }> = [];

    const output = await kemmaExecute(
      baseInput({
        onStream: (chunk) => streamedTokens.push(chunk),
        onSegmentEnd: (kind) => segments.push(kind),
        onToolStart: (tool, input, id) => toolStarts.push({ tool, input, id }),
        onToolEnd: (tool, _res, _ms, id) => toolEnds.push({ tool, id }),
      })
    );

    // Both provider calls requested stream: true
    expect(calls).toHaveLength(2);
    expect(calls[0].body.stream).toBe(true);
    expect(calls[1].body.stream).toBe(true);

    // Both steps streamed their tokens
    expect(streamedTokens).toEqual([
      "Let me search the web for that.",
      "Here are the best routers [1].",
    ]);

    // Segment events emitted in exact order: narration when tool calls returned, answer when final answer completed
    expect(segments).toEqual(["narration", "answer"]);

    // Tool callbacks received callId
    expect(toolStarts).toHaveLength(1);
    expect(toolStarts[0]).toEqual({
      tool: "web_search",
      input: { query: "routers" },
      id: "call_sr_1",
    });
    expect(toolEnds).toHaveLength(1);
    expect(toolEnds[0].id).toBe("call_sr_1");

    // Final answer is present in output
    expect(output.response).toContain("Here are the best routers [1].");
    expect(output.toolCalls).toHaveLength(1);
  });

  it("emits reasoning deltas to onReasoning, but suppresses when KEMMA_REASONING_EFFORT is off", async () => {
    const chunksWithReasoning = [
      'data: {"choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"Analyzing question..."}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":"Direct answer."}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    stubFetch(() => sseRes(chunksWithReasoning));

    const reasoningDeltas: string[] = [];
    const textDeltas: string[] = [];

    await kemmaExecute(
      baseInput({
        onStream: (t) => textDeltas.push(t),
        onReasoning: (r) => reasoningDeltas.push(r),
      })
    );

    expect(reasoningDeltas).toEqual(["Analyzing question..."]);
    expect(textDeltas).toEqual(["Direct answer."]);

    // Now test with KEMMA_REASONING_EFFORT="off"
    process.env.KEMMA_REASONING_EFFORT = "off";
    stubFetch(() => sseRes(chunksWithReasoning));

    const suppressedReasoning: string[] = [];
    await kemmaExecute(
      baseInput({
        onStream: () => {},
        onReasoning: (r) => suppressedReasoning.push(r),
      })
    );

    expect(suppressedReasoning).toEqual([]);
  });
});
