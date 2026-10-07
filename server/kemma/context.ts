/**
 * Context manager: token budgets, result handles and compaction (P1-13).
 *
 * Everything here is dark behind `flag("CONTEXT_MANAGER")`: with the flag off, `manageContext`
 * returns its input untouched, so the wire payload is exactly what it was before this module.
 *
 * When the flag is on and a request is over its budget, three steps run in order and stop as soon
 * as the request fits: shrink old tool results to a handle, compact the oldest turns into one
 * summary message (cached per prefix), then hard-trim the oldest non-protected messages. The system
 * prompt, the core memory block, the first and the latest user message, an existing summary and
 * pending tool call/result pairs are never dropped, split or altered.
 *
 * Full tool results live per run in a `ResultStore`; the transcript carries a `result_id` handle
 * the model can read back through the `read_result` tool.
 *
 * @module kemma/context
 */
import { createHash, randomBytes } from "node:crypto";

import { flag } from "../core/flags";
import { modelLimitsFor, resolveMaxTokens } from "../core/kemmaRouter";
import { getToolSpec } from "./toolkit/registry";
import type { KemmaMessage } from "./engine";

// ─── estimation ───────────────────────────────────────────────────────────────

/** The spec's rough tokenizer: 3.6 characters per token. */
export const CHARS_PER_TOKEN = 3.6;

/** Per-message wire overhead the spec adds on top of every message estimate. */
export const PER_MESSAGE_TOKENS = 4;

/** Headroom kept free in every budget, for the reply and the provider's own framing. */
export const OUTPUT_RESERVE_TOKENS = 2000;

/** Weight of the newest observation in the per-model calibration. */
export const CALIBRATION_ALPHA = 0.3;

/** The calibration stays inside this band, so one odd call cannot skew a whole session. */
export const CALIBRATION_MIN = 0.2;
export const CALIBRATION_MAX = 5;

function charLengthOf(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (value == null) return 0;
  try {
    return JSON.stringify(value)?.length ?? String(value).length;
  } catch {
    return String(value).length;
  }
}

/** Characters the model sees for one message: its text plus any tool calls it carries. */
export function messageChars(message: KemmaMessage): number {
  return (
    charLengthOf(message.content) +
    charLengthOf(message.tool_calls ?? undefined)
  );
}

/** The uncalibrated estimate of one message: `ceil(chars / 3.6) + 4`. */
export function messageTokens(message: KemmaMessage): number {
  return (
    Math.ceil(messageChars(message) / CHARS_PER_TOKEN) + PER_MESSAGE_TOKENS
  );
}

/** The uncalibrated estimate: `ceil(chars / 3.6) + 4` per message, plus the tools' JSON size. */
export function estimateRawTokens(
  messages: readonly KemmaMessage[],
  tools?: unknown,
): number {
  let tokens = 0;
  for (const message of messages) tokens += messageTokens(message);
  const toolChars = charLengthOf(tools);
  if (toolChars > 0) tokens += Math.ceil(toolChars / CHARS_PER_TOKEN);
  return tokens;
}

interface Calibration {
  ratio: number;
  updates: number;
}

const calibrations = new Map<string, Calibration>();

function calibrationKey(model: string | undefined): string {
  return (model ?? "").trim() || "unknown";
}

/** The current per-model multiplier; 1 until the first call has been measured. */
export function calibrationFor(model?: string): number {
  return calibrations.get(calibrationKey(model))?.ratio ?? 1;
}

/** Estimate for a request, multiplied by the model's learned ratio. */
export function estimateTokens(
  messages: readonly KemmaMessage[],
  tools?: unknown,
  model?: string,
): number {
  return Math.ceil(estimateRawTokens(messages, tools) * calibrationFor(model));
}

export interface CalibrateOptions {
  alpha?: number;
  min?: number;
  max?: number;
}

/**
 * Learns from a finished call: `ratio = usage.input / estimate`, folded into an exponential moving
 * average per model, so the next estimate for that model is closer to what the provider counted.
 * Returns the new ratio. Nonsense inputs leave the calibration alone.
 */
