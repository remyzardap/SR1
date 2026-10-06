/**
 * kemmaMax.ts — Consolidated Kemma agent upgrade module
 *
 * Everything needed to bring Kemma to Perplexity-Max-quality output, in one
 * file: sandboxed code execution (E2B), real browser rendering (browser-use),
 * a corrected tool dispatcher (3 bugs fixed vs. the original executor.ts),
 * and a deep-research prompt addition + budget override for solo/personal use.
 *
 * This file REPLACES server/kemma/executor.ts, server/kemma/executors/runCode.ts,
 * and server/kemma/executors/browse.ts as three separate files — everything
 * they did now lives here. safe_files, web_search, generate_file, and
 * phone_scan are untouched and still imported from their existing locations,
 * since none of them had confirmed bugs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INSTALL
 * ─────────────────────────────────────────────────────────────────────────
 *   npm install @e2b/code-interpreter browser-use-sdk
 *
 *   .env additions:
 *     E2B_API_KEY=...
 *     BROWSER_USE_API_KEY=...
 *     E2B_SANDBOX_TEMPLATE=        # optional, only if you bake a custom image
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WIRING (3 small edits elsewhere — this file can't do these for you since
 * they live in other files)
 * ─────────────────────────────────────────────────────────────────────────
 *   1. Delete server/kemma/executor.ts, server/kemma/executors/runCode.ts,
 *      server/kemma/executors/browse.ts.
 *   2. In server/kemma/executors/generateFile.ts — fix the broken type
 *      import (bug #4 below), the one thing this file can't fix for you
 *      since it lives in a file we're not replacing:
 *        change:  import type { DocumentContent, StyleDef } from "../../fileGenerator";
 *        to:      import type { StructuredContent, StyleOption } from "../../fileGenerator";
 *      and update the two type annotations in that file's
 *      generateAndSaveFile signature (content: DocumentContent ->
 *      StructuredContent, style: StyleDef -> StyleOption) to match.
 *      Without this, generateFile.ts likely fails to compile, since
 *      fileGenerator.ts never exported DocumentContent/StyleDef.
 *   3. In server/kemma/engine.ts:
 *        - change:  import { executeToolCall } from "./executor";
 *          to:      import { executeToolCall } from "./kemmaMax";
 *        - change:  const MAX_TOOL_CALLS: Record<Tier, number> = { free: 2, trial: 20, pro: 20, max: 50 };
 *          to:      import { MAX_TOOL_CALLS } from "./kemmaMax";   (and delete the local const)
 *   4. In server/kemma/personality.ts, append DEEP_RESEARCH_ADDITION (exported
 *      below) to whatever buildKemmaSystemPrompt() returns, e.g.:
 *        return basePrompt + "\n\n" + DEEP_RESEARCH_ADDITION;
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT'S FIXED VS. THE ORIGINAL executor.ts
 * ─────────────────────────────────────────────────────────────────────────
 *   1. run_code: original called runCode(code, language) but runCode is
 *      defined (language, code) — arguments were swapped. Fixed here, with
 *      a default of "python" when the model omits language.
 *   2. browse: original only ever forwarded `url`, silently dropping
 *      extractLinks/extractImages/maxLength/waitForSelector even though the
 *      tool schema in tools.ts advertises all four. Fixed to forward
 *      everything.
 *   3. generate_file: original called generateAndSaveFile(description,
 *      outputPath, options) — 3 args — but the real function signature is
 *      (userId, name, content, format, style) — 5 args, and userId was never
 *      passed at all. Bridged here from the tool schema's real fields
 *      (format, content, filename, styling).
 *
 *   4. generate_file's own import was broken. executors/generateFile.ts
 *      does `import type { DocumentContent, StyleDef } from "../../fileGenerator"`,
 *      but fileGenerator.ts never exports either name — it exports
 *      `StructuredContent` and `StyleOption`. This file uses the real,
 *      confirmed types from fileGenerator.ts directly (see section 3 below),
 *      so `content` must be built as a StructuredContent object (title +
 *      sections[]), not a flat string. A plain string is auto-wrapped into
 *      a single-section StructuredContent below as a reasonable default —
 *      pass a pre-structured JSON string in the `content` arg for anything
 *      that should have multiple sections/headings.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY NO MULTI-TENANT MACHINERY
 * ─────────────────────────────────────────────────────────────────────────
 *   Kemma here is scoped for single-user personal use, not a resold product.
 *   That removes the need for tenant-scoped credentials, sandbox-per-tenant
 *   policy enforcement, and billing-tier quota gating as hard requirements —
 *   E2B/browser-use sandboxing is still used because it's cheap (~$0.03/task)
 *   and keeps untrusted code/pages off your real machine, not because of
 *   multi-tenancy.
 */

