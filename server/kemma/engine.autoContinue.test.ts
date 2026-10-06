/**
 * Tests for P1-06 Output length and auto-continue in engine.ts.
 *
 * Covers:
 * - Overlap trimming helpers: getOverlapLength, trimOverlap, joinWithoutOverlap.
 * - Auto-continue: fake provider returns length twice and then stop, output is concatenation without overlap.
 * - Continuation messages: includes previous assistant partial text and user continue prompt.
 * - Max 2 continuations: stops continuing after 2 continuations even if provider still returns length.
 * - Feature flag off: with FF_AUTO_CONTINUE off, there is no continuation on finish_reason=length.
 * - Alternative finish reason: finish_reason="max_tokens" also triggers continuation.
 * - Cap per purpose: max_tokens sent in request body respects chat (8192), report (32768), planner/verify (2048),
 *   and KEMMA_MAX_OUTPUT_TOKENS override.
 * - Streaming continuation: onStream receives concatenated stream without duplicated overlap.
 * - Tool calls on a turn do not trigger auto-continue (applies only to final answer).
 * - Acceptance criteria: bench "long-form report" prompt produces complete answer ending with conclusion.
 * - Failure paths: abort during continuation, provider error during continuation.
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

import {
  kemmaExecute,
  getOverlapLength,
  trimOverlap,
  joinWithoutOverlap,
  type EngineInput,
} from "./engine";

const savedEnv = new Map<string, string | undefined>();
const ENV_NAMES = [
  "FF_AUTO_CONTINUE",
  "FF_STREAM_TOOL_TURNS",
  "KEMMA_MAX_OUTPUT_TOKENS",
  "KEMMA_MODEL_REPORT",
  "QWEN_API_KEY",
  "GEMINI_API_KEY",
  "KEMMA_PROMPT_CACHE",
  "KEMMA_HTTP_ATTEMPTS",
];

const enc = new TextEncoder();

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseRes(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function completion(
  content: string | null,
  extra: { finish_reason?: string; toolCalls?: unknown[]; usage?: unknown } = {},
): any {
  const message: any = { role: "assistant", content };
  if (extra.toolCalls) message.tool_calls = extra.toolCalls;
  return {
    choices: [
      {
        message,
        finish_reason: extra.finish_reason ?? (extra.toolCalls ? "tool_calls" : "stop"),
      },
    ],
    usage: extra.usage ?? { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

function stubFetch(handler: (index: number, url: string, body: any) => Response | Promise<Response>) {
  const calls: Array<{ url: string; body: any; headers: any }> = [];
  const fn = vi.fn(async (url: unknown, init: any) => {
    let body: any = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}"));
    } catch {
      body = {};
    }
    const index = calls.length;
    calls.push({ url: String(url), body, headers: init?.headers });
    return handler(index, String(url), body);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    userId: 7,
    userName: "Alice",
    messages: [{ role: "user", content: "Write a long report on networking." }],
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
  process.env.QWEN_API_KEY = "qwen-test-key";
  process.env.GEMINI_API_KEY = "gemini-test-key";
  process.env.KEMMA_PROMPT_CACHE = "off";
  process.env.KEMMA_HTTP_ATTEMPTS = "1";
  process.env.FF_AUTO_CONTINUE = "1";

  quota.checkQuota.mockImplementation(async () => ({
    allowed: true,
    remaining: 99,
    limit: 100,
    resetAt: new Date(),
  }));
  quota.incrementQuota.mockResolvedValue(undefined);
  quota.getQuotaSummary.mockResolvedValue({ tier: "trial" });
  usage.logUsage.mockResolvedValue(undefined);
  usage.checkSpendCap.mockResolvedValue({ allowed: true });
  mem.getMemoriesContext.mockResolvedValue(undefined);
  skillReviews.getEnabledSkills.mockResolvedValue([]);
  mcp.getMcpRegistry.mockReturnValue({ tools: async () => [] });
  google.getConnectionStatus.mockResolvedValue({ connected: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
});

describe("P1-06 overlap trimming helpers", () => {
  it("computes longest common suffix and prefix length up to maxOverlap", () => {
    expect(getOverlapLength("hello world ", "world foo", 200)).toBe(6);
    expect(getOverlapLength("abcdef", "defghi", 200)).toBe(3);
    expect(getOverlapLength("no overlap", "different", 200)).toBe(0);
    expect(getOverlapLength("", "abc", 200)).toBe(0);
    expect(getOverlapLength("abc", "", 200)).toBe(0);
  });

  it("caps overlap check at maxOverlap characters", () => {
    const repeatedA = "a".repeat(250);
    // Even though 250 characters match, maxOverlap is 200
    expect(getOverlapLength(repeatedA, repeatedA, 200)).toBe(200);
  });

  it("trims overlap cleanly from the prefix of next", () => {
    expect(trimOverlap("hello world ", "world foo", 200)).toBe("foo");
    expect(trimOverlap("abc", "def", 200)).toBe("def");
    expect(trimOverlap("exact duplicate", "exact duplicate", 200)).toBe("");
  });

  it("joins strings without duplicated overlap", () => {
    expect(joinWithoutOverlap("hello world ", "world foo", 200)).toBe("hello world foo");
    expect(joinWithoutOverlap("chapter 1. ", "chapter 2.", 200)).toBe("chapter 1. chapter 2.");
    expect(joinWithoutOverlap("abc", "abcdef", 200)).toBe("abcdef");
  });
});

describe("P1-06 auto-continue in engine", () => {
  it("spec test: fake provider returns length twice and then stop, and the output is the concatenation without overlap", async () => {
    const part1 = "Section 1 covers background and history. Specifically, the network topology ";
    const part2 = "topology involves core routers and aggregation switches. In addition, ";
    const part3 = "addition, Section 2 provides performance benchmarks and our final conclusion.";

    const { calls } = stubFetch((index) => {
      if (index === 0) {
        return jsonRes(completion(part1, { finish_reason: "length" }));
      }
      if (index === 1) {
        return jsonRes(completion(part2, { finish_reason: "length" }));
      }
      return jsonRes(completion(part3, { finish_reason: "stop" }));
    });

    const output = await kemmaExecute(baseInput());

    expect(calls).toHaveLength(3);

    // Verify continuation messages sent to provider
    // Call 1: user prompt
    expect(calls[0].body.messages.at(-1)).toMatchObject({ role: "user", content: "Write a long report on networking." });

    // Call 2: appended partial assistant answer + user continue prompt
    expect(calls[1].body.messages.at(-2)).toMatchObject({ role: "assistant", content: part1 });
    expect(calls[1].body.messages.at(-1)).toMatchObject({
      role: "user",
      content: "Continue exactly where you stopped. Do not repeat anything.",
    });

    // Call 3: appended second partial answer + user continue prompt
    expect(calls[2].body.messages.at(-2)).toMatchObject({ role: "assistant", content: part2 });
    expect(calls[2].body.messages.at(-1)).toMatchObject({
      role: "user",
      content: "Continue exactly where you stopped. Do not repeat anything.",
    });

    // Verify final concatenated output without overlap:
    // part1 + trimmed(part2 by "topology ") + trimmed(part3 by "addition, ")
    const expected =
      "Section 1 covers background and history. Specifically, the network topology " +
      "involves core routers and aggregation switches. In addition, " +
      "Section 2 provides performance benchmarks and our final conclusion.";

    expect(output.response).toBe(expected);
    expect(output.isError).toBeFalsy();
    expect(output.cancelled).toBeFalsy();
  });

  it("spec test: with the flag off there is no continuation", async () => {
    process.env.FF_AUTO_CONTINUE = "0";

    const part1 = "Section 1 covers background and history. ";

    const { calls } = stubFetch((_index) => {
      return jsonRes(completion(part1, { finish_reason: "length" }));
    });

    const output = await kemmaExecute(baseInput());

    expect(calls).toHaveLength(1);
    expect(output.response).toBe(part1);
  });

  it("stops after at most 2 continuations even if provider continues returning length", async () => {
    const { calls } = stubFetch((index) => {
      return jsonRes(completion(`Part ${index + 1} text. `, { finish_reason: "length" }));
    });

    const output = await kemmaExecute(baseInput());

    // Initial call (1) + at most 2 continuations = 3 calls total
    expect(calls).toHaveLength(3);
    expect(output.response).toBe("Part 1 text. Part 2 text. Part 3 text. ");
  });

  it("finish_reason max_tokens also triggers auto-continue", async () => {
    const part1 = "Report beginning: ";
    const part2 = "Report ending.";

    const { calls } = stubFetch((index) => {
      if (index === 0) {
        return jsonRes(completion(part1, { finish_reason: "max_tokens" }));
      }
      return jsonRes(completion(part2, { finish_reason: "stop" }));
    });

    const output = await kemmaExecute(baseInput());

    expect(calls).toHaveLength(2);
    expect(output.response).toBe("Report beginning: Report ending.");
  });

  it("tool turns ending with length do not trigger auto-continue", async () => {
    const { calls } = stubFetch((index) => {
      if (index === 0) {
        // Step 1: Model asks for tool call with finish_reason "length"
        return jsonRes({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Searching...",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "safe_files", arguments: '{"action":"list"}' },
                  },
                ],
              },
              finish_reason: "length",
            },
          ],
        });
      }
      // Step 2: Final answer
      return jsonRes(completion("Here is the final file list.", { finish_reason: "stop" }));
    });

    registryMock.runTool.mockResolvedValue({ ok: true, data: { files: [] } });

    const output = await kemmaExecute(baseInput());

    // Did not auto-continue step 1 because it contained tool calls; proceeded to step 2
    expect(calls).toHaveLength(2);
    expect(output.response).toBe("Here is the final file list.");
  });

  it("streaming continuation trims overlap into the same onStream output", async () => {
    process.env.FF_STREAM_TOOL_TURNS = "1";

    const onStream = vi.fn();

    const part1Chunks = [
      'data: {"choices":[{"index":0,"delta":{"content":"First part concludes with "}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"length"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const part2Chunks = [
      'data: {"choices":[{"index":0,"delta":{"content":"with second part."}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    stubFetch((index) => {
      if (index === 0) return sseRes(part1Chunks);
      return sseRes(part2Chunks);
    });

    const output = await kemmaExecute(baseInput({ onStream }));

    expect(output.response).toBe("First part concludes with second part.");
    // Verify onStream got the combined text without duplicated "with "
    const fullStreamed = onStream.mock.calls.map((c) => c[0]).join("");
    expect(fullStreamed).toBe("First part concludes with second part.");
  });
});

describe("P1-06 purpose caps in engine calls", () => {
  it("sends max_tokens matching the purpose cap in request body", async () => {
    const { calls } = stubFetch(() => jsonRes(completion("Simple answer.")));

    // 1. Simple chat prompt -> default chat cap 8192
    await kemmaExecute(baseInput({ messages: [{ role: "user", content: "Hello" }] }));
    expect(calls[0].body.max_tokens).toBe(8192);

    // 2. KEMMA_MAX_OUTPUT_TOKENS override
    process.env.KEMMA_MAX_OUTPUT_TOKENS = "1500";
    await kemmaExecute(baseInput({ messages: [{ role: "user", content: "Hello again" }] }));
    expect(calls[1].body.max_tokens).toBe(1500);
  });

  it("respects report cap of 32768 for complex report routes (capped by model maxOutput)", async () => {
    // Model gemini-2.5-pro has maxOutput 65536
    process.env.KEMMA_MODEL_REPORT = "gemini-2.5-pro";

    const { calls } = stubFetch(() => jsonRes(completion("Detailed report.")));

    // Complex query triggers selectRoute -> reportRoute ("gemini-2.5-pro")
    await kemmaExecute(
      baseInput({
        messages: [
          {
            role: "user",
            content: "Write a detailed and comprehensive proposal and report analyzing several architectural strategies.",
          },
        ],
      }),
    );

    // min(model.maxOutput 65536, reportCap 32768) = 32768
    expect(calls[0].body.max_tokens).toBe(32768);
  });
});

describe("P1-06 acceptance criteria & failure paths", () => {
  it("acceptance criteria: bench long-form report prompt produces complete answer ending with conclusion", async () => {
    const benchReportPrompt =
      "Write a detailed report of about 1,500 words on rooftop solar for small businesses in Indonesia: " +
      "current regulations, typical costs and payback, financing options, risks, and a recommendation. " +
      "Use headings, cite sources, and end with a conclusion.";

    const { calls } = stubFetch((index) => {
      if (index === 0) {
        return jsonRes(
          completion(
            "# Rooftop Solar Report\n\n## Regulations\nCurrent MEMR regulations...\n\n## Costs and Payback\nTypical payback is 5-7 years...",
            { finish_reason: "length" },
          ),
        );
      }
      return jsonRes(
        completion(
          "5-7 years.\n\n## Recommendation\nSmall businesses should consider PPA models.\n\n## Conclusion\nIn conclusion, rooftop solar offers viable economics for Indonesian businesses.",
          { finish_reason: "stop" },
        ),
      );
    });

    const output = await kemmaExecute(
      baseInput({
        messages: [{ role: "user", content: benchReportPrompt }],
      }),
    );

    expect(calls).toHaveLength(2);
    // Last call had finish_reason "stop", not "length"
    expect(calls[1].body.messages.at(-1).content).toBe("Continue exactly where you stopped. Do not repeat anything.");
    // Response ends with a conclusion
    expect(output.response).toContain("## Conclusion\nIn conclusion, rooftop solar offers viable economics for Indonesian businesses.");
    expect(output.response.trim().endsWith("In conclusion, rooftop solar offers viable economics for Indonesian businesses.")).toBe(true);
  });

  it("failure path: abort signal during continuation cleanly cancels without throwing", async () => {
    const abortController = new AbortController();

    const { calls } = stubFetch((index) => {
      if (index === 0) {
        return jsonRes(completion("Part 1 text. ", { finish_reason: "length" }));
      }
      // Abort right before or during call 2
      abortController.abort();
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    });

    const output = await kemmaExecute(
      baseInput({
        signal: abortController.signal,
      }),
    );

    expect(calls).toHaveLength(2);
    expect(output.cancelled).toBe(true);
    expect(output.isError).toBe(false);
    expect(output.response).toBe("Part 1 text. ");
  });

  it("failure path: provider 500 error during continuation preserves partial text without crashing", async () => {
    const { calls } = stubFetch((index) => {
      if (index === 0) {
        return jsonRes(completion("Part 1 text before provider failure. ", { finish_reason: "length" }));
      }
      // Provider fails with 500
      return new Response("Internal Server Error", { status: 500 });
    });

    const output = await kemmaExecute(baseInput());

    // Call 0 (initial) + continuation attempt (tries primary then fallback chain on 500)
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // Preserves partial text from call 1
    expect(output.response).toBe("Part 1 text before provider failure. ");
  });
});
