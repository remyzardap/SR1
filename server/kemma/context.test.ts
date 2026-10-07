/**
 * Tests for the context manager (P1-13): the fake tokenizer and its per-model calibration, budgets,
 * tool-result handles with `read_result`, and compaction with a cached summary.
 *
 * Named tests from docs/spec/PHASE-1.md §P1-13:
 * - "fits under budget with the fake tokenizer" — `estimate and budget`, `nothing happens when…`.
 * - "pairing invariant (property test)" — `pairing invariant holds for any generated transcript`.
 * - "compaction calls the LLM once; cache reused with the same prefix" — `compaction`.
 * - "`read_result` returns slices" — `read_result slices a stored result`.
 * - "nothing happens when under budget / flag off" — `nothing happens when under budget or the flag is off`.
 * AC1 (a 200-turn chat with 30 tool results stays under budget) is `AC1: …`.
 *
 * Every fixture here sizes itself on the real fake tokenizer, so the numbers are written as literals
 * with the arithmetic in the comment: 36 characters in one message is `ceil(36 / 3.6) + 4 = 14` tokens.
 * `resetCalibration()` runs before each test so no model carries a multiplier from an earlier one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  CACHE_MAX_AGE_MS,
  CHARS_PER_TOKEN,
  FULL_RESULT_MARKER,
  KEEP_LAST_MESSAGES,
  KEEP_RECENT_TOOL_ROUNDS,
  MAX_SLICE_CHARS,
  MAX_SUMMARY_CHARS,
  MIN_SHRINK_SAVING_CHARS,
  MIN_SUMMARY_CHARS,
  OUTPUT_RESERVE_TOKENS,
  PER_MESSAGE_TOKENS,
  RESULT_ID_PREFIX,
  SHRINK_CHAR_CAP,
  SUMMARY_PREFIX,
  ResultStore,
  calibrate,
  calibrationFor,
  compactSummaryText,
  contextBudgetFor,
  cutIndexAt,
  estimateRawTokens,
  estimateTokens,
  extractResultId,
  findPairingViolations,
  firstUserIndex,
  handleFreshResult,
  isCoreMemoryMessage,
  isResultId,
  isSummaryMessage,
  isUsableCache,
  looksLikeRefusal,
  manageContext,
  messageTokens,
  messageUnits,
  normalizeCacheEntry,
  prefixHash,
  protectedIndices,
  readResultSlice,
  recentToolCallIds,
  releaseResultStore,
  resetCalibration,
  resultHandle,
  resultStoreFor,
  shrinkToolResults,
  summaryMessage,
  transcriptForSummary,
  type CompactionCacheEntry,
} from "./context";
import type { KemmaMessage } from "./engine";
import { registerBuiltinTools } from "./toolkit/builtin";
import { registerTool, runTool, toolsFor } from "./toolkit/registry";
import type { ToolContext } from "./toolkit/types";
import { wrapUntrustedContent } from "./untrusted";

// `toolsFor` offers drive_* only when the user has a Google connection and vps_files only for admin
// users. Both are pinned by toolkit/toolParity.test.ts, so stub them here to keep the offered set a
// question about `read_result` and the flag rather than about this machine's credentials.
const adminStub = vi.hoisted(() => ({ isAdminUser: vi.fn(async () => false) }));
const googleStub = vi.hoisted(() => ({
  getConnectionStatus: vi.fn(async () => ({ connected: false })),
}));
vi.mock("./toolkit/executors/vpsFiles", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./toolkit/executors/vpsFiles")>();
  return { ...actual, isAdminUser: adminStub.isAdminUser };
});
vi.mock("./services/google", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./services/google")>();
  return { ...actual, getConnectionStatus: googleStub.getConnectionStatus };
});

registerBuiltinTools();

// The shrink step asks the tool that produced a result for its `summarize` and its `maxModelChars`.
// No builtin declares `summarize` today, so these local tools give every branch something to run on.
// Registering the same name again only overwrites it, which is why they are namespaced `ctx_*`.
registerTool({
  name: "ctx_probe",
  description: "Test tool whose result has a summarizer (P1-13).",
  args: z.object({ q: z.string() }).describe("Probe input."),
  risk: "read",
  parallelSafe: true,
  timeoutMs: 1_000,
  maxModelChars: 30_000,
  summarize: (result: unknown) =>
    `PROBE-SUMMARY ${JSON.stringify(result).slice(0, 40)}`,
  execute: async () => ({ ok: true }),
});
registerTool({
  name: "ctx_probe_refusal",
  description: "Test tool whose summarizer throws (P1-13).",
  args: z.object({ q: z.string() }).describe("Probe input."),
  risk: "read",
  parallelSafe: true,
  timeoutMs: 1_000,
  maxModelChars: 30_000,
  summarize: () => {
    throw new Error("summarizer exploded");
  },
  execute: async () => ({ ok: true }),
});
registerTool({
  name: "ctx_small",
  description: "Test tool with a small per-tool cap (P1-13).",
  args: z.object({ q: z.string() }).describe("Probe input."),
  risk: "read",
  parallelSafe: true,
  timeoutMs: 1_000,
  maxModelChars: 300,
  execute: async () => ({ ok: true }),
});

const SYSTEM_TEXT = "You are Sutaeru, a careful assistant.";
const MEMORY_TEXT = "<core_memory>Prefers terse answers.</core_memory>";
const SUMMARY_TEXT =
  "Earlier the user asked about the report; it lists 42 items and 3 are still open.";
const NOW = 1_700_000_000_000;

let runCounter = 0;
function nextRunId(): string {
  runCounter += 1;
  return `ctx-test-run-${runCounter}`;
}

function msg(
  role: KemmaMessage["role"],
  content: string | null,
  extra: Partial<KemmaMessage> = {},
): KemmaMessage {
  return { role, content, ...extra };
}

function toolCall(
  id: string,
  name = "browse",
  args: Record<string, unknown> = { url: "https://example.com/a" },
) {
  return {
    id,
    type: "function" as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

/** One answered tool round: the assistant asking for a call, then the result that answers it. */
function toolRound(
  index: number,
  chars: number,
  name = "browse",
): KemmaMessage[] {
  const id = `call_${index}`;
  return [
    msg("assistant", null, { tool_calls: [toolCall(id, name)] }),
    msg("tool", "y".repeat(chars), { tool_call_id: id, name }),
  ];
}

/** A padded question/answer chat: system, core memory, then `turns` pairs. No tool calls at all. */
function longChat(turns: number, filler: number): KemmaMessage[] {
  const out: KemmaMessage[] = [
    msg("system", SYSTEM_TEXT),
    msg("user", MEMORY_TEXT),
  ];
  for (let i = 0; i < turns; i++) {
    out.push(
      msg(
        "user",
        `Q${i}: what does the report say about item ${i}? ${"u".repeat(filler)}`,
      ),
    );
    out.push(msg("assistant", `A${i} ${"x".repeat(filler)}`));
  }
  return out;
}
/** An unanswered call, as the transcript holds it between the model's decision and the tool's reply. */
function pendingRound(index: number, name = "browse"): KemmaMessage {
  return msg("assistant", null, {
    tool_calls: [toolCall(`call_${index}`, name)],
  });
}

/** The legacy envelope `runTool` hands back, flattened so both failure shapes are readable. */
interface LegacyPayload {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  code?: string;
}
function asLegacy(outcome: Awaited<ReturnType<typeof runTool>>): LegacyPayload {
  if (outcome.ok) return outcome.data as unknown as LegacyPayload;
  return { success: false, error: outcome.error, code: outcome.code };
}

function baseCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 42,
    runId: nextRunId(),
    tier: "trial",
    signal: new AbortController().signal,
    emit: () => {},
    ...overrides,
  };
}

/** `resultStoreFor` only answers for a run that exists; the tests always pass one. */
function storeFor(runId: string): ResultStore {
  const store = resultStoreFor(runId);
  expect(store).toBeInstanceOf(ResultStore);
  return store as ResultStore;
}

