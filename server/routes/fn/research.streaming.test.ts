/**
 * Tests for P1-03 SSE stream events in handleResearch when STREAM_TOOL_TURNS is enabled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const engine = vi.hoisted(() => ({ kemmaExecute: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn(), checkQuota: vi.fn() }));
const doc = vi.hoisted(() => ({ bytesToText: vi.fn() }));
const fetcher = vi.hoisted(() => ({ fetchCapped: vi.fn(), MAX_REFERENCE_FILES: 5 }));
const llm = vi.hoisted(() => ({ stream: vi.fn(), LlmUnavailableError: class LlmUnavailableError extends Error {} }));

vi.mock("../../kemma/engine", () => engine);
vi.mock("../../core/quotaCheck", () => quota);
vi.mock("../../lib/fnDocument", () => doc);
vi.mock("../../lib/fnFetch", () => fetcher);
vi.mock("../../lib/fnLlm", () => llm);

import { handleResearch } from "./research";

function fakeRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    frames: [] as string[],
    headers: {} as Record<string, string>,
    ended: false,
    writableEnded: false,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    write(chunk: string) {
      this.frames.push(chunk);
    },
    end() {
      this.ended = true;
      this.writableEnded = true;
    },
    on() {},
  };
}

const request = (body: unknown) => ({ body, on: () => {} } as never);

function parseSse(raw: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  for (const block of raw.split("\n\n")) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (data) events.push({ event, data });
  }
  return events;
}

const engineOutput = {
  response: "Research answer with [1] citation.",
  toolCalls: [],
  isAgentic: true,
  tokensUsed: { input: 100, output: 50, total: 150 },
  modelsUsed: ["qwen3.8-max (qwen)"],
  stepsUsed: 2,
  durationMs: 1000,
  sources: [{ id: 1, url: "https://example.com/a", title: "Source A" }],
};

const question = {
  messages: [{ role: "user", content: "What changed in nickel policy?" }],
  runId: "research-run-456",
};

const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  vi.clearAllMocks();
  savedEnv.set("FF_STREAM_TOOL_TURNS", process.env.FF_STREAM_TOOL_TURNS);
  process.env.FF_STREAM_TOOL_TURNS = "1";

  quota.checkQuota.mockResolvedValue({ allowed: true, remaining: 5 });
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  engine.kemmaExecute.mockResolvedValue(engineOutput);
  fetcher.fetchCapped.mockResolvedValue({ buffer: Buffer.from("file bytes"), contentType: "application/pdf", bytes: 10 });
  doc.bytesToText.mockResolvedValue("extracted file text");
});

afterEach(() => {
  if (savedEnv.get("FF_STREAM_TOOL_TURNS") === undefined) {
    delete process.env.FF_STREAM_TOOL_TURNS;
  } else {
    process.env.FF_STREAM_TOOL_TURNS = savedEnv.get("FF_STREAM_TOOL_TURNS");
  }
});

describe("handleResearch with STREAM_TOOL_TURNS enabled", () => {
  it("emits meta first and forwards thinking, segment, and tool id events", async () => {
    const res = fakeRes();

    engine.kemmaExecute.mockImplementationOnce(async (input: any) => {
      input.onReasoning?.("Thinking about nickel...");
      input.onToolStart?.("web_search", { query: "nickel" }, "call_res_1");
      input.onToolEnd?.("web_search", { data: [] }, 100, "call_res_1");
      input.onSegmentEnd?.("narration");
      input.onStream?.("Research answer with [1] citation.");
      input.onSegmentEnd?.("answer");
      return engineOutput;
    });

    await handleResearch(7, request(question), res as never);
    const parsed = parseSse(res.frames.join(""));
    const events = parsed.map((e) => e.event);

    expect(events[0]).toBe("meta");
    expect(JSON.parse(parsed[0].data)).toEqual({ protocol: 2, runId: "research-run-456" });

    expect(events).toContain("thinking");
    expect(events).toContain("segment");
    expect(events).toContain("tool_start");
    expect(events).toContain("tool_end");

    const thinking = parsed.find((e) => e.event === "thinking");
    expect(JSON.parse(thinking!.data)).toBe("Thinking about nickel...");

    const toolStart = parsed.find((e) => e.event === "tool_start");
    expect(JSON.parse(toolStart!.data)).toEqual({
      id: "call_res_1",
      tool: "web_search",
      input: { query: "nickel" },
    });

    const toolEnd = parsed.find((e) => e.event === "tool_end");
    expect(JSON.parse(toolEnd!.data)).toMatchObject({
      id: "call_res_1",
      tool: "web_search",
    });

    const segments = parsed.filter((e) => e.event === "segment");
    expect(segments.map((s) => JSON.parse(s.data).kind)).toEqual(["narration", "answer"]);
  });
});