export function calibrate(
  model: string | undefined,
  estimatedTokens: number,
  inputTokens: number,
  options: CalibrateOptions = {},
): number {
  if (!(estimatedTokens > 0) || !(inputTokens > 0))
    return calibrationFor(model);
  const min = options.min ?? CALIBRATION_MIN;
  const max = options.max ?? CALIBRATION_MAX;
  const observed = Math.min(Math.max(inputTokens / estimatedTokens, min), max);
  const alpha = options.alpha ?? CALIBRATION_ALPHA;
  const key = calibrationKey(model);
  const previous = calibrations.get(key);
  const ratio = previous
    ? previous.ratio * (1 - alpha) + observed * alpha
    : observed;
  calibrations.set(key, { ratio, updates: (previous?.updates ?? 0) + 1 });
  return ratio;
}

/** Drops every learned ratio. For tests, and for a rollout that restarts calibration from scratch. */
export function resetCalibration(): void {
  calibrations.clear();
}

// ─── budget ───────────────────────────────────────────────────────────────────

/** Budget = context window − max_tokens − 2,000 (P1-06 limits table). */
export function contextBudgetFor(
  model: string,
  maxTokens?: number,
  reserveTokens?: number,
): number {
  const limits = modelLimitsFor(model);
  const output = maxTokens ?? resolveMaxTokens(model, "chat");
  const reserve = reserveTokens ?? OUTPUT_RESERVE_TOKENS;
  return Math.max(1, limits.contextWindow - output - reserve);
}

// ─── result store and handles ────────────────────────────────────────────────

/** Prefix of a handle id, so `read_result` can reject anything that is not one. */
export const RESULT_ID_PREFIX = "ctxres_";

/** How many full results one run keeps; the oldest are evicted first. */
export const MAX_STORED_RESULTS = 2000;

/** Marks a tool message whose full body lives in the store instead of in the transcript. */
export const FULL_RESULT_MARKER = "[full result: result_id=";

/** Handle line the model is told to use with `read_result`. */
export function resultHandle(id: string): string {
  return `${FULL_RESULT_MARKER}${id}]`;
}

const HANDLE_PATTERN = /\[full result: result_id=([A-Za-z0-9_\-.:]{1,128})\]/;

/** The handle inside a shrunk tool message, if it has one. */
export function extractResultId(content: unknown): string | null {
  if (typeof content !== "string") return null;
  return HANDLE_PATTERN.exec(content)?.[1] ?? null;
}

export function isResultId(id: string): boolean {
  return (
    id.startsWith(RESULT_ID_PREFIX) && id.length <= RESULT_ID_PREFIX.length + 64
  );
}

/**
 * The full tool results of one run, addressed by handle. Per run on purpose: a handle from another
 * run would point at content this user should not get back, and nothing goes to disk here — P3-01
 * is the work package that turns results into stored blobs with a shared cache.
 */
export class ResultStore {
  private readonly results = new Map<string, unknown>();
  private readonly limit: number;

  constructor(limit: number = MAX_STORED_RESULTS) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  get size(): number {
    return this.results.size;
  }

  /** Keeps a full result and returns the handle to write into the transcript. */
  put(value: unknown): string {
    const id = `${RESULT_ID_PREFIX}${randomBytes(8).toString("hex")}`;
    this.results.set(id, value);
    while (this.results.size > this.limit) {
      const oldest = this.results.keys().next().value;
      if (oldest === undefined) break;
      this.results.delete(oldest);
    }
    return id;
  }

  has(id: string): boolean {
    return this.results.has(id);
  }

  get(id: string): unknown {
    return this.results.get(id);
  }
}

const resultStores = new Map<string, ResultStore>();

/**
 * A run's full results are remembered this long past its last touch. Requests that were aborted or
 * that failed halfway through have no exit to release them, so this is what keeps the map bounded.
 */
const RESULT_STORE_TTL_MS = 30 * 60 * 1000;

/** Ceiling on simultaneously remembered runs, whatever their age. */
const MAX_LIVE_RESULT_STORES = 64;

const resultStoreTouchedAt = new Map<string, number>();

function sweepResultStores(now: number): void {
  for (const [runId, touched] of resultStoreTouchedAt) {
    if (now - touched > RESULT_STORE_TTL_MS) {
      resultStores.delete(runId);
      resultStoreTouchedAt.delete(runId);
    }
  }
  while (resultStores.size > MAX_LIVE_RESULT_STORES) {
    const oldest = resultStores.keys().next().value;
    if (oldest === undefined) break;
    resultStores.delete(oldest);
    resultStoreTouchedAt.delete(oldest);
  }
}