import { Sandbox, type SandboxOpts } from "@e2b/code-interpreter";

import { BrowserUse } from "browser-use-sdk";
import fsp from "fs/promises";
import nodePath from "path";
import { type FileSkill } from "./fileSkills";
import { runTool } from "./toolkit/registry";
import type { ToolContext } from "./toolkit/types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. SANDBOXED CODE EXECUTION (E2B) — replaces executors/runCode.ts
// ═══════════════════════════════════════════════════════════════════════════

const E2B_API_KEY = process.env.E2B_API_KEY;
const CODE_TIMEOUT_MS = 30_000;
// Sandbox lifetime, NOT the execution timeout: a freshly created sandbox
// needs boot headroom on top of the 30s execution budget, or the sandbox
// itself expires before the code finishes running.
const SANDBOX_LIFETIME_MS = 120_000;
const CODE_MAX_OUTPUT_BYTES = 50_000;
const SANDBOX_TEMPLATE = process.env.E2B_SANDBOX_TEMPLATE || undefined;

export interface RunCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  engine: "e2b";
  timedOut: boolean;
}

function detectDangerousCode(code: string): string | null {
  const patterns: Array<{ re: RegExp; reason: string }> = [
    { re: /rm\s+-rf\s+\//, reason: "recursive root deletion" },
    { re: /:\(\)\s*\{\s*:\|:&\s*\};:/, reason: "fork bomb" },
  ];
  for (const { re, reason } of patterns) if (re.test(code)) return reason;
  return null;
}

function truncateBytes(text: string, maxBytes: number): string {
  return Buffer.byteLength(text, "utf-8") <= maxBytes ? text : text.slice(0, maxBytes) + "\n... [truncated]";
}

export async function runCode(language: "python" | "nodejs", code: string, signal?: AbortSignal): Promise<RunCodeResult> {
  if (signal?.aborted) {
    return { stdout: "", stderr: "Execution was aborted", exitCode: 130, engine: "e2b", timedOut: false };
  }

  if (!code.trim()) {
    return { stdout: "", stderr: "No code provided", exitCode: 1, engine: "e2b", timedOut: false };
  }

  const danger = detectDangerousCode(code);
  if (danger) {
    return { stdout: "", stderr: `Blocked: ${danger}`, exitCode: 1, engine: "e2b", timedOut: false };
  }

  if (!E2B_API_KEY) {
    return {
      stdout: "",
      stderr: "E2B_API_KEY is not configured. Code execution is unavailable until it is set.",
      exitCode: 1,
      engine: "e2b",
      timedOut: false,
    };
  }

  let sbx: Sandbox | undefined;
  const onAbort = () => {
    if (sbx) {
      try {
        sbx.kill().catch(() => {});
      } catch {
        /* best-effort cleanup */
      }
    }
  };
  if (signal) {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    // Build opts conditionally so `template: undefined` is never sent
    // explicitly when E2B_SANDBOX_TEMPLATE is unset.
    const sandboxOpts: SandboxOpts = {
      apiKey: E2B_API_KEY,
      timeoutMs: SANDBOX_LIFETIME_MS,
    };
    if (SANDBOX_TEMPLATE) sandboxOpts.template = SANDBOX_TEMPLATE;
    sbx = await Sandbox.create(sandboxOpts);

    if (signal?.aborted) {
      await sbx.kill().catch(() => {});
      return { stdout: "", stderr: "Execution was aborted", exitCode: 130, engine: "e2b", timedOut: false };
    }

    const execution =
      language === "python"
        ? await sbx.runCode(code, { timeoutMs: CODE_TIMEOUT_MS })
        : await sbx.runCode(code, { language: "javascript", timeoutMs: CODE_TIMEOUT_MS });

    const stdout = truncateBytes((execution.logs?.stdout ?? []).join("\n"), CODE_MAX_OUTPUT_BYTES);
    const stderr = truncateBytes((execution.logs?.stderr ?? []).join("\n"), CODE_MAX_OUTPUT_BYTES);
    const errored = !!execution.error;

    return {
      stdout,
      stderr: errored ? `${stderr}\n${execution.error?.value ?? ""}`.trim() : stderr,
      exitCode: errored ? 1 : 0,
      engine: "e2b",
      timedOut: false,
    };
  } catch (err) {
    if (signal?.aborted) {
      return { stdout: "", stderr: "Execution was aborted", exitCode: 130, engine: "e2b", timedOut: false };
    }
    const message = (err as Error).message ?? "Unknown sandbox error";
    const timedOut = /timeout/i.test(message);
    return {
      stdout: "",
      stderr: timedOut ? "Execution timed out" : `Sandbox error: ${message}`,
      exitCode: timedOut ? 124 : 1,
      engine: "e2b",
      timedOut,
    };
  } finally {
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
    if (sbx) {
      try {
        await sbx.kill();
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. REAL BROWSER RENDERING (browser-use cloud) — replaces executors/browse.ts
// ═══════════════════════════════════════════════════════════════════════════
// CORRECTED (checked against live docs on 2026-09-23): the API this file
// originally targeted (api/v1/run-task, single synchronous POST, Bearer
// auth) is the OLD v1 surface. The current API is v4: create a run,
// poll/await it, then read the result — and auth uses the
// X-Browser-Use-API-Key header, not Authorization: Bearer. This version
// uses the official `browser-use-sdk` npm package: client.run(task,
// { timeout }) returns a lazy TaskRun handle, and awaiting it polls until
// the task reaches a terminal state and resolves to a TaskResult whose
// `output` field holds the task's final answer. (Verified against the
// shipped type declarations of browser-use-sdk@3.11.3 on 2026-09-23.)
//
// Install: npm install browser-use-sdk

const BROWSER_USE_API_KEY = process.env.BROWSER_USE_API_KEY;
const BROWSE_TIMEOUT_MS = 60_000; // real browser navigation needs more headroom than a plain fetch
const DEFAULT_MAX_LENGTH = 10_000;

// Drive root/folder resolution moved to server/kemma/toolkit/builtin/drive.ts with the
// drive_create/drive_move tools that used it; nothing else in this file needs it.

let browserUseClient: BrowserUse | null = null;
function getBrowserUseClient(): BrowserUse {
  if (!browserUseClient) browserUseClient = new BrowserUse({ apiKey: BROWSER_USE_API_KEY });
  return browserUseClient;
}

export interface BrowseOptions {
  extractText?: boolean;
  extractLinks?: boolean;
  extractImages?: boolean;
  maxLength?: number;
  waitForSelector?: string;
  signal?: AbortSignal;
}

export interface BrowseResult {
  title: string;
  content: string;
  links?: string[];
  images?: string[];
}

export interface BrowseError extends Error {
  code: string;
  statusCode?: number;
}

function createBrowseError(message: string, code: string, statusCode?: number): BrowseError {
  const error = new Error(message) as BrowseError;
  error.code = code;
  if (statusCode !== undefined) error.statusCode = statusCode;
  return error;
}

function validateUrl(url: string): string {
  if (!url || typeof url !== "string") throw createBrowseError("URL is required and must be a string", "INVALID_URL");
  const trimmed = url.trim();
  if (!trimmed) throw createBrowseError("URL cannot be empty", "INVALID_URL");
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw createBrowseError(`Unsupported protocol: ${parsed.protocol}`, "INVALID_URL");
    }
    return normalized;
  } catch (err) {
    if (err instanceof Error && "code" in err) throw err;
    throw createBrowseError(`Invalid URL format: ${trimmed}`, "INVALID_URL");
  }
}

function truncateChars(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : text.slice(0, maxLength) + "\n... [truncated]";
}

/**
 * Asks the task to emit a single JSON object as its final answer, then
 * parses it ourselves. This sidesteps depending on the exact structured-
 * output parameter name in the current SDK version (which varies between
 * REST's snake_case and the JS SDK's camelCase) — the instruction-level
 * contract is simpler and won't break silently on an SDK version bump.
 */
export async function browse(url: string, options: BrowseOptions = {}): Promise<BrowseResult> {
  const normalizedUrl = validateUrl(url);

  if (!BROWSER_USE_API_KEY) {
    throw createBrowseError(
      "BROWSER_USE_API_KEY is not configured. Browsing is unavailable until it is set.",
      "NOT_CONFIGURED"
    );
  }

  const {
    extractText = true,
    extractLinks = false,
    extractImages = false,
    maxLength = DEFAULT_MAX_LENGTH,
    waitForSelector,
    signal,
  } = options;

  if (signal?.aborted) {
    throw createBrowseError("Request was aborted", "ABORTED");
  }

  const instructions = [
    `Go to ${normalizedUrl}.`,
    waitForSelector ? `Wait for the element matching "${waitForSelector}" to appear before proceeding.` : "",
    extractText ? "Extract the main readable text content of the page (skip navigation/ads/boilerplate)." : "",
    extractLinks ? "Also list the significant hyperlinks on the page (text + href)." : "",
    extractImages ? "Also list the significant image URLs on the page." : "",
    "Respond with ONLY a single JSON object, no other text, matching exactly this shape:",
    JSON.stringify({
      title: "string",
      content: "string",
      ...(extractLinks ? { links: ["string"] } : {}),
      ...(extractImages ? { images: ["string"] } : {}),
    }),
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const client = getBrowserUseClient();
    // client.run(task, opts) returns a lazy TaskRun; awaiting it polls
    // until the task is terminal and resolves to a TaskResult whose
    // `output` field holds the final answer. The SDK's native `timeout`
    // option (milliseconds) enforces BROWSE_TIMEOUT_MS.
    const taskRun = client.run(instructions, { timeout: BROWSE_TIMEOUT_MS });

    const stopBrowserTask = () => {
      try {
        if (typeof (taskRun as any).stop === "function") {
          (taskRun as any).stop();
        } else if (typeof (taskRun as any).cancel === "function") {
          (taskRun as any).cancel();
        } else if (taskRun.taskId && typeof client.tasks?.stop === "function") {
          client.tasks.stop(taskRun.taskId).catch(() => {});
        }
      } catch {
        /* best effort */
      }
    };

    let abortHandler: (() => void) | undefined;
    let abortPromise: Promise<never> | undefined;
    if (signal) {
      abortPromise = new Promise<never>((_, reject) => {
        abortHandler = () => {
          stopBrowserTask();
          reject(createBrowseError("Request was aborted", "ABORTED"));
        };
        signal.addEventListener("abort", abortHandler, { once: true });
      });
    }

    try {
      const result = abortPromise
        ? await Promise.race([taskRun, abortPromise])
        : await taskRun;

      const raw = (result as any)?.output ?? "";
      let parsed: { title?: string; content?: string; links?: string[]; images?: string[] } = {};
      try {
        // Model may wrap the JSON in prose or a code fence despite instructions — extract the object.
        const match = String(raw).match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      } catch {
        // Fall back to treating the raw output as page content if it isn't valid JSON.
        parsed = { title: normalizedUrl, content: String(raw) };
      }

      return {
        title: parsed.title || "Untitled",
        content: truncateChars(parsed.content || "", maxLength),
        ...(extractLinks ? { links: parsed.links ?? [] } : {}),
        ...(extractImages ? { images: parsed.images ?? [] } : {}),
      };
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  } catch (err) {
    if (err instanceof Error && (err as BrowseError).code) throw err;
    const message = err instanceof Error ? err.message : "Unknown error";
    // The SDK throws its own error when the polling timeout elapses.
    if (/timeout|timed out/i.test(message)) {
      throw createBrowseError(`Request timed out after ${BROWSE_TIMEOUT_MS}ms`, "TIMEOUT");
    }
    throw createBrowseError(
      `browser-use request failed: ${message}`,
      "NETWORK_ERROR"
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL SCRIPTS (E2B only): the skill folder is uploaded to /skills/<name>; never runs on this server
// ═══════════════════════════════════════════════════════════════════════════

const SKILL_SCRIPT_TIMEOUT_MS = 120_000;
const SKILL_SANDBOX_LIFETIME_MS = 300_000;
const SKILL_MAX_UPLOAD_BYTES = 5_000_000;

function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export async function runSkillScript(skill: FileSkill, script: string, args: string[]): Promise<RunCodeResult & { outputFiles: Array<{ path: string; bytes: number }> }> {
  const fail = (stderr: string) => ({ stdout: "", stderr, exitCode: 1, engine: "e2b" as const, timedOut: false, outputFiles: [] });
  if (!skill.dir) return fail("This skill has no scripts.");
  const rel = nodePath.posix.normalize(String(script).replace(/\\/g, "/"));
  if (!rel.startsWith("scripts/") || rel.includes("..") || !skill.files.includes(rel)) return fail(`Not a script of this skill. Scripts: ${skill.files.filter((f) => f.startsWith("scripts/")).join(", ") || "(none)"}`);
  const ext = nodePath.posix.extname(rel);
  const runner = ext === ".py" ? "python3" : ext === ".js" ? "node" : ext === ".sh" ? "bash" : null;
  if (!runner) return fail("Only .py, .js and .sh scripts can run.");
  if (!E2B_API_KEY) return fail("E2B_API_KEY is not configured. Skill scripts are unavailable until it is set.");

  const uploads: Array<{ path: string; data: ArrayBuffer }> = [];
  let total = 0;
  for (const f of ["SKILL.md", ...skill.files]) {
    const buf = await fsp.readFile(nodePath.join(skill.dir, f));
    total += buf.length;
    if (total > SKILL_MAX_UPLOAD_BYTES) return fail("Skill folder is too large to upload to the sandbox.");
    uploads.push({ path: `/skills/${skill.slug}/${f}`, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer });
  }

  let sbx: Sandbox | undefined;
  try {
    const opts: SandboxOpts = { apiKey: E2B_API_KEY, timeoutMs: SKILL_SANDBOX_LIFETIME_MS };
    if (SANDBOX_TEMPLATE) opts.template = SANDBOX_TEMPLATE;
    sbx = await Sandbox.create(opts);
    await sbx.files.write(uploads);
    await sbx.commands.run("mkdir -p /output");

    const cmd = `cd /skills/${skill.slug} && ${runner} ${shellQuote(rel)} ${args.map(shellQuote).join(" ")}`;
    let stdout = "", stderr = "", exitCode = 0;
    try {
      const r = await sbx.commands.run(cmd, { timeoutMs: SKILL_SCRIPT_TIMEOUT_MS });
      stdout = r.stdout; stderr = r.stderr; exitCode = r.exitCode;
    } catch (e: any) {
      // e2b throws CommandExitError on non-zero exit; it carries the streams.
      stdout = e?.stdout ?? ""; stderr = e?.stderr ?? String(e?.message ?? e); exitCode = typeof e?.exitCode === "number" ? e.exitCode : 1;
    }
    const listing = await sbx.files.list("/output").catch(() => []);
    return {
      stdout: truncateBytes(stdout, CODE_MAX_OUTPUT_BYTES),
      stderr: truncateBytes(stderr, CODE_MAX_OUTPUT_BYTES),
      exitCode,
      engine: "e2b",
      timedOut: false,
      outputFiles: listing.filter((f) => f.type === "file").map((f) => ({ path: f.path, bytes: f.size })),
    };
  } catch (err) {
    const message = (err as Error).message ?? "Unknown sandbox error";
    const timedOut = /timeout/i.test(message);
    return { ...fail(timedOut ? "Execution timed out" : `Sandbox error: ${message}`), exitCode: timedOut ? 124 : 1, timedOut };
  } finally {
    if (sbx) await sbx.kill().catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. TOOL DISPATCHER — compatibility wrapper over the toolkit registry (P1-02)
// ═══════════════════════════════════════════════════════════════════════════
// The per-tool dispatch logic that used to live in a big switch here now lives in
// server/kemma/toolkit/builtin/*.ts, one ToolSpec per tool, registered once at import time.
// The engine calls toolsFor()/runTool() directly and no longer calls this function; it stays
// only so any other caller of the old (userId, toolName, args) -> ToolResult shape keeps working,
// with no dispatch logic duplicated between here and the toolkit.

export interface SuccessResult<T = unknown> {
  success: true;
  data: T;
}
export interface ErrorResult {
  success: false;
  error: string;
  code: string;
}
export type ToolResult<T = unknown> = SuccessResult<T> | ErrorResult;

/**
 * This compatibility shim has no run (session, tier, cancellation) to inherit, since the old
 * (userId, toolName, args) signature never carried one. "max" and a fresh run id are reasonable,
 * harmless defaults for a wrapper nothing in this codebase calls at runtime any more (every real
 * call site now goes through toolsFor()/runTool() with the run's own context).
 */
function legacyContext(userId: number): ToolContext {
  return {
    userId,
    runId: `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tier: "max",
    signal: new AbortController().signal,
    emit: () => {},
  };
}

export async function executeToolCall(userId: number, toolName: string, args: unknown): Promise<ToolResult> {
  const outcome = await runTool(toolName, args, legacyContext(userId));
  if (!outcome.ok) return { success: false, error: outcome.error, code: outcome.code };
  // Builtin tools resolve with the legacy { success, data } / { success, error, code } shape
  // already, so unwrapping outcome.data here reproduces the exact old return value. An MCP tool
  // or a future tool that resolves with something else is wrapped as a successful result instead
  // of silently reshaping it.
  const data = outcome.data;
  if (data && typeof data === "object" && "success" in data) return data as ToolResult;
  return { success: true, data };
}


// ═══════════════════════════════════════════════════════════════════════════
// 4. PERSONAL-USE BUDGET — no other tenant to rate-limit against
// ═══════════════════════════════════════════════════════════════════════════
// Drop-in replacement for the tiered MAX_TOOL_CALLS in engine.ts. Since this
// is single-user, there's no reason to cap at the old free-tier levels —
// raise the ceiling so the agent can actually do multi-round research
// instead of being cut off after 2-20 tool calls.

export const MAX_TOOL_CALLS = {
  free: 2, // kept for compatibility if you ever reintroduce tiers
  trial: 20,
  pro: 20,
  max: 100, // raised from 50 — deep research tasks can need many search/browse rounds
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// 5. DEEP-RESEARCH PROMPT ADDITION — append to buildKemmaSystemPrompt() output
// ═══════════════════════════════════════════════════════════════════════════
// This is the piece that actually produces Perplexity-Max-style depth: the
// tool-calling loop in engine.ts already supports arbitrary multi-round tool
// use (it keeps looping as long as the model keeps requesting tools, up to
// MAX_TOOL_CALLS/MAX_STEPS) — what's been missing is an instruction telling
// the model to actually use that room instead of answering after one search.

export const DEEP_RESEARCH_ADDITION = `
When researching a topic (not just answering a quick factual lookup), follow this pattern:
1. Start with a broad web_search to survey the landscape.
2. Browse the 2-4 most relevant/authoritative results in full using the browse tool — don't rely on search snippets alone, since they often miss key detail or context.
3. After reading, identify what's still unclear, contested, or missing. If something important is unresolved, run a follow-up web_search with more specific terms and browse further sources.
4. Cross-check any surprising, specific, or high-stakes claim (numbers, dates, prices, names) against a second independent source before stating it as fact.
5. Only synthesize your final answer once you've done this — don't stop after the first search result if the question deserves depth.
6. When asked for a report or deliverable (not just a chat answer), use generate_file to produce an actual formatted document rather than only replying in chat.
Citations and format for research answers:
- Put the direct answer first, then supporting detail.
- Every factual claim (numbers, dates, regulation names, prices, legal points) ends with an inline marker like [3]. Use the "id" field on each web_search result as the marker number. Never invent a number, and never cite an id you did not see in a tool result.
- Prefer primary sources (government, regulator, statute text, official statistics, the operator itself) over news or vendor pages. When you rely on a secondary source, say so.
- State the date of each time-sensitive figure or rule. Flag anything older than six months, or possibly amended or revoked.
- When sources disagree, say so and say which one is more authoritative and why. Do not smooth over conflicts.
- Do not write a Sources list yourself; the system appends the numbered list. Do not use emoji, and do not use em or en dashes as punctuation.
Use your full tool-call budget when the task warrants it — a shallow one-search answer to a substantive research question is a failure mode, not efficiency.
`.trim();