beforeEach(() => {
  process.env.FF_CONTEXT_MANAGER = "1";
  resetCalibration();
});

afterEach(() => {
  delete process.env.FF_CONTEXT_MANAGER;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("estimate and budget", () => {
  it("charges ceil(chars / 3.6) plus a fixed per-message cost", () => {
    expect(CHARS_PER_TOKEN).toBeCloseTo(3.6, 10);
    expect(PER_MESSAGE_TOKENS).toBe(4);
    expect(messageTokens(msg("user", "x".repeat(36)))).toBe(14); // ceil(36 / 3.6) + 4
    expect(messageTokens(msg("user", "x".repeat(72)))).toBe(24);
    expect(messageTokens(msg("user", ""))).toBe(PER_MESSAGE_TOKENS);
    expect(messageTokens(msg("assistant", null))).toBe(PER_MESSAGE_TOKENS);
    // A tool call is billed for its arguments too, otherwise an assistant turn that asks for four
    // searches looks free to the budget and the next request overflows.
    const calling = msg("assistant", "x".repeat(36), {
      tool_calls: [
        toolCall("c1", "browse", { url: "https://example.com/long/enough" }),
      ],
    });
    expect(messageTokens(calling)).toBeGreaterThan(
      messageTokens(msg("assistant", "x".repeat(36))),
    );
    expect(estimateTokens([calling])).toBe(messageTokens(calling));
  });

  it("reserves the response and 2,000 tokens for reasoning from the model's window", () => {
    expect(OUTPUT_RESERVE_TOKENS).toBe(2000);
    // budget = contextWindow − max_tokens − 2000 (qwen3.8-max has a 128k window).
    expect(contextBudgetFor("qwen3.8-max", 4096)).toBe(
      128000 - 4096 - OUTPUT_RESERVE_TOKENS,
    );
    // The reserve is a parameter so a caller that bills a longer chain can widen it.
    expect(contextBudgetFor("qwen3.8-max", 4096, 4000)).toBe(
      128000 - 4096 - 4000,
    );
    // Omitting max_tokens subtracts the model's own output cap, never nothing.
    expect(contextBudgetFor("qwen3.8-max")).toBeLessThan(
      contextBudgetFor("qwen3.8-max", 0),
    );
    // A request bigger than the window still gets a usable budget instead of a negative one.
    expect(contextBudgetFor("qwen3.8-max", 128000)).toBe(1);
    // An unknown model is still budgeted, which is what keeps a test rig from dividing by nothing.
    expect(contextBudgetFor("mystery-model", 512)).toBeGreaterThan(1);
  });

  it("charges tool definitions as well as messages", () => {
    const tools = [
      {
        type: "function",
        function: {
          name: "browse",
          description: "Read a page.",
          parameters: { type: "object" },
        },
      },
    ];
    const chat = [msg("user", "hello")];
    // A turn with 40 tools defined has a real prompt cost even with an empty transcript.
    expect(estimateRawTokens([], tools)).toBe(
      Math.ceil(JSON.stringify(tools).length / CHARS_PER_TOKEN),
    );
    expect(estimateRawTokens(chat, tools)).toBe(
      estimateRawTokens(chat) + estimateRawTokens([], tools),
    );
  });

  it("calibrates the fake tokenizer per model and clamps the observed ratio", () => {
    const model = "calibration-test-model";
    expect(calibrationFor(model)).toBe(1);
    // The first observation replaces the neutral ratio, then new ones are mixed in at 0.3.
    expect(calibrate(model, 1000, 500)).toBe(0.5);
    expect(calibrationFor(model)).toBe(0.5);
    expect(calibrate(model, 1000, 2000)).toBeCloseTo(0.5 * 0.7 + 2 * 0.3, 10); // 0.635
    // Clamped: one bad response cannot swing the tokenizer by more than 5x either way…
    expect(calibrate(model, 1000, 1_000_000)).toBeCloseTo(
      0.95 * 0.7 + 5 * 0.3,
      10,
    );
    // …and the estimate stays inside the clamped band no matter what the provider reports.
    expect(calibrationFor(model)).toBeLessThanOrEqual(5);
    expect(calibrate("other-model", 1000, 1)).toBeGreaterThanOrEqual(0.2);
    // Zero usage on either side is ignored rather than divided by.
    const before = calibrationFor(model);
    expect(calibrate(model, 0, 500)).toBe(before);
    expect(calibrate(model, 500, 0)).toBe(before);
    expect(calibrationFor(model)).toBe(before);
    // A calibrated model scales the estimate: 36 chars is 14 tokens uncalibrated, 7 at 0.5.
    const coarse = "coarse-tokenizer";
    calibrate(coarse, 1000, 500);
    expect(
      estimateTokens([msg("user", "x".repeat(36))], undefined, coarse),
    ).toBe(7);
    expect(
      estimateTokens(
        [msg("user", "x".repeat(36))],
        undefined,
        "uncalibrated-model",
      ),
    ).toBe(14);
    resetCalibration();
    expect(calibrationFor(coarse)).toBe(1);
  });
});

describe("shrinking tool results", () => {
  it("keeps the first 1,500 characters plus a handle, and stashes the raw result", () => {
    // Three rounds: only the oldest may shrink, since the last two rounds stay whole. The first is
    // 100 characters over the cap, so a handle is worth it; the last is only 50 over.
    const input = [
      msg("system", SYSTEM_TEXT),
      ...toolRound(0, 1600), // the oldest round: long enough that a handle is worth it
      ...toolRound(1, 4000), // inside the last two rounds, so it keeps its body
      ...toolRound(2, 1550), // recent too, and only 50 characters over the cap anyway
      msg("user", "and now?"),
    ];
    const store = new ResultStore();
    const result = shrinkToolResults(input, store);
    expect(result.changed).toBe(true);
    expect(result.ids).toHaveLength(1);
    const shrunk = result.messages[2] as KemmaMessage;
    expect(shrunk.content).toBe(
      `${"y".repeat(SHRINK_CHAR_CAP)}\n${resultHandle(result.ids[0])}`,
    );
    expect(store.get(result.ids[0])).toBe(input[2]?.content); // the full body, not the head
    // Everything else is byte-identical, including the near-cap result.
    for (const index of [0, 1, 3, 4, 5, 6, 7]) {
      expect(result.messages[index]).toBe(input[index]);
    }
    expect(store.size).toBe(1);
    // A second pass finds nothing left to save.
    expect(shrinkToolResults(result.messages, store).changed).toBe(false);
  });

  it("shrinks every round but the last two, which is the order the model reads them in", () => {
    const input = [
      msg("system", SYSTEM_TEXT),
      ...toolRound(0, 3000),
      ...toolRound(1, 3000),
      ...toolRound(2, 3000),
      ...toolRound(3, 3000),
    ];
    const store = new ResultStore();
    const result = shrinkToolResults(input, store);
    expect(result.changed).toBe(true);
    // The last two rounds (indices 6 and 8) keep their bodies; the two before them are shrunk.
    expect(result.ids).toHaveLength(2);
    expect(
      result.messages
        .filter(
          (m) => m.role === "tool" && m.content?.includes(FULL_RESULT_MARKER),
        )
        .map((m) => m.tool_call_id),
    ).toEqual(["call_0", "call_1"]);
    expect(result.messages[6]?.content).toBe("y".repeat(3000));
    expect(result.messages[8]?.content).toBe("y".repeat(3000));
    for (const id of result.ids) {
      const message = result.messages.find((m) =>
        m.content?.includes(resultHandle(id)),
      );
      expect(message?.content?.length).toBeLessThanOrEqual(
        SHRINK_CHAR_CAP + resultHandle(id).length + 1,
      );
      expect(store.get(id)).toBe("y".repeat(3000));
    }
    // The last-resort pass shrinks the recent rounds as well.
    const all = shrinkToolResults(result.messages, store, {
      keepRecentToolRounds: 0,
    });
    expect(all.changed).toBe(true);
    expect(all.ids).toHaveLength(2);
  });

  it("replaces the body with the tool's own summary when it has one", () => {
    const body = { ok: true, rows: "z".repeat(5000) };
    const input = [
      msg("system", SYSTEM_TEXT),
      ...toolRound(0, 1, "ctx_probe"),
      msg("tool", JSON.stringify(body), {
        tool_call_id: "extra_0",
        name: "ctx_probe",
      }),
      ...toolRound(1, 1, "ctx_probe"),
      msg(
        "tool",
        wrapUntrustedContent({
          tool: "ctx_probe",
          source: "https://example.com/x",
          content: JSON.stringify(body),
        }),
        {
          tool_call_id: "extra_1",
          name: "ctx_probe",
        },
      ),
    ];
    const store = new ResultStore();
    const result = shrinkToolResults(input, store, { keepRecentToolRounds: 0 });
    const shrunk = result.messages.filter(
      (m) => m.role === "tool" && m.content?.includes(FULL_RESULT_MARKER),
    );
    // Only the two fat results were worth a handle; the 1-character ones stay byte-identical.
    expect(shrunk).toHaveLength(2);
    expect(result.messages[2]).toBe(input[2]);
    expect(result.messages[5]).toBe(input[5]);
    for (const message of shrunk) {
      expect(message.content).toContain("PROBE-SUMMARY");
      // The full JSON is what the handle reads back, not the summary.
      const id = extractResultId(message.content);
      expect(id).not.toBeNull();
      expect(store.get(id as string)).toBe(
        input.find((m) => m.tool_call_id === message.tool_call_id)?.content,
      );
    }
  });

  it("falls back to the head when a summarizer throws, and to the cap of the tool", () => {
    const input = [
      msg("assistant", null, {
        tool_calls: [toolCall("c1", "ctx_probe_refusal")],
      }),
      msg("tool", "q".repeat(4000), {
        tool_call_id: "c1",
        name: "ctx_probe_refusal",
      }),
      msg("assistant", null, { tool_calls: [toolCall("c2", "ctx_small")] }),
      msg("tool", "w".repeat(1000), { tool_call_id: "c2", name: "ctx_small" }),
    ];
    const store = new ResultStore();
    const result = shrinkToolResults(input, store, { keepRecentToolRounds: 0 });
    const refusal = result.messages[1]?.content as string;
    const small = result.messages[3]?.content as string;
    expect(refusal.startsWith("q".repeat(SHRINK_CHAR_CAP))).toBe(true);
    expect(refusal).toContain(FULL_RESULT_MARKER);
    // `ctx_small` declares maxModelChars 300, which is below the 1,500 default cap.
    expect(small.startsWith("w".repeat(300))).toBe(true);
    expect(small).not.toContain("w".repeat(301));
    expect(store.size).toBe(2);
  });

  it("re-closes the untrusted fence instead of handing the model an open tag", () => {
    const fenced = wrapUntrustedContent({
      tool: "browse",
      source: "https://example.com/a",
      content: "z".repeat(4000),
    });
    const input = [
      msg("assistant", null, { tool_calls: [toolCall("c1")] }),
      msg("tool", fenced, { tool_call_id: "c1", name: "browse" }),
    ];
    const store = new ResultStore();
    const shrunk = shrinkToolResults(input, store, { keepRecentToolRounds: 0 })
      .messages[1]?.content as string;
    // The cut happens inside the fence, so the fence is re-closed and the handle line is appended
    // after it: the model reads the handle as our instruction, not as quoted page content.
    expect(shrunk.startsWith("<untrusted_content")).toBe(true);
    expect(shrunk).toContain("</untrusted_content>\n[full result: ");
    expect((shrunk.match(/<\/untrusted_content>/g) ?? []).length).toBe(1);
    expect(shrunk.indexOf(FULL_RESULT_MARKER)).toBeGreaterThan(
      shrunk.lastIndexOf("</untrusted_content>"),
    );
    // The stashed body is the tool message verbatim, fence included — read_result strips it again.
    expect(store.get(extractResultId(shrunk) as string)).toBe(fenced);
    // The head itself respects the cap it was cut to, handle included.
    const headOnly = shrinkToolResults(
      [
        input[0],
        msg("tool", fenced, { tool_call_id: "c1", name: "ctx_small" }),
      ],
      new ResultStore(),
      {
        keepRecentToolRounds: 0,
      },
    ).messages[1]?.content as string;
    const headId = extractResultId(headOnly) as string;
    expect(headOnly.length).toBeLessThanOrEqual(
      300 + resultHandle(headId).length + 1,
    );
    expect(headOnly.startsWith("<untrusted_content")).toBe(true);
  });

  it("leaves non-string content, short bodies and already-shrunk results alone", () => {
    const id = `${RESULT_ID_PREFIX}abc123`;
    const input = [
      msg("assistant", null, { tool_calls: [toolCall("c1")] }),
      msg("tool", null, { tool_call_id: "c1", name: "browse" }),
      msg("tool", "y".repeat(MIN_SHRINK_SAVING_CHARS - 10), {
        tool_call_id: "c2",
        name: "browse",
      }),
      msg("tool", `${"y".repeat(4000)}\n${resultHandle(id)}`, {
        tool_call_id: "c3",
        name: "browse",
      }),
    ];
    const store = new ResultStore();
    const result = shrinkToolResults(input, store, { keepRecentToolRounds: 0 });
    expect(result.changed).toBe(false);
    expect(result.ids).toEqual([]);
    expect(store.size).toBe(0);
  });
});

describe("handles for fresh results", () => {
  it("replaces a long tool message before it enters the transcript", () => {
    const store = new ResultStore();
    const body = "r".repeat(3000);
    const handled = handleFreshResult({
      content: body,
      toolName: "browse",
      store,
    });
    expect(handled).not.toBeNull();
    const id = extractResultId(handled as string);
    expect(store.get(id as string)).toBe(body);
    expect((handled as string).length).toBeLessThan(body.length);
    expect(handled).toContain(resultHandle(id as string));
    // A second pass finds nothing left to save.
    expect(
      handleFreshResult({
        content: handled as string,
        toolName: "browse",
        store,
      }),
    ).toBeNull();
  });

  it("does nothing when the flag is off, the store is missing, or the result is short", () => {
    const store = new ResultStore();
    const body = "r".repeat(3000);
    delete process.env.FF_CONTEXT_MANAGER;
    expect(
      handleFreshResult({ content: body, toolName: "browse", store }),
    ).toBeNull();
    process.env.FF_CONTEXT_MANAGER = "1";
    expect(handleFreshResult({ content: body, toolName: "browse" })).toBeNull();
    expect(
      handleFreshResult({ content: "short result", toolName: "browse", store }),
    ).toBeNull();
    expect(store.size).toBe(0);
  });
});

describe("ResultStore and per-run stores", () => {
  it("mints ids that look like handles and evicts the oldest result when full", () => {
    const store = new ResultStore();
    const id = store.put({ any: "shape" });
    expect(isResultId(id)).toBe(true);
    expect(id.startsWith(RESULT_ID_PREFIX)).toBe(true);
    expect(store.has(id)).toBe(true);
    expect(store.get(id)).toEqual({ any: "shape" });
    expect(store.size).toBe(1);

    const tiny = new ResultStore(1);
    const first = tiny.put("first");
    const second = tiny.put("second");
    expect(tiny.has(first)).toBe(false);
    expect(tiny.has(second)).toBe(true);
    expect(readResultSlice(tiny, first).ok).toBe(false);
    expect(readResultSlice(tiny, second).text).toBe("second");
  });

  it("keeps one store per run and forgets it when the run ends", () => {
    expect(resultStoreFor(undefined)).toBeUndefined();
    expect(resultStoreFor("")).toBeUndefined();
    const runId = nextRunId();
    const other = nextRunId();
    try {
      const store = storeFor(runId);
      expect(storeFor(runId)).toBe(store); // stable for the whole run
      expect(storeFor(other)).not.toBe(store);
      const id = store.put("body");
      releaseResultStore(runId);
      expect(storeFor(runId)).not.toBe(store);
      expect((storeFor(runId) ?? new ResultStore()).has(id)).toBe(false);
    } finally {
      releaseResultStore(runId);
      releaseResultStore(other);
    }
  });

  it("sweeps a store that has been idle past its TTL, and caps how many stay live", () => {
    vi.useFakeTimers();
    const runId = nextRunId();
    const busy = nextRunId();
    try {
      const store = storeFor(runId);
      const id = store.put("body");
      vi.advanceTimersByTime(31 * 60 * 1000); // idle past RESULT_STORE_TTL_MS (30 minutes)
      const after = storeFor(runId);
      expect(after).not.toBe(store);
      expect(after.has(id)).toBe(false);
      releaseResultStore(runId);
    } finally {
      releaseResultStore(runId);
      releaseResultStore(busy);
      vi.useRealTimers();
    }
    // A run that never ended cannot keep the server's memory growing without bound.
    const ids = Array.from({ length: 70 }, () => nextRunId());
    const first = storeFor(ids[0]);
    for (const run of ids) expect(storeFor(run)).toBeInstanceOf(ResultStore);
    expect(storeFor(ids[0])).not.toBe(first);
    for (const run of ids) releaseResultStore(run);
  });
});

describe("read_result slices a stored result", () => {
  const body = "abcdefghij".repeat(1000); // 10,000 chars

  it("returns the requested window and reports what is left", () => {
    const store = new ResultStore();
    const id = store.put(body);

    const first = readResultSlice(store, id);
    expect(first.ok).toBe(true);
    expect(first.text).toBe(body.slice(0, MAX_SLICE_CHARS));
    expect(first.offset).toBe(0);
    expect(first.length).toBe(MAX_SLICE_CHARS);
    expect(first.totalChars).toBe(body.length);
    expect(first.remaining).toBe(body.length - MAX_SLICE_CHARS);

    const window = readResultSlice(store, id, 5, 10);
    expect(window.ok).toBe(true);
    expect(window.text).toBe("fghijabcde");
    expect(window.offset).toBe(5);
    expect(window.remaining).toBe(body.length - 15);

    // Reading "the whole thing" is capped, so paging cannot recreate the overflow we shrank away.
    expect(readResultSlice(store, id, 0, body.length).text).toHaveLength(
      MAX_SLICE_CHARS,
    );
    expect(readResultSlice(store, id, 0, 1).text).toBe("a");
    // A negative offset reads from the start; the arguments are character offsets, not indexes.
    expect(readResultSlice(store, id, -5, 4).text).toBe("abcd");
    // Reading past the end is an empty page, not an error: totalChars still tells the model the truth.
    const past = readResultSlice(store, id, body.length + 10);
    expect(past.ok).toBe(true);
    expect(past.text).toBe("");
    expect(past.remaining).toBe(0);
    expect(past.totalChars).toBe(body.length);

    // Non-string results are sliced as the JSON the model would have seen.
    const object = new ResultStore();
    const objectId = object.put({ hello: "world", list: [1, 2, 3] });
    expect(readResultSlice(object, objectId).text).toBe(
      JSON.stringify({ hello: "world", list: [1, 2, 3] }),
    );
  });

  it("rejects ids that are not handles, and handles this store does not have", () => {
    const store = new ResultStore();
    const notAnId = readResultSlice(store, "not-an-id");
    expect(notAnId.ok).toBe(false);
    expect(notAnId.error).toContain("is not a result id");

    const unknown = readResultSlice(
      store,
      `${RESULT_ID_PREFIX}0123456789abcdef`,
    );
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("another run or was evicted");
    expect(
      readResultSlice(undefined, `${RESULT_ID_PREFIX}0123456789abcdef`).ok,
    ).toBe(false);

    expect(extractResultId(`head\n${resultHandle("ctxres_deadbeef")}`)).toBe(
      "ctxres_deadbeef",
    );
    expect(extractResultId("no handle here")).toBeNull();
    expect(extractResultId(null)).toBeNull();
    expect(isResultId(`${RESULT_ID_PREFIX}${"a".repeat(16)}`)).toBe(true);
    expect(isResultId(`${RESULT_ID_PREFIX}${"a".repeat(200)}`)).toBe(false);
  });

  it("serves slices through the read_result tool while the flag is on", async () => {
    const runId = nextRunId();
    const ctx = baseCtx({ runId });
    try {
      const id = storeFor(runId).put(body);
      const ok = asLegacy(
        await runTool("read_result", { id, offset: 5, length: 10 }, ctx),
      );
      expect(ok.success).toBe(true);
      expect(ok.data).toMatchObject({
        id,
        text: "fghijabcde",
        offset: 5,
        length: 10,
        totalChars: body.length,
      });
      expect(ok.data?.remaining).toBe(body.length - 15);

      // An id from another run, or one that has been evicted, is refused with the same message.
      const missing = asLegacy(
        await runTool(
          "read_result",
          { id: `${RESULT_ID_PREFIX}ffffffffffffffff` },
          ctx,
        ),
      );
      expect(missing.success).toBe(false);
      expect(missing.code).toBe("INVALID_PARAMS");
      expect(missing.error).toContain("another run or was evicted");

      const notAHandle = asLegacy(
        await runTool("read_result", { id: "hello" }, ctx),
      );
      expect(notAHandle.success).toBe(false);
      expect(notAHandle.code).toBe("INVALID_PARAMS");

      const badArgs = asLegacy(await runTool("read_result", {}, ctx));
      expect(badArgs.success).toBe(false);
      expect(badArgs.code).toBe("INVALID_ARGS");
    } finally {
      releaseResultStore(runId);
    }
  });

  it("refuses when the flag is off and is only offered to the model when the flag is on", async () => {
    const runId = nextRunId();
    const ctx = baseCtx({ runId });
    try {
      const id = storeFor(runId).put(body);
      expect((await toolsFor(ctx)).map((spec) => spec.name)).toContain(
        "read_result",
      );

      delete process.env.FF_CONTEXT_MANAGER;
      expect((await toolsFor(ctx)).map((spec) => spec.name)).not.toContain(
        "read_result",
      );
      // An allow list cannot widen the set, so a restricted turn never sees the tool either.
      expect(
        (await toolsFor(ctx, ["browse"])).map((spec) => spec.name),
      ).toEqual(["browse"]);

      process.env.FF_CONTEXT_MANAGER = "1";
      delete ctx.runId;
      const orphan = asLegacy(await runTool("read_result", { id }, ctx));
      expect(orphan.success).toBe(false);
      expect(orphan.code).toBe("INVALID_PARAMS");
    } finally {
      process.env.FF_CONTEXT_MANAGER = "1";
      releaseResultStore(runId);
    }
  });

  it("refuses the tool entirely when the flag is off", async () => {
    const runId = nextRunId();
    const ctx = baseCtx({ runId });
    try {
      const id = storeFor(runId).put(body);
      delete process.env.FF_CONTEXT_MANAGER;
      const refused = asLegacy(await runTool("read_result", { id }, ctx));
      expect(refused.success).toBe(false);
      expect(refused.code).toBe("NOT_ALLOWED");
    } finally {
      process.env.FF_CONTEXT_MANAGER = "1";
      releaseResultStore(runId);
    }
  });
});

describe("compaction", () => {
  it("folds the middle into one summary and calls the cheap model once", async () => {
    // 26 messages, ~2,348 tokens estimated. Budget 2,100: over before, ~2,004 after the fold.
    const chat = longChat(12, 400);
    const budget = 2100;
    const summarize = vi.fn(async () => SUMMARY_TEXT);
    const saveCache = vi.fn(async () => {});
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget,
      summaryModel: "cheap-planner-model",
      summarizeCalls: summarize,
      cache: null,
      saveCache,
      now: () => NOW,
    });
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(result.applied).toEqual(["compaction"]);
    expect(result.overBudget).toBe(false);
    expect(result.estimatedTokens).toBeLessThanOrEqual(budget);
    expect(result.messages.filter(isSummaryMessage)).toHaveLength(1);
    expect(result.messages.length).toBeLessThan(chat.length);
    expect(result.removedMessages).toBeGreaterThan(0);
    // Only the summary was written, and it is addressed by the hash of the prefix it covers.
    expect(saveCache).toHaveBeenCalledTimes(1);
    const entry = saveCache.mock.calls[0]?.[0] as CompactionCacheEntry;
    expect(entry.model).toBe("cheap-planner-model");
    expect(entry.createdAt).toBe(NOW);
    expect(entry.summary).toBe(SUMMARY_TEXT);
    expect(entry.upToIndex).toBeGreaterThan(0);
    expect(entry.prefixHash).toHaveLength(64);
    // Protected: system prompt, core-memory block, first user message, last user message.
    expect(result.messages[0].content).toBe(SYSTEM_TEXT);
    expect(result.messages.some(isCoreMemoryMessage)).toBe(true);
    expect(
      result.messages.filter((m) => m.role === "user").pop()?.content,
    ).toBe([...chat].reverse().find((m) => m.role === "user")?.content);
    // A different array: the caller's transcript is never edited in place.
    expect(result.messages).not.toBe(chat);
    expect(chat).toHaveLength(26);
  });

  it("reuses the cached summary for the same prefix instead of calling again", async () => {
    const chat = longChat(12, 400);
    const budget = 2100;
    const summarize = vi.fn(async () => SUMMARY_TEXT);
    let cache: CompactionCacheEntry | null = null;
    const first = await manageContext({
      messages: chat,
      model: "test-model",
      budget,
      summarizeCalls: summarize,
      cache: null,
      saveCache: async (entry) => {
        cache = entry;
      },
      now: () => NOW,
    });
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(cache).not.toBeNull();

    const save2 = vi.fn(async () => {});
    const second = await manageContext({
      messages: chat,
      model: "test-model",
      budget,
      summarizeCalls: summarize,
      cache,
      saveCache: save2,
      now: () => NOW,
    });
    expect(second.applied).toEqual(["compaction"]);
    expect(second.messages).toEqual(first.messages);
    // One cheap call for the prefix, and nothing to write the second time around.
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(save2).not.toHaveBeenCalled();

    // A new turn moves the cut, so the summary is rebuilt.
    const third = await manageContext({
      messages: [...chat, msg("user", `one more question ${"z".repeat(500)}`)],
      model: "test-model",
      budget,
      summarizeCalls: summarize,
      cache,
      saveCache: async (entry) => {
        cache = entry;
      },
      now: () => NOW,
    });
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(third.applied).toContain("compaction");
  });

  it("reuses the cache even when re-shrinking minted new result handles", async () => {
    // Tool results inside the folded prefix: their handles change per run, the prefix hash must not.
    const chat = [
      ...longChat(6, 300),
      ...toolRound(0, 4000),
      ...toolRound(1, 4000),
      ...toolRound(2, 4000),
      msg("user", `final question ${"f".repeat(300)}`),
    ];
    const budget = 1000;
    const summarize = vi.fn(async () => SUMMARY_TEXT);
    let cache: CompactionCacheEntry | null = null;
    const first = await manageContext({
      messages: chat,
      model: "test-model",
      budget,
      summarizeCalls: summarize,
      store: new ResultStore(),
      cache: null,
      saveCache: async (entry) => {
        cache = entry;
      },
      now: () => NOW,
    });
    expect(first.applied).toEqual(["shrink", "compaction", "trim"]);
    expect(cache).not.toBeNull();

    const save2 = vi.fn(async () => {});
    const second = await manageContext({
      messages: chat,
      model: "test-model",
      budget,
      summarizeCalls: summarize,
      store: new ResultStore(), // a different run: brand new handles for the same bodies
      cache,
      saveCache: save2,
      now: () => NOW,
    });
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(save2).not.toHaveBeenCalled();
    expect(second.messages).toEqual(first.messages);
  });

  it("stops as soon as shrinking fits, and does not summarize then", async () => {
    const chat = [
      ...longChat(3, 200),
      ...toolRound(0, 6000),
      ...toolRound(1, 6000),
      ...toolRound(2, 6000),
      ...toolRound(3, 6000),
    ];
    // Budget set to exactly what the shrunk transcript costs: step 1 alone has to be enough.
    const budget = estimateTokens(
      shrinkToolResults(chat, new ResultStore()).messages,
    );
    const summarize = vi.fn(async () => SUMMARY_TEXT);
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget,
      summarizeCalls: summarize,
      store: new ResultStore(),
      cache: null,
      saveCache: async () => {},
      now: () => NOW,
    });
    expect(result.applied).toEqual(["shrink"]);
    expect(result.overBudget).toBe(false);
    expect(summarize).not.toHaveBeenCalled();
  });

  it("compacts before trimming, and only trims what is left over", async () => {
    const chat = [
      ...longChat(10, 300),
      ...toolRound(0, 5000),
      ...toolRound(1, 5000),
      ...toolRound(2, 5000),
    ];
    const summarize = vi.fn(
      async () =>
        "Summary of the earlier turns: the report lists 42 items and 3.5 open.",
    );
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget: 600,
      summarizeCalls: summarize,
      store: new ResultStore(),
      cache: null,
      saveCache: async () => {},
      now: () => NOW,
    });
    // All three steps, in that order: shrink, then summarize, then drop what still does not fit.
    expect(result.applied).toEqual(["shrink", "compaction", "trim"]);
    expect(result.messages[0].content).toBe(SYSTEM_TEXT);
    expect(result.messages.some(isSummaryMessage)).toBe(true);
    expect(result.overBudget).toBe(false);
  });

  it("still writes the cache when the summary turns out not to be enough", async () => {
    const chat = longChat(12, 2000); // neither shrinking nor summarizing can fit this on its own
    const summarize = vi.fn(async () => SUMMARY_TEXT);
    const saved: CompactionCacheEntry[] = [];
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget: 1200,
      summarizeCalls: summarize,
      cache: null,
      saveCache: async (entry) => {
        saved.push(entry);
      },
      now: () => NOW,
    });
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1); // written once, even though step 3 still has to cut
    expect(result.applied).toEqual(["compaction", "trim"]);
    expect(result.overBudget).toBe(false);
  });

  it("gives up on compaction when the cheap model throws, says nothing, or refuses", async () => {
    const chat = longChat(12, 400);
    for (const broken of [
      vi.fn(async () => {
        throw new Error("planner is down");
      }),
      vi.fn(async () => "   "),
      vi.fn(async () => "I can't summarize this conversation."),
      vi.fn(async () => "I don't have enough information to summarize."),
    ]) {
      const saved: CompactionCacheEntry[] = [];
      const result = await manageContext({
        messages: chat,
        model: "test-model",
        budget: 1200,
        summarizeCalls: broken,
        cache: null,
        saveCache: async (entry) => {
          saved.push(entry);
        },
        now: () => NOW,
      });
      expect(broken).toHaveBeenCalledTimes(1);
      expect(result.applied).toEqual(["trim"]); // only the safe step ran
      expect(result.overBudget).toBe(false);
      expect(result.messages.filter(isSummaryMessage)).toHaveLength(0);
      expect(result.messages[0].content).toBe(SYSTEM_TEXT);
      // A summary nobody wrote cannot be cached, so the next turn will try again.
      expect(saved).toHaveLength(0);
      saved.length = 0;
    }
  });

  it("never fails the turn over a cache write that threw", async () => {
    const chat = longChat(12, 400);
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget: 2100,
      summarizeCalls: vi.fn(async () => SUMMARY_TEXT),
      cache: null,
      saveCache: async () => {
        throw new Error("db is down");
      },
      now: () => NOW,
    });
    expect(result.applied).toContain("compaction");
    expect(result.messages.some(isSummaryMessage)).toBe(true);
    expect(result.overBudget).toBe(false);
  });

  it("drops a cached summary whose prefix moved, age expired, or shape is wrong", async () => {
    const chat = longChat(12, 400);
    const upToIndex = cutIndexAt(chat, KEEP_LAST_MESSAGES);
    const hash = prefixHash(chat.slice(0, upToIndex));
    const fresh: CompactionCacheEntry = {
      prefixHash: hash,
      upToIndex,
      summary: SUMMARY_TEXT,
      model: "cheap",
      createdAt: NOW,
    };

    const reused = await manageContext({
      messages: chat,
      model: "test-model",
      budget: 1200,
      summarizeCalls: vi.fn(async () => "must not be called"),
      cache: fresh,
      saveCache: async () => {},
      now: () => NOW,
    });
    expect(reused.messages.some(isSummaryMessage)).toBe(true);
    expect(reused.messages.filter(isSummaryMessage)[0]?.content).toBe(
      `${SUMMARY_PREFIX} ${SUMMARY_TEXT}`,
    );

    expect(isUsableCache(fresh, upToIndex, hash, NOW)).toBe(true);
    expect(isUsableCache(fresh, upToIndex + 1, hash, NOW)).toBe(false); // the prefix moved
    expect(isUsableCache(fresh, upToIndex, "f".repeat(64), NOW)).toBe(false); // a different prefix
    expect(isUsableCache(fresh, upToIndex, hash, NOW + CACHE_MAX_AGE_MS)).toBe(
      true,
    ); // exactly at the edge
    expect(
      isUsableCache(fresh, upToIndex, hash, NOW + CACHE_MAX_AGE_MS + 1),
    ).toBe(false);
    expect(
      isUsableCache({ ...fresh, createdAt: 0 }, upToIndex, hash, NOW),
    ).toBe(true); // no timestamp to age
    expect(
      isUsableCache({ ...fresh, summary: "   " }, upToIndex, hash, NOW),
    ).toBe(false);
    expect(isUsableCache(null, upToIndex, hash, NOW)).toBe(false);

    expect(normalizeCacheEntry(undefined)).toBeNull();
    expect(normalizeCacheEntry("nope")).toBeNull();
    expect(
      normalizeCacheEntry({ prefixHash: "h", upToIndex: -1, summary: "s" }),
    ).toBeNull();
    expect(
      normalizeCacheEntry({ prefixHash: "h", upToIndex: 3, summary: "s" }),
    ).toEqual({
      prefixHash: "h",
      upToIndex: 3,
      summary: "s",
      model: "unknown",
      createdAt: 0,
    });
    expect(normalizeCacheEntry(JSON.parse(JSON.stringify(fresh)))).toEqual(
      fresh,
    );
  });

  it("hashes the prefix, not the handles: the same bodies hash the same", () => {
    const chat = longChat(3, 50);
    const withHandle = chat.map((m) =>
      m.role === "assistant"
        ? msg(
            m.role,
            `${m.content}\n${resultHandle(`${RESULT_ID_PREFIX}aaaa`)}`,
          )
        : m,
    );
    const otherHandle = chat.map((m) =>
      m.role === "assistant"
        ? msg(
            m.role,
            `${m.content}\n${resultHandle(`${RESULT_ID_PREFIX}bbbb`)}`,
          )
        : m,
    );
    expect(prefixHash(withHandle)).toBe(prefixHash(otherHandle));
    expect(prefixHash(withHandle)).not.toBe(prefixHash(chat));
    expect(prefixHash([])).toBe(prefixHash([]));
  });

  it("builds a bounded transcript for the summarizer", () => {
    const chat = [
      msg("system", "sys"),
      msg("user", "question"),
      msg("assistant", "answer"),
      msg("assistant", null, {
        tool_calls: [
          toolCall("c1", "browse", { url: "https://example.com/a" }),
        ],
      }),
      msg("tool", "the result", { tool_call_id: "c1", name: "browse" }),
      msg("user", "x".repeat(5000)),
    ];
    const transcript = transcriptForSummary(chat);
    expect(transcript).toContain("1. system: sys");
    expect(transcript).toContain("result of browse: the result");
    expect(transcript).toContain("[called: browse(");
    expect(transcript).not.toContain("x".repeat(1501)); // each line is capped
    expect(transcriptForSummary([pendingRound(9)])).toContain(
      "[called: browse(",
    );
  });

  it("clears fences, headings and stale prefixes, and refuses blank or refusal summaries", () => {
    expect(compactSummaryText("```\n" + SUMMARY_TEXT + "\n```")).toBe(
      SUMMARY_TEXT,
    );
    expect(compactSummaryText("# Summary\n\n" + SUMMARY_TEXT)).toBe(
      SUMMARY_TEXT,
    );
    // The prefix belongs to the message envelope, so the stored summary must not carry it.
    expect(compactSummaryText(`${SUMMARY_PREFIX}\n${SUMMARY_TEXT}`)).toBe(
      SUMMARY_TEXT,
    );
    expect(compactSummaryText(`${SUMMARY_PREFIX} ${SUMMARY_TEXT}`)).toBe(
      SUMMARY_TEXT,
    );
    // Blank runs collapse so the summary message stays a single block.
    const roomy = "The report lists 42 items and 3.5 of them are still open.";
    expect(compactSummaryText(`${roomy}\n\n\n\n${roomy}`)).toBe(
      `${roomy}\n${roomy}`,
    );
    expect(compactSummaryText("a\n\n\n\nb")).toBeNull(); // under MIN_SUMMARY_CHARS
    expect(compactSummaryText("too short")).toBeNull();
    expect(MIN_SUMMARY_CHARS).toBeGreaterThan(0);
    expect(
      compactSummaryText("x".repeat(MAX_SUMMARY_CHARS + 500)),
    ).toHaveLength(MAX_SUMMARY_CHARS);
    expect(looksLikeRefusal("I can't summarize this conversation.")).toBe(true);
    expect(
      looksLikeRefusal("I don't have enough information to summarize."),
    ).toBe(true);
    expect(looksLikeRefusal("Nothing to summarize.")).toBe(true);
    expect(looksLikeRefusal(SUMMARY_TEXT)).toBe(false);
    expect(looksLikeRefusal("   ")).toBe(false); // caught by the empty check instead
    const summary = summaryMessage(SUMMARY_TEXT);
    expect(summary.role).toBe("assistant");
    expect(isSummaryMessage(summary)).toBe(true);
    expect(isSummaryMessage(msg("assistant", SUMMARY_TEXT))).toBe(false);
  });
});