/** The store of a run, created on first use; `read_result` reaches it through `ctx.runId`. */
export function resultStoreFor(
  runId: string | undefined,
): ResultStore | undefined {
  if (!runId) return undefined;
  const now = Date.now();
  sweepResultStores(now);
  const existing = resultStores.get(runId);
  if (existing) {
    resultStoreTouchedAt.set(runId, now);
    return existing;
  }
  const store = new ResultStore();
  resultStores.set(runId, store);
  resultStoreTouchedAt.set(runId, now);
  return store;
}

/** Releases a run's full results when the run ends. */
export function releaseResultStore(runId: string | undefined): void {
  if (!runId) return;
  resultStores.delete(runId);
  resultStoreTouchedAt.delete(runId);
}

/** The text a model would see for a stored result. */
export function resultText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * P1-10 fences untrusted tool output as `<untrusted_content …>body</untrusted_content>`, and escapes
 * every closing tag inside the body, so the last closing tag is always the real one.
 */
const FENCE_PATTERN =
  /^(<untrusted_content\b[^>]*>)([\s\S]*)(<\/untrusted_content>)$/;

function splitFence(
  text: string,
): { open: string; body: string; close: string } | null {
  const match = FENCE_PATTERN.exec(text);
  if (!match) return null;
  return { open: match[1], body: match[2], close: match[3] };
}

