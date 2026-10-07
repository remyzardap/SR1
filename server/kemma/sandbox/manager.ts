/**
 * Persistent Sandbox Manager for Kemma.
 *
 * Manages sandbox lifecycle, persistence across turns in a session via kv_cache,
 * idle timeouts, per-user caps, and code execution.
 *
 * @module kemma/sandbox/manager
 * @see docs/spec/PHASE-2.md "P2-11 Persistent sandbox and file outputs"
 */

import { Sandbox, type SandboxOpts, type RunCodeLanguage } from "@e2b/code-interpreter";
import { kvGet, kvSet } from "../../core/kvCache";
import { getDb } from "../../db";
import { usageLogs } from "../../../drizzle/schema";
import type { EngineEvent } from "../events";
import {
  collectOutputs,
  processRichResults,
  uploadSessionFiles,
  type OutputFile,
} from "./files";

export const KV_NAMESPACE = "sbx";
export const MAX_SANDBOXES_PER_USER = 3;
export const CODE_TIMEOUT_MS = 30_000;
export const CODE_MAX_OUTPUT_BYTES = 50_000;

export function e2bApiKey(): string | undefined {
  return process.env.E2B_API_KEY;
}

export function sandboxTemplate(): string | undefined {
  return process.env.E2B_SANDBOX_TEMPLATE || undefined;
}

export function sandboxIdleMin(): number {
  const val = parseInt(process.env.SANDBOX_IDLE_MIN || "15", 10);
  return Number.isFinite(val) && val > 0 ? val : 15;
}

export function sandboxCostPerMin(): number {
  const val = parseFloat(process.env.SANDBOX_COST_PER_MIN || "0.03");
  return Number.isFinite(val) && val >= 0 ? val : 0.03;
}

export interface CachedSandboxInfo {
  sandboxId: string;
  userId: number;
  sessionId: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface RunCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  engine: "e2b";
  timedOut: boolean;
  files?: OutputFile[];
  images?: Array<{ url: string; mime: string; size: number }>;
}

export interface ExecuteInSandboxOptions {
  userId: number;
  sessionId: string;
  language: string;
  code: string;
  signal?: AbortSignal;
  emit?: (event: EngineEvent) => void;
  timeoutMs?: number;
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

/**
 * Log sandbox execution seconds to usage_logs.
 */
export async function logSandboxUsage(
  userId: number,
  sessionId: string | undefined,
  seconds: number
): Promise<void> {
  const costPerMin = sandboxCostPerMin();
  const costUsd = (seconds / 60) * costPerMin;
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(usageLogs).values({
      userId,
      sessionId: sessionId ?? null,
      provider: "e2b",
      model: "sandbox",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: seconds,
      cachedInputTokens: 0,
      estimatedCostUsd: String(Math.max(0, costUsd)),
      purpose: "sandbox",
    });
  } catch (err) {
    console.warn("[sandbox/manager] failed to log sandbox usage:", (err as Error).message);
  }
}

/**
 * Kills a sandbox by its id.
 */
export async function killSandbox(sandboxId: string): Promise<void> {
  try {
    if (typeof (Sandbox as any).kill === "function") {
      await (Sandbox as any).kill(sandboxId);
      return;
    }
    const apiKey = e2bApiKey();
    if (apiKey && typeof (Sandbox as any).connect === "function") {
      const sbx = await (Sandbox as any).connect(sandboxId, { apiKey });
      if (sbx && typeof sbx.kill === "function") {
        await sbx.kill();
      }
    }
  } catch (err) {
    // Best-effort cleanup
    console.warn(`[sandbox/manager] failed to kill sandbox ${sandboxId}:`, (err as Error).message);
  }
}

/**
 * Kills the active sandbox for a session and removes its cache entry.
 */
export async function killSessionSandbox(userId: number, sessionId: string): Promise<void> {
  const sessionKey = `${userId}:${sessionId}`;
  const cached = await kvGet<CachedSandboxInfo | string>(KV_NAMESPACE, sessionKey);
  const sandboxId = typeof cached === "string" ? cached : cached?.sandboxId;
  if (sandboxId) {
    await killSandbox(sandboxId);
  }

  // Remove from session kv_cache
  await kvSet(KV_NAMESPACE, sessionKey, null, 0).catch(() => {});

  // Remove from user active list
  const userListKey = `user:${userId}`;
  const list = (await kvGet<CachedSandboxInfo[]>(KV_NAMESPACE, userListKey)) || [];
  const updatedList = list.filter((item) => item.sessionId !== sessionId && item.sandboxId !== sandboxId);
  const ttlSec = sandboxIdleMin() * 60;
  await kvSet(KV_NAMESPACE, userListKey, updatedList, ttlSec).catch(() => {});
}