describe("nothing happens when under budget or the flag is off", () => {
  it("returns the caller's array untouched when the estimate already fits", async () => {
    const chat = longChat(2, 100);
    const summarize = vi.fn(async () => SUMMARY_TEXT);
    const store = new ResultStore();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget: 50_000,
      summarizeCalls: summarize,
      store,
      cache: null,
      saveCache: async () => {},
      now: () => NOW,
    });
    expect(result.messages).toBe(chat);
    expect(result.applied).toEqual([]);
    expect(result.changed).toBe(false);
    expect(result.overBudget).toBe(false);
    expect(result.removedMessages).toBe(0);
    expect(result.estimatedTokens).toBeLessThanOrEqual(50_000);
    expect(summarize).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("does nothing at all when the CONTEXT_MANAGER flag is off", async () => {
    delete process.env.FF_CONTEXT_MANAGER;
    const chat = longChat(12, 400);
    const summarize = vi.fn(async () => SUMMARY_TEXT);
    const store = new ResultStore();
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget: 10,
      summarizeCalls: summarize,
      store,
      cache: null,
      saveCache: async () => {},
      now: () => NOW,
    });
    expect(result.messages).toBe(chat);
    expect(result.applied).toEqual([]);
    expect(result.changed).toBe(false);
    expect(result.overBudget).toBe(true);
    expect(summarize).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it("shrinks nothing while the flag is off", () => {
    // The gate lives at the entry points that the engine calls: `handleFreshResult` hands the whole
    // result back and `manageContext` returns the caller's array (covered just above).
    // `shrinkToolResults` itself is a plain helper, so it is the caller that must be gated.
    const store = new ResultStore();
    const content = "t".repeat(3000);
    delete process.env.FF_CONTEXT_MANAGER;
    expect(
      handleFreshResult({ content, toolName: "browse", store }),
    ).toBeNull();
    expect(store.size).toBe(0);
    process.env.FF_CONTEXT_MANAGER = "1";
    const shrunk = handleFreshResult({ content, toolName: "browse", store });
    expect(shrunk).not.toBeNull();
    expect(shrunk).toContain(FULL_RESULT_MARKER);
    expect(store.size).toBe(1);
    const id = extractResultId(shrunk as string);
    expect(store.get(id as string)).toBe(content);
    // Without a store there is nothing to read back, so no handle is minted either.
    expect(handleFreshResult({ content, toolName: "browse" })).toBeNull();
  });
});