/** A tool message body is JSON when the engine wrote one; otherwise it is fenced text. */
function parseToolPayload(text: string): unknown {
  const body = splitFence(text)?.body ?? text;
  const trimmed = body.trim();
  if (!trimmed) return text;
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

// ─── read_result ──────────────────────────────────────────────────────────────

/** A slice is capped twice over: by the tool's `maxModelChars` and by this token ceiling. */
export const MAX_SLICE_TOKENS = 2000;
export const MAX_SLICE_CHARS = Math.ceil(MAX_SLICE_TOKENS * CHARS_PER_TOKEN);

export type ReadResultOutcome =
  | {
      ok: true;
      text: string;
      offset: number;
      length: number;
      totalChars: number;
      /** Characters the model can still ask for with a higher offset. */
      remaining: number;
    }
  | { ok: false; error: string };

/** Reads one slice out of a stored full result. Never throws: a miss comes back as `{ ok: false }`. */
export function readResultSlice(
  store: ResultStore | undefined,
  id: string,
  offset?: number,
  length?: number,
): ReadResultOutcome {
  if (!isResultId(id)) {
    return {
      ok: false,
      error: `"${id}" is not a result id. Use the id from a [full result: result_id=...] marker.`,
    };
  }
  if (!store || !store.has(id)) {
    return {
      ok: false,
      error: `No stored result for "${id}" — it belongs to another run or was evicted.`,
    };
  }
  const text = resultText(store.get(id));
  const start = Math.max(
    0,
    Math.floor(offset && Number.isFinite(offset) ? offset : 0),
  );
  if (start >= text.length) {
    return {
      ok: true,
      text: "",
      offset: start,
      length: 0,
      totalChars: text.length,
      remaining: 0,
    };
  }
  const requested = Math.max(
    1,
    Math.floor(length && Number.isFinite(length) ? length : MAX_SLICE_CHARS),
  );
  const slice = text.slice(start, start + Math.min(requested, MAX_SLICE_CHARS));
  return {
    ok: true,
    text: slice,
    offset: start,
    length: slice.length,
    totalChars: text.length,
    remaining: Math.max(0, text.length - (start + slice.length)),
  };
}

// ─── transcript shape ─────────────────────────────────────────────────────────

/**
 * The block the memory system prepends to a turn. The spec calls it "the core memory block"; in
 * this codebase retrieved memories arrive as `<retrieved_memories>` inside the latest user message
 * (see `placeDynamicContext`), which is protected anyway — this covers a transcript that carries
 * the block as its own message.
 */
export const MEMORY_BLOCK_MARKERS = [
  "<core_memory",
  "<retrieved_memories",
] as const;

/** The one message a compaction leaves behind. */
export const SUMMARY_PREFIX = "[Conversation summary]";

/** Turns older than this many messages are what compaction summarizes. */
export const KEEP_LAST_MESSAGES = 6;

/** Tool rounds whose results stay whole: the model is probably still working with them. */
export const KEEP_RECENT_TOOL_ROUNDS = 2;

/** Ceiling of the head left in place when a tool result shrinks (spec: min(maxModelChars, 1500)). */
export const SHRINK_CHAR_CAP = 1500;

/** Ceiling of the summary message, so compaction cannot become the new problem. */
export const MAX_SUMMARY_CHARS = 4000;

/** Shorter than this, the cheap model did not really summarize anything. */
export const MIN_SUMMARY_CHARS = 20;

/** Characters of each message the summarizer gets to read. */
export const TRANSCRIPT_CHARS_PER_MESSAGE = 1500;

/** A cached summary older than this is regenerated rather than reused. */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** True when a message opens with a memory block, which no step may drop or summarize away. */
export function isCoreMemoryMessage(message: KemmaMessage): boolean {
  const text =
    typeof message.content === "string" ? message.content.trimStart() : "";
  return MEMORY_BLOCK_MARKERS.some((marker) => text.startsWith(marker));
}

export function isSummaryMessage(message: KemmaMessage): boolean {
  return (
    typeof message.content === "string" &&
    message.content.startsWith(SUMMARY_PREFIX)
  );
}

function toolCallIds(message: KemmaMessage): string[] {
  return (message.tool_calls ?? []).map((call) => call.id);
}

export interface MessageUnit {
  indices: number[];
  /** True when at least one of its calls has no result yet — such a pair must stay in place. */
  pending: boolean;
}

/**
 * Groups the transcript into units that travel together: an assistant message calling tools plus the
 * tool replies that answer those calls.
 */
export function messageUnits(messages: readonly KemmaMessage[]): MessageUnit[] {
  const units: MessageUnit[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const wanted =
      message.role === "assistant"
        ? new Set(toolCallIds(message))
        : new Set<string>();
    if (wanted.size === 0) {
      units.push({ indices: [i], pending: false });
      continue;
    }
    const indices = [i];
    let j = i + 1;
    while (
      j < messages.length &&
      messages[j].role === "tool" &&
      wanted.has(messages[j].tool_call_id ?? "")
    ) {
      indices.push(j);
      wanted.delete(messages[j].tool_call_id ?? "");
      j++;
    }
    units.push({ indices, pending: wanted.size > 0 });
    i = j - 1;
  }
  return units;
}

/**
 * Indices no step may drop or rewrite: the system prompt, the core memory block, the latest user
 * message with the attachment context in front of it, an existing summary, and every message of a
 * pending tool call/result pair. The first user message is not here — compaction keeps it (see
 * `firstUserIndex`), while the hard trim may drop it like any other old turn.
 */
export function protectedIndices(
  messages: readonly KemmaMessage[],
): Set<number> {
  const protectedSet = new Set<number>();
  for (const unit of messageUnits(messages)) {
    if (unit.pending) for (const index of unit.indices) protectedSet.add(index);
  }
  const lastUser = lastUserIndex(messages);
  if (lastUser >= 0) {
    protectedSet.add(lastUser);
    for (let i = lastUser - 1; i >= 0 && messages[i].role === "user"; i--)
      protectedSet.add(i);
  }
  messages.forEach((message, i) => {
    if (
      message.role === "system" ||
      isCoreMemoryMessage(message) ||
      isSummaryMessage(message)
    )
      protectedSet.add(i);
  });
  return protectedSet;
}

/**
 * The turn that opened the conversation, which compaction leaves in place. A leading memory block is
 * skipped — the human's own first message is the one worth keeping verbatim.
 */
export function firstUserIndex(messages: readonly KemmaMessage[]): number {
  let memoryBlock = -1;
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role !== "user") continue;
    if (!isCoreMemoryMessage(message)) return i;
    if (memoryBlock < 0) memoryBlock = i;
  }
  return memoryBlock;
}

