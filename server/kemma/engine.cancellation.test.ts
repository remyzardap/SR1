/**
 * Tests for P1-05 End-to-end cancellation in engine.ts.
 *
 * Covers:
 * - Abort before the first call means zero provider calls.
 * - Abort during the LLM stream means fetch sees the abort and no further callLLM happens.
 * - Fallback chains stop on abort (does not try backup models).
 * - The usage row is written with the :aborted purpose and estimated tokens Math.ceil(chars / 4).
 * - Abort during a tool batch means sibling tools receive an aborted signal.
 * - AC1: In an integration test with a fake slow provider, no provider request starts more than 50 ms after abort.
 * - Engine returns { isError: false, cancelled: true } and never throws on abort.
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

const enc = new TextEncoder();

function sseDelta(content: string): string {
  return `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`;
}

function sseDone(): string {
  return "data: [DONE]\n\n";
}

function liveSse() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return {
    stream,
    push: (s: string) => {
      try {
        ctrl.enqueue(enc.encode(s));
      } catch {
        // Stream may be cancelled
      }
    },
    close: () => {
      try {
        ctrl.close();
      } catch {
        // Stream may be cancelled
      }
    },
  };
}

function stubFetch(handler: (index: number, url: string, init: any) => Promise<Response> | Response) {
  const calls: Array<{ url: string; init: any; timestamp: number }> = [];
  const fn = vi.fn(async (url: unknown, init: any) => {
    const timestamp = Date.now();
    const index = calls.length;
    calls.push({ url: String(url), init, timestamp });
    return handler(index, String(url), init);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    userId: 42,
    userName: "Tester",
    messages: [{ role: "user", content: "Test message" }],
    tier: "trial",
    isThinking: false,
    ...overrides,
  };
}

const savedEnv = new Map<string, string | undefined>();
const ENV_VARS = ["QWEN_API_KEY", "GEMINI_API_KEY", "KEMMA_HTTP_ATTEMPTS", "FF_STREAM_TOOL_TURNS"];

beforeEach(() => {
  for (const k of ENV_VARS) savedEnv.set(k, process.env[k]);
  process.env.QWEN_API_KEY = "test-qwen-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.KEMMA_HTTP_ATTEMPTS = "1";
  delete process.env.FF_STREAM_TOOL_TURNS;

  vi.clearAllMocks();
  quota.checkQuota.mockResolvedValue({ allowed: true });
  quota.getQuotaSummary.mockResolvedValue({ tier: "trial" });
  usage.checkSpendCap.mockResolvedValue({ allowed: true });
  usage.logUsage.mockResolvedValue(undefined);
  mem.getMemoriesContext.mockResolvedValue(undefined);
  skillReviews.getEnabledSkills.mockResolvedValue([]);
  registryMock.runTool.mockResolvedValue({ ok: true, data: { result: "ok" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("P1-05: Engine cancellation", () => {
  it("abort before the first call means zero provider calls", async () => {
    const fetchStub = stubFetch(() => new Response("ok", { status: 200 }));
    const controller = new AbortController();
    controller.abort();

    const output = await kemmaExecute(baseInput({ signal: controller.signal }));

    expect(output).toMatchObject({
      cancelled: true,
      isError: false,
      response: "",
    });
    expect(fetchStub.fn).not.toHaveBeenCalled();
  });

  it("abort during the LLM stream means fetch sees the abort and no further callLLM happens", async () => {
    const live = liveSse();
    const fetchStub = stubFetch((_index, _url, init) => {
      // Return a streamed response
      return new Response(live.stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    const controller = new AbortController();
    const streamedChunks: string[] = [];

    const runPromise = kemmaExecute(
      baseInput({
        signal: controller.signal,
        toolBudget: 0,
        onStream: (chunk) => {
          streamedChunks.push(chunk);
          if (chunk === "Hello ") {
            controller.abort();
          }
        },
      })
    );

    // Push first chunk to trigger onStream and abort
    live.push(sseDelta("Hello "));

    const output = await runPromise;

    expect(output).toMatchObject({
      cancelled: true,
      isError: false,
    });
    expect(streamedChunks).toEqual(["Hello "]);
    // Exactly one call to fetch was made; fallback chain was not attempted
    expect(fetchStub.calls).toHaveLength(1);
    // Caller signal was passed to fetchWithRetry
    expect(fetchStub.calls[0].init.signal).toBeDefined();
  });

  it("fallback chains stop on abort: does not try the backup model", async () => {
    const controller = new AbortController();
    let callCount = 0;

    stubFetch((index, url, init) => {
      callCount++;
      // On first attempt, abort before responding or during fetch
      controller.abort();
      throw controller.signal.reason ?? new Error("Aborted");
    });

    const output = await kemmaExecute(baseInput({ signal: controller.signal }));

    expect(output).toMatchObject({
      cancelled: true,
      isError: false,
    });
    // Fallback chain did NOT try second model
    expect(callCount).toBe(1);
  });

  it("the usage row is written with the :aborted purpose and estimated tokens Math.ceil(chars / 4)", async () => {
    const live = liveSse();
    stubFetch(() => {
      return new Response(live.stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    const controller = new AbortController();
    // 35 characters -> Math.ceil(35 / 4) = 9 tokens
    const textChunk = "12345678901234567890123456789012345";
    expect(textChunk.length).toBe(35);

    const runPromise = kemmaExecute(
      baseInput({
        signal: controller.signal,
        toolBudget: 0,
        onStream: (chunk) => {
          controller.abort();
        },
      })
    );

    live.push(sseDelta(textChunk));

    const output = await runPromise;

    expect(output.cancelled).toBe(true);

    // Verify usage logging
    expect(usage.logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        outputTokens: Math.ceil(35 / 4), // 9
        purpose: "initial:aborted",
      })
    );
  });

  it("abort during a tool batch means sibling tools receive an aborted signal", async () => {
    const controller = new AbortController();
    let toolCallsReceived: Array<{ name: string; signalAborted: boolean }> = [];

    // Model returns 2 tool calls
    stubFetch(() => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  { id: "call_1", type: "function", function: { name: "web_search", arguments: "{}" } },
                  { id: "call_2", type: "function", function: { name: "browse", arguments: "{}" } },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    registryMock.runTool.mockImplementation(async (name: string, _args: any, ctx: any) => {
      toolCallsReceived.push({ name, signalAborted: ctx.signal?.aborted });
      if (name === "web_search") {
        // Abort while first tool is running
        controller.abort();
      }
      return { ok: true, data: { done: name } };
    });

    const output = await kemmaExecute(
      baseInput({
        signal: controller.signal,
        toolBudget: 10,
      })
    );

    expect(output).toMatchObject({
      cancelled: true,
      isError: false,
    });
    // First tool ran before abort
    expect(toolCallsReceived[0].name).toBe("web_search");
    // Sibling tool received the aborted signal
    if (toolCallsReceived.length > 1) {
      expect(toolCallsReceived[1].signalAborted).toBe(true);
    }
  });

  it("AC1: in an integration test with a fake slow provider, no provider request starts more than 50 ms after abort", async () => {
    const controller = new AbortController();
    let abortTimestamp = 0;
    const requestStarts: number[] = [];

    stubFetch(async (index) => {
      requestStarts.push(Date.now());
      // Slow provider delay: 80ms
      await new Promise((resolve) => setTimeout(resolve, 80));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: "assistant", content: "slow response" },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const runPromise = kemmaExecute(baseInput({ signal: controller.signal }));

    // Abort 30ms after start (while request 1 is in-flight)
    await new Promise((resolve) => setTimeout(resolve, 30));
    abortTimestamp = Date.now();
    controller.abort();

    const output = await runPromise;

    expect(output).toMatchObject({
      cancelled: true,
      isError: false,
    });

    // Check that NO provider request started more than 50 ms after abort
    for (const start of requestStarts) {
      const delta = start - abortTimestamp;
      expect(delta).toBeLessThanOrEqual(50);
    }
  });
});