/**
 * Reconnects to the sandbox for the given user and session, or creates a new one.
 * - Enforces at most 1 sandbox per session.
 * - Enforces at most 3 sandboxes per user (oldest is killed).
 * - Extends idle timeout up to SANDBOX_IDLE_MIN on each access.
 */
export async function getSandbox(userId: number, sessionId: string): Promise<Sandbox> {
  const apiKey = e2bApiKey();
  if (!apiKey) {
    throw new Error("E2B_API_KEY is not configured. Code execution is unavailable until it is set.");
  }

  const idleMinutes = sandboxIdleMin();
  const idleMs = idleMinutes * 60 * 1000;
  const ttlSec = idleMinutes * 60;
  const sessionKey = `${userId}:${sessionId}`;
  const userListKey = `user:${userId}`;

  // 1. Check if sandbox exists for this session in kv_cache
  const cached = await kvGet<CachedSandboxInfo | string>(KV_NAMESPACE, sessionKey);
  const cachedSandboxId = typeof cached === "string" ? cached : cached?.sandboxId;

  if (cachedSandboxId) {
    try {
      let sbx: Sandbox | undefined;
      if (typeof (Sandbox as any).connect === "function") {
        sbx = await (Sandbox as any).connect(cachedSandboxId, { apiKey });
      }
      if (sbx) {
        // Extend timeout on each use
        if (typeof sbx.setTimeout === "function") {
          await sbx.setTimeout(idleMs).catch(() => {});
        }

        // Update lastUsedAt in kv_cache
        const now = Date.now();
        const info: CachedSandboxInfo = {
          sandboxId: cachedSandboxId,
          userId,
          sessionId,
          createdAt: typeof cached === "object" && cached?.createdAt ? cached.createdAt : now,
          lastUsedAt: now,
        };
        await kvSet(KV_NAMESPACE, sessionKey, info, ttlSec);

        // Update in user list
        const userList = (await kvGet<CachedSandboxInfo[]>(KV_NAMESPACE, userListKey)) || [];
        const updatedList = userList.map((item) => (item.sandboxId === cachedSandboxId ? info : item));
        await kvSet(KV_NAMESPACE, userListKey, updatedList, ttlSec);

        return sbx;
      }
    } catch (err) {
      console.warn(`[sandbox/manager] reconnect to ${cachedSandboxId} failed, will create new:`, (err as Error).message);
      // Clean up stale entry
      await kvSet(KV_NAMESPACE, sessionKey, null, 0).catch(() => {});
    }
  }

  // 2. Need to create a new sandbox. Enforce per-user limit of 3 sandboxes.
  const userList = (await kvGet<CachedSandboxInfo[]>(KV_NAMESPACE, userListKey)) || [];
  // Clean up any stale entry for current session
  let activeList = userList.filter((item) => item.sessionId !== sessionId && item.sandboxId !== cachedSandboxId);

  while (activeList.length >= MAX_SANDBOXES_PER_USER) {
    // Sort oldest first (by createdAt or lastUsedAt)
    activeList.sort((a, b) => a.createdAt - b.createdAt);
    const oldest = activeList.shift();
    if (oldest) {
      await killSandbox(oldest.sandboxId);
      await kvSet(KV_NAMESPACE, `${userId}:${oldest.sessionId}`, null, 0).catch(() => {});
    }
  }

  // 3. Create a new sandbox
  const sandboxOpts: SandboxOpts = {
    apiKey,
    timeoutMs: idleMs,
  };
  const template = sandboxTemplate();
  if (template) {
    sandboxOpts.template = template;
  }

  let sbx: Sandbox;
  if (typeof (Sandbox as any).create === "function") {
    // Pass template if configured
    sbx = template
      ? await (Sandbox as any).create(template, sandboxOpts)
      : await (Sandbox as any).create(sandboxOpts);
  } else {
    throw new Error("Sandbox.create is not available on @e2b/code-interpreter");
  }

  // Extend timeout
  if (typeof sbx.setTimeout === "function") {
    await sbx.setTimeout(idleMs).catch(() => {});
  }

  const now = Date.now();
  const sandboxInfo: CachedSandboxInfo = {
    sandboxId: sbx.sandboxId,
    userId,
    sessionId,
    createdAt: now,
    lastUsedAt: now,
  };

  // Record in kv_cache
  await kvSet(KV_NAMESPACE, sessionKey, sandboxInfo, ttlSec);
  activeList.push(sandboxInfo);
  await kvSet(KV_NAMESPACE, userListKey, activeList, ttlSec);

  return sbx;
}

/**
 * Maps input language strings to supported RunCodeLanguage.
 */
export function resolveLanguage(lang: string): RunCodeLanguage {
  const normalized = lang.trim().toLowerCase();
  if (normalized === "python" || normalized === "py") return "python";
  if (normalized === "javascript" || normalized === "js" || normalized === "nodejs") return "javascript";
  if (normalized === "bash" || normalized === "sh") return "bash";
  if (normalized === "r") return "r";
  return "python";
}