function lastUserIndex(messages: readonly KemmaMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

/** The `tool_call_id`s of the last `rounds` tool rounds; those results are never shrunk. */
export function recentToolCallIds(
  messages: readonly KemmaMessage[],
  rounds: number = KEEP_RECENT_TOOL_ROUNDS,
): Set<string> {
  const seen: string[][] = [];
  let current: string[] | null = null;
  for (const message of messages) {
    if (message.role === "tool") {
      if (!current) {
        current = [];
        seen.push(current);
      }
      current.push(message.tool_call_id ?? "");
    } else {
      current = null;
    }
  }
  const keep = new Set<string>();
  for (const round of seen.slice(
    Math.max(0, seen.length - Math.max(0, rounds)),
  )) {
    for (const id of round) keep.add(id);
  }
  return keep;
}

/** Pairing violations: a tool result without its call, or a call without its result. */
export function findPairingViolations(messages: readonly KemmaMessage[]): {
  orphanToolCallIds: string[];
  unansweredToolCallIds: string[];
} {
  const answered = new Set(
    messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id ?? ""),
  );
  const called = new Set(messages.flatMap(toolCallIds));
  return {
    orphanToolCallIds: [...answered].filter(
      (id) => id !== "" && !called.has(id),
    ),
    unansweredToolCallIds: [...called].filter((id) => !answered.has(id)),
  };
}

// ─── step 1: shrink old tool results ─────────────────────────────────────────

function maxModelCharsFor(toolName?: string): number {
  return getToolSpec(toolName ?? "")?.maxModelChars ?? SHRINK_CHAR_CAP;
}

function summarizerFor(
  toolName?: string,
): ((result: unknown) => string) | undefined {
  return toolName ? getToolSpec(toolName)?.summarize : undefined;
}

/** A shrink only pays for the handle line if it saves at least this many characters. */
export const MIN_SHRINK_SAVING_CHARS = 64;

function shrinkCapFor(toolName?: string): number {
  return Math.max(0, Math.min(SHRINK_CHAR_CAP, maxModelCharsFor(toolName)));
}

/** Cuts text to `cap` characters, re-closing an untrusted fence so a shrunk body stays labelled. */
function sliceToCap(content: string, cap: number): string {
  if (content.length <= cap) return content;
  const fence = splitFence(content);
  if (!fence) return content.slice(0, cap);
  const room = Math.max(0, cap - fence.open.length - fence.close.length);
  return `${fence.open}${fence.body.slice(0, room)}${fence.close}`;
}

function headOf(
  content: string,
  summarizer?: (result: unknown) => string,
  toolName?: string,
): string {
  const cap = shrinkCapFor(toolName);
  if (summarizer) {
    const fence = splitFence(content);
    const room = Math.max(
      0,
      cap - (fence ? fence.open.length + fence.close.length : 0),
    );
    try {
      const summary = summarizer(parseToolPayload(content));
      if (typeof summary === "string" && summary.trim()) {
        const head = summary.trim().slice(0, room);
        return fence ? `${fence.open}${head}${fence.close}` : head;
      }
    } catch {
      // A summarizer that throws is no reason to lose a result; take the head instead.
    }
  }
  return sliceToCap(content, cap);
}

export interface ShrinkOptions {
  /** Rounds that stay whole. `0` shrinks every result, which the last-resort pass uses. */
  keepRecentToolRounds?: number;
}

/**
 * Replaces every old tool result with its head plus a handle to the full body, which stays in the
 * store. Uses the tool's own `summarize` when it defines one, otherwise the first
 * `min(maxModelChars, 1500)` characters.
 */
export function shrinkToolResults(
  messages: readonly KemmaMessage[],
  store: ResultStore,
  options: ShrinkOptions = {},
): { messages: KemmaMessage[]; changed: boolean; ids: string[] } {
  const keep = recentToolCallIds(
    messages,
    options.keepRecentToolRounds ?? KEEP_RECENT_TOOL_ROUNDS,
  );
  const ids: string[] = [];
  let changed = false;
  const shrunk = messages.map((message) => {
    if (message.role !== "tool" || typeof message.content !== "string")
      return message;
    if (keep.has(message.tool_call_id ?? "")) return message;
    if (message.content.includes(FULL_RESULT_MARKER)) return message;
    const head = headOf(
      message.content,
      summarizerFor(message.name),
      message.name,
    );
    if (message.content.length - head.length < MIN_SHRINK_SAVING_CHARS)
      return message;
    const id = store.put(message.content);
    ids.push(id);
    changed = true;
    return { ...message, content: `${head}\n${resultHandle(id)}` };
  });
  return { messages: shrunk, changed, ids };
}

/**
 * Handles a fresh tool result before it joins the transcript, returning what the model should see,
 * or `null` when the manager is off or the result is short enough to travel whole — so a short chat
 * keeps exactly the messages it had before this module existed.
 */
