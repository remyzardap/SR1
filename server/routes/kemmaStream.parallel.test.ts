/**
 * Tests for P1-04 Parallel tool execution activity event pairing in kemmaStreamRoute.
 *
 * Verifies:
 * - Activity events pair correctly by id across concurrent tool executions.
 * - Out-of-order completions correctly match start and end activity events by call id.
 * - tool_start and tool_end events match by call id.
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
  "FF_PARALLEL_TOOLS",
  "FF_STREAM_TOOL_TURNS",
  "KEMMA_TOOL_CONCURRENCY",
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

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
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
  process.env.FF_PARALLEL_TOOLS = "1";
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
  db.addChatMessage.mockClear();
  db.getChatSessionSettings.mockResolvedValue({ mode: "deep" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
});

describe("P1-04 kemmaStreamRoute parallel activity event pairing", () => {
  it("activity events pair correctly by id when tools complete out of order", async () => {
    let callIndex = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) {
        return sseRes([
          'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Searching..."}}]}\n\n',
          'data: {"choices":[{"index":0,"delta":{"tool_calls":[' +
            '{"index":0,"id":"call_slow","type":"function","function":{"name":"web_search","arguments":"{\\"query\\":\\"slow\\"}"}},' +
            '{"index":1,"id":"call_fast","type":"function","function":{"name":"browse","arguments":"{\\"url\\":\\"https://fast.com\\"}"}},' +
            '{"index":2,"id":"call_medium","type":"function","function":{"name":"web_search","arguments":"{\\"query\\":\\"medium\\"}"}}' +
            ']}}]}\n\n',
          'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
          "data: [DONE]\n\n",
        ]);
      }
      return sseRes([
        'data: {"choices":[{"index":0,"delta":{"content":"All searches done."}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ]);
    }));

    // Invert completion order: call_fast (10ms), call_medium (30ms), call_slow (50ms)
    registryMock.runTool.mockImplementation(async (name, args) => {
      if (name === "browse") {
        await new Promise((r) => setTimeout(r, 10));
        return { ok: true, data: { success: true, data: { url: "https://fast.com" } } };
      }
      const q = (args as any)?.query;
      if (q === "medium") {
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true, data: { success: true, data: [] } };
      }
      await new Promise((r) => setTimeout(r, 50));
      return { ok: true, data: { success: true, data: [] } };
    });

    const req = fakeReq({
      messages: [{ role: "user", content: "Check three things in parallel." }],
      sessionId: "sess-parallel-activity",
      runId: "run-act-123",
      settings: { mode: "deep" },
    });
    const res = fakeRes();

    await kemmaStreamRoute(req, res);

    // 1. Check tool_start and tool_end events in res.frames
    const generalFrames = parseFrames(res.frames);
    const toolStarts = generalFrames.filter((f) => f.event === "tool_start");
    const toolEnds = generalFrames.filter((f) => f.event === "tool_end");

    expect(toolStarts).toHaveLength(3);
    expect(toolEnds).toHaveLength(3);

    const startIds = toolStarts.map((f) => (f.data as any).id);
    const endIds = toolEnds.map((f) => (f.data as any).id);

    // Both contain all 3 call IDs
    expect(startIds).toContain("call_slow");
    expect(startIds).toContain("call_fast");
    expect(startIds).toContain("call_medium");

    expect(endIds).toContain("call_slow");
    expect(endIds).toContain("call_fast");
    expect(endIds).toContain("call_medium");

    // Completion order was fast, then medium, then slow
    expect(endIds).toEqual(["call_fast", "call_medium", "call_slow"]);

    // 2. Check activity events pairing by ID
    const activityFrames = parseFrames(res.activityFrames);
    const toolActivity = activityFrames.filter(
      (f) => ["search", "read", "tool"].includes((f.data as any).kind)
    );

    // Each call must have a "running" start and a "done" end
    for (const callId of ["call_slow", "call_fast", "call_medium"]) {
      const callEvents = toolActivity.filter((f) => (f.data as any).id === callId);
      expect(callEvents).toHaveLength(2);

      const startEvent = callEvents[0];
      const endEvent = callEvents[1];

      expect((startEvent.data as any).status).toBe("running");
      expect((endEvent.data as any).status).toBe("done");
      expect((endEvent.data as any).id).toBe(callId);
    }
  });

  it("activity events pair correctly by id when STREAM_TOOL_TURNS is off and PARALLEL_TOOLS is on", async () => {
    process.env.FF_STREAM_TOOL_TURNS = "0";

    let callIndex = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) {
        return jsonRes({
          choices: [{
            message: {
              role: "assistant",
              content: "Calling tools.",
              tool_calls: [
                { id: "call_t1", type: "function", function: { name: "web_search", arguments: '{"query":"q1"}' } },
                { id: "call_t2", type: "function", function: { name: "web_search", arguments: '{"query":"q2"}' } },
              ],
            },
            finish_reason: "tool_calls",
          }],
        });
      }
      return jsonRes({
        choices: [{
          message: { role: "assistant", content: "Done." },
          finish_reason: "stop",
        }],
      });
    }));

    // call_t2 (10ms) finishes before call_t1 (30ms)
    registryMock.runTool.mockImplementation(async (_name, args) => {
      const q = (args as any)?.query;
      if (q === "q2") {
        await new Promise((r) => setTimeout(r, 10));
      } else {
        await new Promise((r) => setTimeout(r, 30));
      }
      return { ok: true, data: { success: true, data: [] } };
    });

    const req = fakeReq({
      messages: [{ role: "user", content: "Two queries." }],
      sessionId: "sess-parallel-no-stream",
      runId: "run-act-456",
    });
    const res = fakeRes();

    await kemmaStreamRoute(req, res);

    const activityFrames = parseFrames(res.activityFrames);
    const toolActivity = activityFrames.filter((f) => (f.data as any).kind === "search");

    for (const callId of ["call_t1", "call_t2"]) {
      const callEvents = toolActivity.filter((f) => (f.data as any).id === callId);
      expect(callEvents).toHaveLength(2);

      const startEvent = callEvents[0];
      const endEvent = callEvents[1];

      expect((startEvent.data as any).status).toBe("running");
      expect((endEvent.data as any).status).toBe("done");
      expect((endEvent.data as any).id).toBe(callId);
    }
  });
});