/**
 * Executes code inside the persistent session sandbox:
 * - Reconnects or creates sandbox
 * - Uploads session files on first turn in session
 * - Runs code with timeout and abort handling
 * - Collects outputs from /home/user/output/
 * - Processes rich results (charts to images, tables to markdown)
 * - Logs sandbox usage
 */
export async function executeInSandbox(options: ExecuteInSandboxOptions): Promise<RunCodeResult> {
  const { userId, sessionId, language, code, signal, emit, timeoutMs } = options;

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

  const apiKey = e2bApiKey();
  if (!apiKey) {
    return {
      stdout: "",
      stderr: "E2B_API_KEY is not configured. Code execution is unavailable until it is set.",
      exitCode: 1,
      engine: "e2b",
      timedOut: false,
    };
  }

  let sbx: Sandbox;
  try {
    sbx = await getSandbox(userId, sessionId);
  } catch (err) {
    return {
      stdout: "",
      stderr: `Sandbox initialization error: ${(err as Error).message}`,
      exitCode: 1,
      engine: "e2b",
      timedOut: false,
    };
  }

  if (signal?.aborted) {
    await killSessionSandbox(userId, sessionId).catch(() => {});
    return { stdout: "", stderr: "Execution was aborted", exitCode: 130, engine: "e2b", timedOut: false };
  }

  // 1. Upload session files on first use in this session
  if (sbx.files) {
    const uploadedKey = `uploaded:${sessionId}`;
    const alreadyUploaded = await kvGet<{ uploaded: boolean }>(KV_NAMESPACE, uploadedKey);
    if (!alreadyUploaded?.uploaded) {
      try {
        await uploadSessionFiles(sbx.files, userId, sessionId);
        const ttlSec = sandboxIdleMin() * 60;
        await kvSet(KV_NAMESPACE, uploadedKey, { uploaded: true, at: Date.now() }, ttlSec);
      } catch (err) {
        console.warn("[sandbox/manager] error uploading session files:", (err as Error).message);
      }
    }
  }

  // 2. Snapshot existing files in /home/user/output before execution
  const knownFiles = new Map<string, { size: number; mtime?: number }>();
  if (sbx.files) {
    try {
      const beforeList = await sbx.files.list("/home/user/output");
      if (Array.isArray(beforeList)) {
        for (const f of beforeList) {
          const mtime = f.modifiedTime instanceof Date ? f.modifiedTime.getTime() : Number(f.modifiedTime || 0);
          knownFiles.set(f.name, { size: f.size, mtime });
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Set up abort handler to kill running execution
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    try {
      sbx.kill().catch(() => {});
    } catch {}
    killSessionSandbox(userId, sessionId).catch(() => {});
  };

  if (signal) {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  const startTime = Date.now();
  const runLang = resolveLanguage(language);
  const executionTimeout = timeoutMs ?? CODE_TIMEOUT_MS;

  try {
    const execution = await sbx.runCode(code, {
      language: runLang,
      timeoutMs: executionTimeout,
    });

    const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    await logSandboxUsage(userId, sessionId, elapsedSec);

    if (signal?.aborted || aborted) {
      return { stdout: "", stderr: "Execution was aborted", exitCode: 130, engine: "e2b", timedOut: false };
    }

    // 4. Collect outputs from /home/user/output/
    let outputFiles: OutputFile[] = [];
    if (sbx.files) {
      outputFiles = await collectOutputs(sbx.files, {
        userId,
        sessionId,
        emit,
        knownFiles,
      });
    }

    // 5. Process rich results (PNG charts, HTML tables)
    const rich = await processRichResults(execution.results, {
      userId,
      sessionId,
      emit,
    });

    // Merge files from output directory and rich results
    const allFiles = [...outputFiles, ...rich.files];

    let stdout = truncateBytes((execution.logs?.stdout ?? []).join("\n"), CODE_MAX_OUTPUT_BYTES);
    let stderr = truncateBytes((execution.logs?.stderr ?? []).join("\n"), CODE_MAX_OUTPUT_BYTES);
    const errored = !!execution.error;

    if (errored && execution.error?.value) {
      stderr = `${stderr}\n${execution.error.value}`.trim();
    }

    // Append rich markdown outputs (HTML tables converted to markdown)
    if (rich.markdownOutputs.length > 0) {
      const richMarkdown = rich.markdownOutputs.join("\n\n");
      stdout = stdout ? `${stdout}\n\n${richMarkdown}` : richMarkdown;
    }

    return {
      stdout,
      stderr,
      exitCode: errored ? 1 : 0,
      engine: "e2b",
      timedOut: false,
      files: allFiles,
      images: rich.images,
    };
  } catch (err) {
    if (signal?.aborted || aborted) {
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
  }
}