describe("trim and pairing protect the turns that must survive", () => {
  it("never drops a pending tool call, the newest turns, or the protected head", async () => {
    // A live turn: an assistant that asked for `pending` has not been answered yet. The model cannot
    // be shown an orphan tool message, so the pending call must survive however hard we trim.
    const chat = [
      msg("system", SYSTEM_TEXT),
      msg("user", MEMORY_TEXT),
      ...Array.from({ length: 8 }, (_, i) => toolRound(i, 600)).flat(),
      pendingRound(99),
      msg("assistant", "done"),
      msg("user", "next question"),
    ];
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget: 300,
      summarizeCalls: vi.fn(async () => SUMMARY_TEXT),
      store: new ResultStore(),
      cache: null,
      saveCache: async () => {},
      now: () => NOW,
    });
    const violations = findPairingViolations(result.messages);
    expect(violations.orphanToolCallIds).toEqual([]); // every result still answers a visible call
    expect(violations.unansweredToolCallIds).toEqual(["call_99"]); // still open, as it was
    expect(result.messages[0].content).toBe(SYSTEM_TEXT);
    expect(result.messages.some(isCoreMemoryMessage)).toBe(true);
    expect(
      result.messages.filter((m) => m.role === "user").pop()?.content,
    ).toBe("next question");
    expect(
      result.messages.some((m) =>
        m.tool_calls?.some((c) => c.id === "call_99"),
      ),
    ).toBe(true);
  });

  it("drops a whole tool round rather than splitting it when trimming", async () => {
    const chat = [
      msg("system", SYSTEM_TEXT),
      msg("user", "go"),
      ...Array.from({ length: 10 }, (_, i) => toolRound(i, 1200)).flat(),
    ];
    chat.push(msg("user", "thanks"));
    expect(findPairingViolations(chat).unansweredToolCallIds).toEqual([]);
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget: 400,
      summarizeCalls: vi.fn(async () => SUMMARY_TEXT),
      store: new ResultStore(),
      cache: null,
      saveCache: async () => {},
      now: () => NOW,
    });
    expect(result.messages.length).toBeLessThan(chat.length);
    expect(findPairingViolations(result.messages).orphanToolCallIds).toEqual(
      [],
    );
    // Whatever survived is a complete round: every call the assistant made has its reply next to it.
    for (const unit of messageUnits(result.messages)) {
      const assistant = result.messages[unit.indices[0]];
      const ids = assistant?.tool_calls?.map((c) => c.id) ?? [];
      expect(ids.length).toBe(unit.indices.length - 1);
      ids.forEach((id, offset) => {
        expect(
          result.messages[unit.indices[0] + 1 + offset]?.tool_call_id,
        ).toBe(id);
      });
    }
  });

  it("groups units, cuts at unit boundaries, and protects what it must", () => {
    const chat = [
      msg("system", SYSTEM_TEXT),
      msg("user", MEMORY_TEXT),
      msg("user", "first ask"),
      msg("assistant", null, {
        tool_calls: [toolCall("c1"), toolCall("c2", "drive_read")],
      }),
      msg("tool", "r1", { tool_call_id: "c1", name: "browse" }),
      msg("tool", "r2", { tool_call_id: "c2", name: "drive_read" }),
      msg("assistant", null, { tool_calls: [toolCall("c3")] }), // pending: no result yet
      msg("user", "what happened?"),
    ];
    const units = messageUnits(chat);
    expect(units.map((u) => u.indices)).toEqual([
      [0],
      [1],
      [2],
      [3, 4, 5],
      [6],
      [7],
    ]);
    expect(units[3]).toEqual({ indices: [3, 4, 5], pending: false });
    expect(units[4]).toEqual({ indices: [6], pending: true });
    // System, memory, the pending round and the newest user turn cannot be trimmed away. The first
    // user message is kept by compaction, not by trimming.
    expect(protectedIndices(chat)).toEqual(new Set([0, 1, 6, 7]));
    expect(firstUserIndex(chat)).toBe(2);
    // Cutting never lands inside a round: it moves to the start of the unit that would be split.
    expect(cutIndexAt(chat, KEEP_LAST_MESSAGES)).toBe(2);
    expect(cutIndexAt(chat, 2)).toBe(6);
    expect(cutIndexAt(chat, 1)).toBe(7);
    expect(cutIndexAt(chat.slice(0, 5), 6)).toBe(0); // shorter than the window: nothing to fold
    expect(chat.slice(0, 5).map((m) => m.role)).toEqual([
      "system",
      "user",
      "user",
      "assistant",
      "tool",
    ]);
    // The rounds kept verbatim are consecutive tool replies, newest first.
    expect(recentToolCallIds(chat, KEEP_RECENT_TOOL_ROUNDS)).toEqual(
      new Set(["c1", "c2"]),
    );
    expect(recentToolCallIds(chat, 0)).toEqual(new Set());
    expect(summaryMessage("x").role).toBe("assistant");
    expect(chat.filter(isCoreMemoryMessage).map((m) => m.content)).toEqual([
      MEMORY_TEXT,
    ]);
  });

  it("can still not fit when the request itself is too big, and reports it", async () => {
    const chat = longChat(4, 400);
    const tools = [
      { type: "function", function: { name: "browse", parameters: {} } },
    ];
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget: 1,
      tools,
      summarizeCalls: vi.fn(async () => SUMMARY_TEXT),
      store: new ResultStore(),
      cache: null,
      saveCache: async () => {},
      now: () => NOW,
    });
    expect(result.overBudget).toBe(true);
    expect(result.budget).toBe(1);
    expect(result.applied).toContain("trim");
    expect(result.messages.length).toBeLessThan(chat.length);
    // The system prompt, the first user message and the newest turn are still there.
    expect(result.messages[0].content).toBe(SYSTEM_TEXT);
    expect(
      result.messages.filter((m) => m.role === "user").pop()?.content,
    ).toBe([...chat].reverse().find((m) => m.role === "user")?.content);
    // The module only reports the miss; the warning is the caller's job (engine.ts `fitContext`), so
    // nothing reaches a log from here and no message content ever could.
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("shrinks every last result as a final resort when even the summary is not enough", async () => {
    // A call that is still open protects its whole round from trimming, so the transcript can hold a
    // 12,000 character result that neither shrinking nor trimming may touch. That is what the last
    // resort is for: shrink those results too, marker and all.
    const pendingPair: KemmaMessage[] = [
      msg("assistant", null, {
        tool_calls: [toolCall("call_a"), toolCall("call_b", "drive_read")],
      }),
      msg("tool", "y".repeat(12000), {
        tool_call_id: "call_a",
        name: "browse",
      }), // call_b is still open
    ];
    const chat = [
      msg("system", SYSTEM_TEXT),
      ...toolRound(0, 12000), // old enough to shrink in step 1, then trimmed away
      ...toolRound(1, 12000),
      ...pendingPair,
      msg("user", "now what?"),
    ];
    const store = new ResultStore();
    const result = await manageContext({
      messages: chat,
      model: "test-model",
      budget: 100,
      store,
      now: () => NOW,
    });
    // No summarizer was offered, so the only moves left are the safe shrinks and the hard trim.
    expect(result.applied).toEqual(["shrink", "trim", "shrinkAll"]);
    expect(result.overBudget).toBe(true);
    // Every tool result now points at a stored body instead of carrying one.
    const untouched = result.messages.filter(
      (m) => m.role === "tool" && !m.content?.includes(FULL_RESULT_MARKER),
    );
    expect(untouched).toHaveLength(0);
    expect(result.shrunkResults).toBe(2);
    expect(store.size).toBe(2);
    expect(
      findPairingViolations(result.messages).unansweredToolCallIds,
    ).toEqual(["call_b"]);
    // The forced shrink costs the model no information: the 12,000 character body is still readable
    // back through the handle it was replaced with.
    const forced = result.messages.find((m) => m.tool_call_id === "call_a");
    expect(store.get(extractResultId(forced?.content ?? "") as string)).toBe(
      "y".repeat(12000),
    );
  });
});