export function handleFreshResult(params: {
  content: string;
  toolName?: string;
  store?: ResultStore;
}): string | null {
  if (!flag("CONTEXT_MANAGER") || !params.store) return null;
  const head = headOf(
    params.content,
    summarizerFor(params.toolName),
    params.toolName,
  );
  if (params.content.length - head.length < MIN_SHRINK_SAVING_CHARS)
    return null;
  const id = params.store.put(params.content);
  return `${head}\n${resultHandle(id)}`;
}

// ─── step 2: compact history ─────────────────────────────────────────────────

/** The row kept in `chat_sessions.context_cache`. */
export interface CompactionCacheEntry {
  prefixHash: string;
  upToIndex: number;
  summary: string;
  model: string;
  createdAt: number;
}

/** Accepts whatever the jsonb column held and returns a usable entry, or null. */
export function normalizeCacheEntry(raw: unknown): CompactionCacheEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.prefixHash !== "string" || typeof value.summary !== "string")
    return null;
  const upToIndex = Number(value.upToIndex);
  if (!Number.isInteger(upToIndex) || upToIndex < 0) return null;
  return {
    prefixHash: value.prefixHash,
    upToIndex,
    summary: value.summary,
    model: typeof value.model === "string" ? value.model : "unknown",
    createdAt: Number.isFinite(Number(value.createdAt))
      ? Number(value.createdAt)
      : 0,
  };
}

/**
 * Handles are random per run, so they are hashed as a placeholder: a re-shrunk transcript with the
 * same visible text must still match the summary it already has.
 */
const HASH_HANDLE_PATTERN = new RegExp(
  `${FULL_RESULT_MARKER}[A-Za-z0-9_\\-.:]{1,128}\\]`,
  "g",
);

function hashableContent(content: string): string {
  return content.replace(HASH_HANDLE_PATTERN, `${FULL_RESULT_MARKER}#]`);
}

/** Stable serialization of the transcript; only what the model sees counts. */
export function serializeForHash(messages: readonly KemmaMessage[]): string {
  return messages
    .map((m) =>
      JSON.stringify([
        m.role,
        m.name ?? "",
        m.tool_call_id ?? "",
        typeof m.content === "string"
          ? hashableContent(m.content)
          : (m.content ?? ""),
        m.tool_calls ?? "",
      ]),
    )
    .join("\n");
}

/**
 * `prefixHash` is the sha256 of everything up to the cut, protected messages included, so a change
 * anywhere in that prefix — an edited memory block, a re-read file — invalidates the cached summary
 * instead of quietly answering from a stale one.
 */
export function prefixHash(messages: readonly KemmaMessage[]): string {
  return createHash("sha256")
    .update(serializeForHash(messages), "utf8")
    .digest("hex");
}

/** Whether the cached summary still describes exactly this prefix. */
export function isUsableCache(
  entry: CompactionCacheEntry | null | undefined,
  upToIndex: number,
  hash: string,
  now: number = Date.now(),
): entry is CompactionCacheEntry {
  if (!entry || !entry.summary.trim()) return false;
  if (entry.upToIndex !== upToIndex || entry.prefixHash !== hash) return false;
  if (
    Number.isFinite(entry.createdAt) &&
    entry.createdAt > 0 &&
    now - entry.createdAt > CACHE_MAX_AGE_MS
  )
    return false;
  return true;
}

/** Turns whatever the cheap model returned into the body of a summary message. */
export function compactSummaryText(
  raw: string | null | undefined,
): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const unwrapped = text
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();
  const unheaded = unwrapped.replace(/^#{1,6}\s*.*(?:\r?\n|$)/, "").trim();
  const withoutPrefix = unheaded.startsWith(SUMMARY_PREFIX)
    ? unheaded.slice(SUMMARY_PREFIX.length).trim()
    : unheaded;
  // Blank runs cost tokens and add nothing: the summary is one block of prose.
  const body = withoutPrefix
    .replace(/[ \t]*\r?\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .slice(0, MAX_SUMMARY_CHARS)
    .trim();
  return body.length >= MIN_SUMMARY_CHARS ? body : null;
}

export function summaryMessage(text: string): KemmaMessage {
  return { role: "assistant", content: `${SUMMARY_PREFIX} ${text}` };
}

const REFUSAL_PATTERNS = [
  /^\s*(I|We)\s+(ca?n|will)\s*'?\s*t\s+(not\s+)?(answer|help|summarize|comment)/i,
  /^\s*(I\s+)?(do\s*'?n'?t|don'?t|cannot|can not)\s+have\s+(enough|any)/i,
  /^\s*nothing\s+to\s+summarize/i,
];

/** A cheap model that refuses must not become the transcript. */
export function looksLikeRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(text));
}

