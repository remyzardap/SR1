/**
 * Tests for P1-03 SSE stream events in kemmaStreamRoute when STREAM_TOOL_TURNS is enabled.
 *
 * Verifies:
 * - meta is emitted as the first event: { protocol: 2, runId, sessionId }
 * - thinking is emitted as JSON string deltas
 * - thinking is NOT emitted when KEMMA_REASONING_EFFORT is off
 * - segment events are emitted with { kind: "narration" | "answer" }
 * - tool_start and tool_end gain the id field
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
const usageMock = vi.hoisted(() => ({ logUsage: vi.fn(), checkSpendCap: vi.fn() }));
const mem = vi.hoisted(() => ({ getMemoriesContext: vi.fn() }));
const skillReviews = vi.hoisted(() => ({ getEnabledSkills: vi.fn() }));
const fileSkills = vi.hoisted(() => ({ buildSkillIndex: vi.fn(() => "") }));
const mcp = vi.hoisted(() => ({ getMcpRegistry: vi.fn() }));
const google = vi.hoisted(() => ({ getConnectionStatus: vi.fn() }));
const db = vi.hoisted(() => ({
  getDb: vi.fn(async () => null),
  addChatMessage: vi.fn(async () => "msg-id"),
  getChatSessionSettings: vi.fn(async () => ({})),
  ensureChatSession: vi.fn(async () => "owned" as const),
}));

vi.mock("../kemma/kemmaMax", () => kmax);
vi.mock("../kemma/toolkit/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../kemma/toolkit/registry")>();
  return { ...actual, runTool: registryMock.runTool };
});
vi.mock("../core/quotaCheck", () => quota);
vi.mock("../core/usage", () => usageMock);
vi.mock("../kemma/memory", () => mem);
vi.mock("../kemma/skillReviews", () => skillReviews);
vi.mock("../kemma/fileSkills", () => fileSkills);
vi.mock("../kemma/mcp/client", () => mcp);
vi.mock("../services/google", () => google);
vi.mock("../db", () => db);

import { kemmaStreamRoute } from "./kemmaStream";

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
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init: any) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    return handler(0, body);
  }));
}

function fakeReq(body: any, user: any = { id: 1, name: "Ruth" }) {
  const handlers: Record<string, Array<() => void>> = {};
  return {
    user,
    body,
    on(event: string, cb: () => void) {
      (handlers[event] ??= []).push(cb);
    },
    closeNow() {
      for (const cb of handlers["close"] ?? []) cb();
    },
  } as any;
}

function fakeRes() {
  const handlers: Record<string, Array<() => void>> = {};
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    headersSent: false,
    ended: false,
    frames: [] as string[],
    activityFrames: [] as string[],
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    write(chunk: string) {
      const text = String(chunk);
      (text.startsWith("event: activity\n") ? this.activityFrames : this.frames).push(text);
    },
    end() {
      this.ended = true;
    },
    on(event: string, cb: () => void) {
      (handlers[event] ??= []).push(cb);
    },
  } as any;
}

interface SseFrame {
  event: string;
  data: unknown;
  raw: string;
}

function parseFrames(frames: string[]): SseFrame[] {
  const out: SseFrame[] = [];
  for (const raw of frames) {
    if (raw.startsWith(":")) {
      out.push({ event: "ping", data: raw, raw });
      continue;
    }
    const m = raw.match(/^event: (.+)\ndata: ([\s\S]*)\n\n$/);
    if (!m) throw new Error(`unparseable SSE frame: ${JSON.stringify(raw)}`);
    out.push({ event: m[1], data: JSON.parse(m[2]), raw });
  }
  return out;
}

const USER_BODY = {
  messages: [{ role: "user", content: "Search for weather." }],
  sessionId: "sess-p1-03",
  runId: "run-custom-123",
};

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

  quota.checkQuota.mockResolvedValue({ allowed: true, remaining: 99, limit: 100, resetAt: new Date() });
  quota.incrementQuota.mockResolvedValue(undefined);
  quota.getQuotaSummary.mockResolvedValue({ tier: "trial" });
  usageMock.logUsage.mockResolvedValue(undefined);
  usageMock.checkSpendCap.mockResolvedValue({ allowed: true });
  mem.getMemoriesContext.mockResolvedValue(undefined);
  skillReviews.getEnabledSkills.mockResolvedValue([]);
  mcp.getMcpRegistry.mockReturnValue({ tools: async () => [] });
  google.getConnectionStatus.mockResolvedValue({ connected: false });
  registryMock.runTool.mockResolvedValue({ ok: true, data: { success: true, data: [] } });
  kmax.MAX_TOOL_CALLS.free = 2;
  kmax.MAX_TOOL_CALLS.trial = 20;
  kmax.MAX_TOOL_CALLS.pro = 20;
  kmax.MAX_TOOL_CALLS.max = 100;
  db.addChatMessage.mockClear();
  db.getChatSessionSettings.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
});

describe("kemmaStreamRoute with STREAM_TOOL_TURNS enabled", () => {
  it("emits meta as first event, then model, thinking, token, segment, and done", async () => {
    const sseChunks = [
      'data: {"choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"Checking facts..."}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":"The weather is sunny."}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":8,"total_tokens":18}}\n\n',
      "data: [DONE]\n\n",
    ];
    stubFetch(() => sseRes(sseChunks));

    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);

    const frames = parseFrames(res.frames);
    const events = frames.map((f) => f.event);

    // meta must be the first event
    expect(events[0]).toBe("meta");
    expect(frames[0].data).toEqual({
      protocol: 2,
      runId: "run-custom-123",
      sessionId: "sess-p1-03",
    });

    // Contains thinking, token, segment, usage, done
    expect(events).toContain("thinking");
    expect(events).toContain("token");
    expect(events).toContain("segment");
    expect(events).toContain("done");

    const thinkingFrame = frames.find((f) => f.event === "thinking");
    expect(thinkingFrame?.data).toBe("Checking facts...");

    const segmentFrames = frames.filter((f) => f.event === "segment");
    expect(segmentFrames).toHaveLength(1);
    expect(segmentFrames[0].data).toEqual({ kind: "answer" });
  });

  it("does NOT emit thinking when KEMMA_REASONING_EFFORT is off", async () => {
    process.env.KEMMA_REASONING_EFFORT = "off";
    const sseChunks = [
      'data: {"choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"Thinking..."}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":"Sunny."}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    stubFetch(() => sseRes(sseChunks));

    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);

    const frames = parseFrames(res.frames);
    const events = frames.map((f) => f.event);
    expect(events).not.toContain("thinking");
    expect(events).toContain("token");
  });

  it("emits tool_start and tool_end with the tool call id", async () => {
    let callIndex = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) {
        return sseRes([
          'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Searching..."}}]}\n\n',
          'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_weather_99","type":"function","function":{"name":"web_search","arguments":"{\\"query\\":\\"weather\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
          "data: [DONE]\n\n",
        ]);
      }
      return sseRes([
        'data: {"choices":[{"index":0,"delta":{"content":"75 degrees."}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ]);
    }));

    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);

    const frames = parseFrames(res.frames);
    const toolStart = frames.find((f) => f.event === "tool_start");
    expect(toolStart).toBeDefined();
    expect(toolStart?.data).toEqual({
      id: "call_weather_99",
      tool: "web_search",
      input: { query: "weather" },
    });

    const toolEnd = frames.find((f) => f.event === "tool_end");
    expect(toolEnd).toBeDefined();
    expect(toolEnd?.data).toMatchObject({
      id: "call_weather_99",
      tool: "web_search",
      output: { success: true, data: [] },
    });

    const segments = frames.filter((f) => f.event === "segment");
    expect(segments.map((s) => (s.data as any).kind)).toEqual(["narration", "answer"]);
  });
});