describe("pairing invariant holds for any generated transcript (property test)", () => {
  const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789 ";
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function filler(rnd: () => number, max: number): string {
    const length = Math.floor(rnd() * max);
    let out = "";
    for (let i = 0; i < length; i++)
      out += CHARS[Math.floor(rnd() * CHARS.length)];
    return out;
  }

  function randomChat(rnd: () => number): KemmaMessage[] {
    const out: KemmaMessage[] = [
      msg("system", `You are Sutaeru. ${filler(rnd, 200)}`),
    ];
    if (rnd() < 0.5)
      out.push(
        msg(
          "user",
          `<retrieved_memories>${filler(rnd, 300)}</retrieved_memories>`,
        ),
      );
    let next = 0;
    const turns = 4 + Math.floor(rnd() * 12);
    for (let i = 0; i < turns; i++) {
      const roll = rnd();
      if (roll < 0.3) {
        const count = 1 + Math.floor(rnd() * 2);
        const ids = Array.from({ length: count }, () => `id_${next++}`);
        out.push(
          msg(
            "assistant",
            rnd() < 0.5
              ? null
              : `Calling ${ids.length} tools. ${filler(rnd, 300)}`,
            {
              tool_calls: ids.map((id) => toolCall(id)),
            },
          ),
        );
        // Answers are either all present, or the round stays pending for the rest of the chat.
        if (rnd() < 0.7) {
          for (const id of ids)
            out.push(
              msg("tool", filler(rnd, 2500) || "ok", {
                tool_call_id: id,
                name: "browse",
              }),
            );
        }
      } else if (roll < 0.4) {
        out.push(msg("assistant", `${SUMMARY_PREFIX} ${filler(rnd, 400)}`));
      } else if (roll < 0.7) {
        out.push(msg("user", filler(rnd, 600) || "and?"));
      } else {
        out.push(msg("assistant", filler(rnd, 700) || "ok"));
      }
    }
    if (out[out.length - 1]?.role !== "user")
      out.push(msg("user", `last question ${filler(rnd, 400)}`));
    return out;
  }

  for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) {
    for (const budget of [200, 900, 3000]) {
      it(`keeps every call paired for seed ${seed} at budget ${budget}`, async () => {
        const rnd = mulberry32(seed);
        const chat = randomChat(rnd);
        // The fixture must be well formed for the invariant to mean anything.
        expect(findPairingViolations(chat).orphanToolCallIds).toEqual([]);
        const pendingBefore = [
          ...findPairingViolations(chat).unansweredToolCallIds,
        ].sort();
        const summariesBefore = chat.filter(isSummaryMessage).length;
        const lastUser = [...chat].reverse().find((m) => m.role === "user");
        const memoryBlocks = chat
          .filter(isCoreMemoryMessage)
          .map((m) => m.content);
        const store = new ResultStore();

        const result = await manageContext({
          messages: chat,
          model: `prop-${seed}`,
          budget,
          tools: [
            { type: "function", function: { name: "browse", parameters: {} } },
          ],
          summarizeCalls: vi.fn(async () =>
            `${filler(rnd, 300)}`
              .replace(/[^a-z ]/g, "x")
              .padEnd(MIN_SUMMARY_CHARS + 10, "y"),
          ),
          store,
          cache: null,
          saveCache: async () => {},
          now: () => NOW,
        });

        const violations = findPairingViolations(result.messages);
        // Never a tool result whose call was removed, and never a call that lost its reply.
        expect(violations.orphanToolCallIds).toEqual([]);
        expect([...violations.unansweredToolCallIds].sort()).toEqual(
          pendingBefore,
        );
        // A call and the results that answer it stay in order and next to each other.
        for (const unit of messageUnits(result.messages)) {
          const assistant = result.messages[unit.indices[0]];
          const ids = assistant?.tool_calls?.map((c) => c.id) ?? [];
          // Every result inside a unit answers a call made by that unit's assistant...
          for (const index of unit.indices.slice(1)) {
            expect(ids).toContain(result.messages[index].tool_call_id);
          }
          // ...and they sit in call order with no gap, even when a later call is still open.
          const answers = unit.indices
            .slice(1)
            .map((index) => result.messages[index].tool_call_id);
          expect(answers).toEqual(ids.filter((id) => answers.includes(id)));
        }
        // The system prompt, the memory block and the newest question always survive.
        expect(result.messages[0].content).toBe(chat[0].content);
        expect(
          result.messages.filter(isCoreMemoryMessage).map((m) => m.content),
        ).toEqual(memoryBlocks);
        expect(
          result.messages.filter((m) => m.role === "user").pop()?.content,
        ).toBe(lastUser?.content);
        expect(result.messages.length).toBeLessThanOrEqual(chat.length);
        expect(
          result.messages.filter(isSummaryMessage).length,
        ).toBeLessThanOrEqual(summariesBefore + 1);
        // Every handle left in the transcript still reads back from this run's store.
        for (const message of result.messages) {
          const id = extractResultId(message.content);
          if (id) expect(store.has(id)).toBe(true);
        }
      });
    }
  }
});