/** What the cheap model is asked to do; the keep-list is the spec's. */
export const COMPACTION_SYSTEM_PROMPT = `You compress a conversation into notes another model will continue from.
Write dense bullet points that keep:
- every fact and decision the conversation established
- open tasks and questions still unanswered
- names of people and files, file names and paths
- numbers, dates, ids, prices, quantities, URLs
Do not comment on the conversation, do not add an introduction, and never drop a number or a name.`;

/** The transcript handed to the summarizer: one trimmed line per turn. */
export function transcriptForSummary(
  messages: readonly KemmaMessage[],
): string {
  return messages
    .map((message, i) => {
      const who =
        message.role === "tool"
          ? `result of ${message.name ?? "tool"}`
          : message.role;
      const body = (message.content ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, TRANSCRIPT_CHARS_PER_MESSAGE);
      const calls = (message.tool_calls ?? [])
        .map(
          (call) =>
            `${call.function.name}(${String(call.function.arguments ?? "").slice(0, 200)})`,
        )
        .join(", ");
      return `${i + 1}. ${who}: ${body}${calls ? ` [called: ${calls}]` : ""}`;
    })
    .join("\n");
}

/** The cut index: never inside a tool call/result pair, never inside the turns worth keeping. */
export function cutIndexAt(
  messages: readonly KemmaMessage[],
  keepLast: number = KEEP_LAST_MESSAGES,
): number {
  const desired = Math.max(0, messages.length - keepLast);
  for (const unit of messageUnits(messages)) {
    if (unit.indices[0] >= desired) return unit.indices[0];
    if (unit.indices[unit.indices.length - 1] >= desired)
      return unit.indices[0];
  }
  return desired;
}

/**
 * The turns of the head that compaction must leave on the record: the protected ones (except an
 * older summary, which the new summary supersedes so they cannot pile up) and the first user message.
 */
export function compactionKeepIndices(
  messages: readonly KemmaMessage[],
  upToIndex: number,
): Set<number> {
  const protectedSet = protectedIndices(messages);
  const keep = new Set<number>();
  const firstUser = firstUserIndex(messages);
  messages.forEach((message, i) => {
    if (i >= upToIndex) return;
    if (protectedSet.has(i) && !isSummaryMessage(message)) keep.add(i);
  });
  if (firstUser >= 0 && firstUser < upToIndex) keep.add(firstUser);
  return keep;
}

// ─── the manager ──────────────────────────────────────────────────────────────

export type ContextStep = "shrink" | "compaction" | "trim" | "shrinkAll";

export interface ManageContextOptions {
  messages: readonly KemmaMessage[];
  model: string;
  /** `max_tokens` of the call about to be made; the budget is spent against it. */
  maxTokens?: number;
  /** Wire tool definitions, counted into every estimate. */
  tools?: unknown;
  /** Where full results live; a throwaway one is used when omitted. */
  store?: ResultStore;
  budget?: number;
  /** The cached summary of this chat session, and where to write the new one. */
  cache?: CompactionCacheEntry | null;
  saveCache?: (entry: CompactionCacheEntry) => void | Promise<void>;
  /** Runs the cheap model over a transcript. Without it, compaction is skipped. */
  summarizeCalls?: (transcript: string) => Promise<string>;
  /** Label recorded in the cache for the model that wrote the summary. */
  summaryModel?: string;
  keepLastMessages?: number;
  now?: () => number;
}

export interface ManageContextResult {
  messages: KemmaMessage[];
  applied: ContextStep[];
  budget: number;
  estimatedTokens: number;
  overBudget: boolean;
  changed: boolean;
  /** Tool results replaced by a handle. */
  shrunkResults: number;
  /** Messages dropped or folded into a summary. */
  removedMessages: number;
  cache: CompactionCacheEntry | null;
}

/**
 * Brings a request under budget. With the flag off, or when the request already fits, it returns the
 * input array untouched and reports nothing applied.
 */
