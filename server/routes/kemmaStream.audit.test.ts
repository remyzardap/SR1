/**
 * Audit tests (area 1: chat engine, route level). /api/kemma/stream is traced end to end
 * through the REAL kemmaExecute with mocked fetch and mocked side-effect modules, plus
 * targeted fake req/res objects for the SSE contract, persistence, quota and abort paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const kmax = vi.hoisted(() => ({
  executeToolCall: vi.fn(),
  MAX_TOOL_CALLS: { free: 2, trial: 20, pro: 20, max: 100 } as Record<string, number>,
  DEEP_RESEARCH_ADDITION: "[deep-research-addition]",
}));
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
}));

vi.mock("../kemma/kemmaMax", () => kmax);
vi.mock("../core/quotaCheck", () => quota);
vi.mock("../core/usage", () => usageMock);
vi.mock("../kemma/memory", () => mem);
vi.mock("../kemma/skillReviews", () => skillReviews);
vi.mock("../kemma/fileSkills", () => fileSkills);
vi.mock("../kemma/mcp/client", () => mcp);
vi.mock("../services/google", () => google);
vi.mock("../db", () => db);

import { kemmaStreamRoute } from "./kemmaStream";

// ── env handling ─────────────────────────────────────────────────────────────
const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "KEMMA_MODEL_CHAT", "KEMMA_MODEL_REPORT", "KEMMA_MODEL_LONG_DOC", "KEMMA_MODEL_VISION",
  "KEMMA_MODEL_PLANNER", "KEMMA_MODEL_VERIFY", "KEMMA_MODEL_PRO", "KEMMA_MODEL_PRO_FALLBACK",
  "KEMMA_MODEL_FALLBACK", "KEMMA_MODEL_SEARCH", "KEMMA_TOOL_BUDGET", "KEMMA_MAX_SUBAGENTS",
  "KEMMA_UNLIMITED_USER_IDS", "QWEN_API_KEY", "GEMINI_API_KEY", "SONAR_API_KEY",
  "PERPLEXITY_API_KEY", "LITELLM_BASE_URL", "LITELLM_API_KEY", "KOBOILLM_API_KEY",
];
const savedEnv = new Map<string, string | undefined>();

const ALLOWED = { allowed: true, remaining: 99, limit: 100, resetAt: new Date() };
const BLOCKED = (reason: string) => ({ allowed: false, remaining: 0, limit: 20, resetAt: new Date(), reason });

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ENV_NAMES) {
    savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.QWEN_API_KEY = "q";
  process.env.GEMINI_API_KEY = "studio-key";

  quota.checkQuota.mockResolvedValue(ALLOWED);
  quota.incrementQuota.mockResolvedValue(undefined);
  quota.getQuotaSummary.mockResolvedValue({ tier: "trial" });
  usageMock.logUsage.mockResolvedValue(undefined);
  usageMock.checkSpendCap.mockResolvedValue({ allowed: true });
  mem.getMemoriesContext.mockResolvedValue(undefined);
  skillReviews.getEnabledSkills.mockResolvedValue([]);
  mcp.getMcpRegistry.mockReturnValue({ tools: async () => [] });
  google.getConnectionStatus.mockResolvedValue({ connected: false });
  kmax.executeToolCall.mockResolvedValue({ success: true, data: [] });
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

// ── fake req/res ─────────────────────────────────────────────────────────────
function fakeReq(body: any, user: any = { id: 1, name: "Ruth" }) {
  const handlers: Record<string, Array<() => void>> = {};
  return {
    user,
    body,
    on(event: string, cb: () => void) { (handlers[event] ??= []).push(cb); },
    closeNow() { for (const cb of handlers["close"] ?? []) cb(); },
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
    // Live-activity timeline frames ("event: activity") are covered by kemma/activity.test.ts and the
    // dedicated test below; keeping them out of `frames` leaves the wire-format assertions intact.
    activityFrames: [] as string[],
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.jsonBody = payload; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
    flushHeaders() { this.headersSent = true; },
    write(chunk: string) {
      const text = String(chunk);
      (text.startsWith("event: activity\n") ? this.activityFrames : this.frames).push(text);
    },
    end() { this.ended = true; },
    on(event: string, cb: () => void) { (handlers[event] ??= []).push(cb); },
    // The route watches the response side for a real disconnect (res "close" while not ended).
    closeNow() { for (const cb of handlers["close"] ?? []) cb(); },
  } as any;
}

interface SseFrame { event: string; data: unknown; raw: string; }

function parseFrames(frames: string[]): SseFrame[] {
  const out: SseFrame[] = [];
  for (const raw of frames) {
    if (raw.startsWith(":")) { out.push({ event: "ping", data: raw, raw }); continue; }
    const m = raw.match(/^event: (.+)\ndata: ([\s\S]*)\n\n$/);
    if (!m) throw new Error(`unparseable SSE frame: ${JSON.stringify(raw)}`);
    out.push({ event: m[1], data: JSON.parse(m[2]), raw });
  }
  return out;
}

async function until(cond: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("condition timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

// ── fetch helpers (same shapes as engine.audit.test.ts) ─────────────────────
const enc = new TextEncoder();

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function completion(content: string | null, extra: { usage?: unknown; toolCalls?: unknown[]; finish?: string } = {}): any {
  const message: any = { role: "assistant", content };
  if (extra.toolCalls) message.tool_calls = extra.toolCalls;
  return {
    choices: [{ message, finish_reason: extra.finish ?? (extra.toolCalls ? "tool_calls" : "stop") }],
    ...(extra.usage ? { usage: extra.usage } : {}),
  };
}

function stubFetch(handler: (index: number, body: any) => Response) {
  const calls: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init: any) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const index = calls.length;
    calls.push({ url: String(url), body });
    return handler(index, body);
  }));
  return { calls };
}

function sseDelta(content: string): string {
  return `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`;
}
const SSE_DONE = "data: [DONE]\n\n";

function liveSse() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } });
  return {
    stream,
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    close: () => ctrl.close(),
  };
}

const USER_BODY = {
  messages: [{ role: "user", content: "What is 2+2?" }],
  sessionId: "sess-9",
};

// ── (a) end to end direct answer ─────────────────────────────────────────────
describe("stream route: direct answer end to end", () => {
  it("client receives the answer as token data plus usage and done events", async () => {
    stubFetch(() => jsonRes(completion("It is 4.", { usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 } })));
    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    const events = parseFrames(res.frames).map((f) => f.event);
    expect(events).toEqual(["model", "token", "usage", "done"]);
    const frames = parseFrames(res.frames);
    expect(frames[0].data).toEqual({ step: 1, label: "qwen3.8-max (qwen)" });
    expect(frames[1].data).toBe("It is 4.");
    expect(frames[2].data).toEqual({ inputTokens: 11, outputTokens: 5, totalTokens: 16 });
    expect(frames[3].data).toBe("qwen3.8-max (qwen)");
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    expect(res.ended).toBe(true);
  });

  it("(l) persists the user message before the run and the assistant message once after", async () => {
    stubFetch(() => jsonRes(completion("It is 4.")));
    const req = fakeReq({ ...USER_BODY, settings: { mode: "fast" } });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    expect(db.addChatMessage).toHaveBeenCalledTimes(2);
    expect(db.addChatMessage.mock.calls[0]).toEqual(["sess-9", 1, "What is 2+2?", "user", undefined, { mode: "fast" }]);
    expect(db.addChatMessage.mock.calls[1]).toEqual(["sess-9", 1, "It is 4.", "assistant", "qwen3.8-max (qwen)"]);
  });

  it("without a sessionId nothing is persisted but tokens still stream", async () => {
    stubFetch(() => jsonRes(completion("It is 4.")));
    const req = fakeReq({ messages: [{ role: "user", content: "hi" }] });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    expect(db.addChatMessage).not.toHaveBeenCalled();
    expect(parseFrames(res.frames).map((f) => f.event)).toContain("token");
  });
});

// ── (d) blank-chat class 1: stream=true answered with plain JSON ─────────────
describe("stream route: provider ignores stream=true and returns plain JSON", () => {
  it("the answer still reaches the client as a token event (was zero tokens plus done)", async () => {
    // tool budget 0 forces the engine to request stream=true on step 1.
    kmax.MAX_TOOL_CALLS.trial = 0;
    stubFetch(() => jsonRes(completion("Plain JSON reply.")));
    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    const frames = parseFrames(res.frames);
    const token = frames.find((f) => f.event === "token");
    expect(token).toBeDefined();
    expect(token!.data).toBe("Plain JSON reply.");
    expect(db.addChatMessage).toHaveBeenCalledWith("sess-9", 1, "Plain JSON reply.", "assistant", "qwen3.8-max (qwen)");
  });
});

// ── (e) null content with finish_reason length ───────────────────────────────
describe("stream route: null content with finish_reason length", () => {
  it("the engine's 'Done.' fallback reaches the client as one token event and is persisted", async () => {
    stubFetch(() => jsonRes({ choices: [{ message: { role: "assistant", content: null }, finish_reason: "length" }] }));
    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    const frames = parseFrames(res.frames);
    expect(frames.map((f) => f.event)).toEqual(["model", "token", "usage", "done"]);
    expect(frames[1].data).toBe("Done.");
    expect(db.addChatMessage.mock.calls[1]).toEqual(["sess-9", 1, "Done.", "assistant", "qwen3.8-max (qwen)"]);
  });
});

// ── (i) blank-chat class 2: every model failing / quota-blocked engine ──────
describe("stream route: all models fail", () => {
  it("client receives an error event (not a silent blank message) and nothing is persisted", async () => {
    stubFetch(() => new Response("provider down", { status: 500 }));
    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    const frames = parseFrames(res.frames);
    const eventNames = frames.map((f) => f.event);
    expect(eventNames).toContain("error");
    expect(eventNames[eventNames.length - 1]).toBe("error");
    expect(String(frames[frames.length - 1].data)).toContain("All models failed");
    expect(eventNames).not.toContain("token");
    expect(eventNames).not.toContain("done");
    expect(eventNames).not.toContain("usage");
    // only the user message is persisted; the error text never becomes an assistant message
    expect(db.addChatMessage).toHaveBeenCalledTimes(1);
    expect(db.addChatMessage.mock.calls[0][3]).toBe("user");
    expect(res.ended).toBe(true);
  });

  it("a quota block discovered inside the engine after the route pre-check also becomes an error event", async () => {
    // 1st checkQuota call: the route pre-check passes. 2nd: the engine's own check races and blocks.
    let messageChecks = 0;
    quota.checkQuota.mockImplementation(async (_id: number, action: string) => {
      if (action === "message") {
        messageChecks += 1;
        if (messageChecks >= 2) return BLOCKED("Daily message limit reached (200/day on trial)");
      }
      return ALLOWED;
    });
    stubFetch(() => jsonRes(completion("never called")));
    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    const frames = parseFrames(res.frames);
    expect(frames.map((f) => f.event)).toEqual(["error"]);
    expect(frames[0].data).toBe("Daily message limit reached (200/day on trial)");
    expect(db.addChatMessage).toHaveBeenCalledTimes(1); // user only
  });
});

// ── (m) pre-stream quota 429s ────────────────────────────────────────────────
describe("stream route: pre-stream quota checks", () => {
  it("message limit exhausted -> 429 JSON, no SSE at all", async () => {
    quota.checkQuota.mockImplementation(async (_id: number, action: string) =>
      action === "message" ? BLOCKED("Daily message limit reached (200/day on trial)") : ALLOWED);
    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    expect(res.statusCode).toBe(429);
    expect(res.jsonBody).toEqual({ error: "Daily message limit reached (200/day on trial)" });
    expect(res.frames).toEqual([]);
    expect(res.headersSent).toBe(false);
    expect(db.addChatMessage).not.toHaveBeenCalled();
  });

  it("think limit exhausted on an isThinking request -> 429 JSON with the think reason", async () => {
    quota.checkQuota.mockImplementation(async (_id: number, action: string) =>
      action === "think" ? BLOCKED("Daily Think limit reached") : ALLOWED);
    const req = fakeReq({ ...USER_BODY, isThinking: true });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    expect(res.statusCode).toBe(429);
    expect(res.jsonBody).toEqual({ error: "Daily Think limit reached" });
    expect(res.frames).toEqual([]);
  });

  it("a successful run increments message (and token) quota", async () => {
    stubFetch(() => jsonRes(completion("It is 4.", { usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } })));
    await kemmaStreamRoute(fakeReq({ ...USER_BODY }), fakeRes());
    expect(quota.incrementQuota).toHaveBeenCalledWith(1, "message");
    expect(quota.incrementQuota).toHaveBeenCalledWith(1, "token", 3);
  });
});

// ── validation ───────────────────────────────────────────────────────────────
describe("stream route: request validation", () => {
  it("401 without a session user", async () => {
    const req = fakeReq({ ...USER_BODY }, undefined);
    (req as any).user = undefined;
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("400 without messages", async () => {
    const req = fakeReq({ messages: [] });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "messages required" });
  });
});

// ── (n) thinking/voice through the route ─────────────────────────────────────
describe("stream route: thinking and voice flags", () => {
  it("isThinking routes step 1 to the long-doc slot and isVoice swaps in the voice prompt", async () => {
    process.env.KEMMA_MODEL_LONG_DOC = "qwen-long";
    const net = stubFetch(() => jsonRes(completion("Deep voice answer.")));
    const req = fakeReq({ ...USER_BODY, isThinking: true, isVoice: true });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    expect(net.calls[0].body.model).toBe("qwen-long");
    expect(net.calls[0].body.messages[0].content).toContain("## Voice mode");
    expect(quota.checkQuota).toHaveBeenCalledWith(1, "think");
    expect(quota.incrementQuota).toHaveBeenCalledWith(1, "think");
  });
});

// ── (o) thread model settings never reach the engine as an override ─────────
describe("stream route: modelOverride wiring", () => {
  it("resolveSettings pins model to auto, so a thread-level model choice is ignored downstream", async () => {
    db.getChatSessionSettings.mockResolvedValue({ model: "gemini-3.1-pro-preview" });
    const net = stubFetch(() => jsonRes(completion("Auto answer.")));
    await kemmaStreamRoute(fakeReq({ ...USER_BODY }), fakeRes());
    // The client-supplied/thread model never becomes a modelOverride: the request used the
    // chat slot. (Deliberate per settings.ts, but the thread setting is then dead weight.)
    expect(net.calls[0].body.model).toBe("qwen3.8-max");
  });
});

// ── (j) tool flow through the route ──────────────────────────────────────────
describe("stream route: tool use frames", () => {
  it("emits tool_start/agent/tool_end, the final token, and a sources event", async () => {
    kmax.executeToolCall.mockResolvedValue({
      success: true,
      data: [{ url: "https://a.example", title: "Alpha", snippet: "A site" }],
    });
    const toolCall = { id: "tc1", type: "function", function: { name: "web_search", arguments: '{"query":"routers"}' } };
    stubFetch((i) => (i === 0 ? jsonRes(completion(null, { toolCalls: [toolCall] })) : jsonRes(completion("Clear skies [1]."))));
    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    await kemmaStreamRoute(req, res);
    const frames = parseFrames(res.frames);
    const events = frames.map((f) => f.event);
    expect(events).toEqual(["model", "tool_start", "agent", "tool_end", "model", "token", "sources", "usage", "done"]);
    expect(frames[1].data).toEqual({ tool: "web_search", input: { query: "routers" } });
    expect(frames[3].data).toMatchObject({ tool: "web_search", step: 0 });
    expect(frames[5].data).toBe("Clear skies [1].");
    expect(frames[6].data).toEqual([{ id: 1, url: "https://a.example", title: "Alpha", snippet: "A site" }]);
    // (q) the done payload is the last model label
    expect(frames[frames.length - 1].event).toBe("done");
    expect(frames[frames.length - 1].data).toBe("qwen3.8-max (qwen)");
    // the assistant message persists the streamed (pre-Sources-card) text once
    expect(db.addChatMessage).toHaveBeenCalledTimes(2);
    expect(db.addChatMessage.mock.calls[1][2]).toBe("Clear skies [1].");
  });
});

// ── (r) abort mid-run ────────────────────────────────────────────────────────
describe("stream route: client abort", () => {
  it("res close mid-run stops further events and skips persistence", async () => {
    kmax.MAX_TOOL_CALLS.trial = 0; // force the streaming request path so we can interleave
    const live = liveSse();
    stubFetch(() => new Response(live.stream, { status: 200 }));
    const req = fakeReq({ ...USER_BODY });
    const res = fakeRes();
    const run = kemmaStreamRoute(req, res);

    live.push(sseDelta("Hel"));
    await until(() => parseFrames(res.frames).some((f) => f.event === "token"));
    req.closeNow();
    live.push(sseDelta("lo"));
    live.push(SSE_DONE);
    live.close();
    await run;

    const frames = parseFrames(res.frames).filter((f) => f.event !== "model");
    expect(frames).toHaveLength(1); // only the pre-abort "Hel" token was written
    expect(frames[0].event).toBe("token");
    expect(frames[0].data).toBe("Hel");
    const events = parseFrames(res.frames).map((f) => f.event);
    expect(events).not.toContain("usage");
    expect(events).not.toContain("done");
    // the partially streamed assistant text is NOT persisted after abort
    expect(db.addChatMessage).toHaveBeenCalledTimes(1);
    expect(db.addChatMessage.mock.calls[0][3]).toBe("user");
    // aborted responses are already gone; the route must not call end() on them
    expect(res.ended).toBe(false);
  });
});

// ── heartbeat sanity (frame shape only, no 20s wait) ────────────────────────
describe("stream route: SSE framing", () => {
  it("every event frame is 'event: X\\ndata: JSON\\n\\n'", async () => {
    stubFetch(() => jsonRes(completion("ok")));
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq({ ...USER_BODY }), res);
    for (const raw of res.frames) expect(raw.endsWith("\n\n")).toBe(true);
    expect(res.frames[1]).toBe('event: token\ndata: "ok"\n\n');
  });
});

describe("stream route: live activity feed", () => {
  it("sends running then done activity rows for thinking and writing, in order", async () => {
    stubFetch(() => jsonRes(completion("It is 4.", { usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 } })));
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq({ ...USER_BODY }), res);
    const rows = res.activityFrames.map((raw: string) => JSON.parse(raw.match(/data: (.*)\n\n$/)![1]));
    expect(rows.length).toBeGreaterThan(0);
    const think = rows.filter((r: any) => r.kind === "think");
    expect(think[0]).toMatchObject({ status: "running", label: "Thinking" });
    expect(think.at(-1)).toMatchObject({ status: "done" });
    const write = rows.filter((r: any) => r.kind === "write");
    expect(write.at(0)).toMatchObject({ status: "running", label: "Writing the answer" });
    expect(write.at(-1)).toMatchObject({ status: "done" });
  });
});