describe("AC1: a 200-turn chat with 30 tool results stays under budget", () => {
  it("fits, and every handle it left behind still reads back", async () => {
    const chat: KemmaMessage[] = [
      msg("system", SYSTEM_TEXT),
      msg("user", MEMORY_TEXT),
    ];
    let rounds = 0;
    for (let i = 0; i < 200; i++) {
      chat.push(
        msg(
          "user",
          `Q${i}: please compare option ${i} against the plan in section ${i} of the report.`,
        ),
      );
      // Thirty of the turns carry a tool result, the rest are plain back-and-forth.
      if (rounds < 30 && i % 6 === 3) {
        chat.push(...toolRound(i, 6000));
        rounds += 1;
      }
      chat.push(
        msg(
          "assistant",
          `A${i}: option ${i} is cheaper but slower, and needs ${i} more hours. ${"x".repeat(240)}`,
        ),
      );
    }
    // The spec's shape: 200 turns, 30 of them carrying a tool result.
    expect(rounds).toBe(30);
    const budget = 8000;
    expect(estimateTokens(chat)).toBeGreaterThan(budget);

    const summarize = vi.fn(async () => SUMMARY_TEXT);
    const store = new ResultStore();
    const result = await manageContext({
      messages: chat,
      model: "qwen3.8-max",
      budget,
      tools: [
        { type: "function", function: { name: "browse", parameters: {} } },
      ],
      summaryModel: "cheap-planner-model",
      summarizeCalls: summarize,
      store,
      cache: null,
      saveCache: async () => {},
      now: () => NOW,
    });

    expect(result.overBudget).toBe(false);
    expect(result.estimatedTokens).toBeLessThanOrEqual(budget);
    // Shrinking the fat results first, then folding the middle away, was enough on its own.
    expect(result.applied).toEqual(["shrink", "compaction"]);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(findPairingViolations(result.messages).orphanToolCallIds).toEqual(
      [],
    );
    expect(result.messages.some(isSummaryMessage)).toBe(true);
    expect(result.messages[0].content).toBe(SYSTEM_TEXT);
    // Thirty results became handles — the last two rounds are exempt — and compaction then folded
    // most of those turns into the summary. The bodies stay in the store for the whole run, so
    // nothing is lost: the model can still read any of them back by handle.
    expect(result.shrunkResults).toBe(28);
    expect(store.size).toBe(28);
    expect(
      result.messages.filter((m) => extractResultId(m.content)).length,
    ).toBeLessThanOrEqual(2);
  });
});