export async function manageContext(
  options: ManageContextOptions,
): Promise<ManageContextResult> {
  const budget =
    options.budget ?? contextBudgetFor(options.model, options.maxTokens);
  const store = options.store ?? new ResultStore();
  const keepLast = options.keepLastMessages ?? KEEP_LAST_MESSAGES;
  const now = options.now ?? Date.now;
  const estimate = (messages: readonly KemmaMessage[]) =>
    estimateTokens(messages, options.tools, options.model);

  const applied: ContextStep[] = [];
  let cache = options.cache ?? null;
  let shrunkResults = 0;
  let removedMessages = 0;
  let messages = options.messages as KemmaMessage[];
  let estimatedTokens = estimate(messages);

  const done = (): ManageContextResult => ({
    messages,
    applied,
    budget,
    estimatedTokens,
    overBudget: estimatedTokens > budget,
    changed: messages !== (options.messages as KemmaMessage[]),
    shrunkResults,
    removedMessages,
    cache,
  });

  if (!flag("CONTEXT_MANAGER") || estimatedTokens <= budget) return done();

  // 1. Shrink old tool results to a handle.
  const shrunk = shrinkToolResults(messages, store);
  if (shrunk.changed) {
    messages = shrunk.messages;
    shrunkResults += shrunk.ids.length;
    applied.push("shrink");
    estimatedTokens = estimate(messages);
  }
  if (estimatedTokens <= budget) return done();

  // 2. Compact the oldest turns into one summary, reusing the cached one while the prefix holds.
  if (options.summarizeCalls || cache) {
    const upToIndex = cutIndexAt(messages, keepLast);
    const keep = compactionKeepIndices(messages, upToIndex);
    const summarize = messages.filter((_, i) => i < upToIndex && !keep.has(i));
    const hash = prefixHash(messages.slice(0, upToIndex));
    let summary: string | null = null;
    let reused = false;
    if (isUsableCache(cache, upToIndex, hash, now())) {
      summary = cache.summary;
      reused = true;
    } else if (options.summarizeCalls && summarize.length > 1) {
      try {
        summary = compactSummaryText(
          await options.summarizeCalls(transcriptForSummary(summarize)),
        );
      } catch {
        summary = null; // A failed compaction is no reason to fail the request.
      }
    }
    if (summary && !looksLikeRefusal(summary)) {
      if (!reused) {
        cache = {
          prefixHash: hash,
          upToIndex,
          summary,
          model: options.summaryModel ?? options.model,
          createdAt: now(),
        };
        // The cheap model has answered, so write it down even if the request still does not fit after
        // the later steps — a recomputed summary would bill the same call again. A failing write costs
        // one repeated call next turn; it must never cost the user this turn.
        try {
          await options.saveCache?.(cache);
        } catch {
          // The summary is still used for this turn, it is just not cached.
        }
      }
      const head = messages.filter((_, i) => i < upToIndex && keep.has(i));
      messages = [
        ...head,
        summaryMessage(summary),
        ...messages.slice(upToIndex),
      ];
      removedMessages += summarize.length;
      applied.push("compaction");
      estimatedTokens = estimate(messages);
    }
  }
  if (estimatedTokens <= budget) return done();

  // 3. Hard trim: drop the oldest non-protected unit until it fits, never splitting a pair.
  const trimBase = messages;
  const trimProtected = protectedIndices(trimBase);
  const perMessage = trimBase.map(messageTokens);
  let rawTotal = estimateRawTokens(trimBase, options.tools);
  const dropped = new Set<number>();
  for (const unit of messageUnits(trimBase)) {
    if (unit.pending || unit.indices.some((i) => trimProtected.has(i)))
      continue;
    for (const index of unit.indices) {
      if (dropped.has(index)) continue;
      dropped.add(index);
      rawTotal -= perMessage[index];
    }
    if (Math.ceil(rawTotal * calibrationFor(options.model)) <= budget) break;
  }
  if (dropped.size > 0) {
    messages = trimBase.filter((_, i) => !dropped.has(i));
    removedMessages += dropped.size;
    applied.push("trim");
  }
  estimatedTokens = estimate(messages);
  if (estimatedTokens <= budget) return done();

  // Only the last two rounds are left and they still do not fit: shrink them too, last resort.
  const forced = shrinkToolResults(messages, store, {
    keepRecentToolRounds: 0,
  });
  if (forced.changed) {
    messages = forced.messages;
    shrunkResults += forced.ids.length;
    applied.push("shrinkAll");
  }
  return done();
}
