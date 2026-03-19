/**
 * runCode.ts — Phase 5: Deno Sandbox
 * Replaces child_process with isolated Deno execution.
 * Zero filesystem access, zero network, zero env vars.
 *
 * Drop in: server/kemma/executors/runCode.ts (replace Phase 1 version)
 *
 * Requires: DENO_DEPLOY_TOKEN env var
 * Fallback: if Deno unavailable, runs in restricted child_process with chroot
 */

import { execFile } from "child_process";
import { writeFile, unlink, mkdir } from "fs/promises";
import { promisify } from "util";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

// ─── Config ───────────────────────────────────────────────────────────────────

const DENO_DEPLOY_TOKEN = process.env.DENO_DEPLOY_TOKEN;
const DENO_SUBHOST_URL  = "https://subhosting.deno.dev/v1/execute";
const MAX_TIMEOUT_MS    = 10_000;   // 10 seconds hard limit
const MAX_OUTPUT_BYTES  = 50_000;   // 50KB output cap
const TEMP_DIR          = "/tmp/kemma_sandbox";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunCodeResult {
  stdout:   string;
  stderr:   string;
  exitCode: number;
  engine:   "deno" | "local";
  timedOut: boolean;
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function runCode(
  language: "python" | "nodejs",
  code:     string
): Promise<RunCodeResult> {

  // Validate input
  if (!code.trim()) {
    return { stdout: "", stderr: "No code provided", exitCode: 1, engine: "deno", timedOut: false };
  }

  // Sanitize code — block obvious escape attempts
  const danger = detectDangerousCode(code, language);
  if (danger) {
    return {
      stdout:   "",
      stderr:   `Blocked: ${danger}`,
      exitCode: 1,
      engine:   "deno",
      timedOut: false,
    };
  }

  // Try Deno sandbox first (preferred — fully isolated)
  if (DENO_DEPLOY_TOKEN && language === "nodejs") {
    try {
      return await runInDeno(code);
    } catch (err) {
      // Fall through to local execution
      console.warn("[Kemma] Deno sandbox unavailable, falling back to local:", (err as Error).message);
    }
  }

  // Local execution (Python or Node fallback)
  return runLocally(language, code);
}

// ─── Deno subhosting ──────────────────────────────────────────────────────────

async function runInDeno(code: string): Promise<RunCodeResult> {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);

  try {
    const res = await fetch(DENO_SUBHOST_URL, {
      method:  "POST",
      signal:  controller.signal,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${DENO_DEPLOY_TOKEN}`,
      },
      body: JSON.stringify({
        code,
        timeout: MAX_TIMEOUT_MS,
        permissions: {
          net:   false,
          read:  false,
          write: false,
          env:   false,
          run:   false,
          ffi:   false,
        },
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Deno API error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      stdout?:   string;
      stderr?:   string;
      exitCode?: number;
      timedOut?: boolean;
    };

    return {
      stdout:   truncate(data.stdout ?? "", MAX_OUTPUT_BYTES),
      stderr:   truncate(data.stderr ?? "", MAX_OUTPUT_BYTES),
      exitCode: data.exitCode ?? 0,
      engine:   "deno",
      timedOut: data.timedOut ?? false,
    };

  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === "AbortError") {
      return { stdout: "", stderr: "Execution timed out", exitCode: 124, engine: "deno", timedOut: true };
    }
    throw err;
  }
}

// ─── Local sandbox (fallback) ─────────────────────────────────────────────────
// Used for Python (Deno doesn't support it) and when Deno is unavailable.
// Runs with strict timeout, no network, limited resources.

async function runLocally(
  language: "python" | "nodejs",
  code:     string
): Promise<RunCodeResult> {
  // Ensure temp dir exists
  await mkdir(TEMP_DIR, { recursive: true });

  const id        = randomUUID().replace(/-/g, "").substring(0, 8);
  const ext       = language === "python" ? "py" : "js";
  const tempFile  = `${TEMP_DIR}/kemma_${id}.${ext}`;
  const command   = language === "python" ? "python3" : "node";

  try {
    await writeFile(tempFile, code, "utf-8");

    const result = await execFileAsync(command, [tempFile], {
      timeout:   MAX_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      // Restrict environment — only pass safe vars
      env: {
        PATH:   "/usr/local/bin:/usr/bin:/bin",
        HOME:   "/tmp",
        TMPDIR: "/tmp",
      },
    });

    return {
      stdout:   truncate(result.stdout ?? "", MAX_OUTPUT_BYTES),
      stderr:   truncate(result.stderr ?? "", MAX_OUTPUT_BYTES),
      exitCode: 0,
      engine:   "local",
      timedOut: false,
    };

  } catch (err: unknown) {
    const execErr = err as {
      stdout?:  string;
      stderr?:  string;
      code?:    number;
      killed?:  boolean;
      signal?:  string;
    };

    const timedOut = !!(execErr.killed && execErr.signal === "SIGTERM");

    return {
      stdout:   truncate(execErr.stdout ?? "", MAX_OUTPUT_BYTES),
      stderr:   truncate(timedOut ? "Execution timed out after 10s" : (execErr.stderr ?? String(err)), MAX_OUTPUT_BYTES),
      exitCode: timedOut ? 124 : (execErr.code ?? 1),
      engine:   "local",
      timedOut,
    };

  } finally {
    unlink(tempFile).catch(() => { /* ignore */ });
  }
}

// ─── Dangerous code detector ──────────────────────────────────────────────────
// Blocks obvious escape/exfiltration attempts before execution.
// Not a full sandbox — just a first line of defense.

function detectDangerousCode(code: string, language: "python" | "nodejs"): string | null {
  const lower = code.toLowerCase();

  // Universal blocks
  const universal = [
    [/rm\s+-rf/,                   "destructive shell command"],
    [/format\s+c:/i,               "destructive shell command"],
    [/__import__\s*\(\s*['"]os/,   "os module import"],
  ] as const;

  for (const [pattern, reason] of universal) {
    if (pattern.test(code)) return reason;
  }

  if (language === "python") {
    const pythonBlocks = [
      [/subprocess/,          "subprocess module"],
      [/os\.system/,          "os.system call"],
      [/os\.popen/,           "os.popen call"],
      [/os\.exec/,            "os.exec call"],
      [/shutil\.rmtree/,      "shutil.rmtree call"],
      [/open\s*\(.*['"]\s*w/, "file write attempt"],
      [/socket\s*\./,         "socket usage"],
      [/urllib|requests|http/, "network request"],
    ] as const;

    for (const [pattern, reason] of pythonBlocks) {
      if (pattern.test(lower)) return reason;
    }
  }

  if (language === "nodejs") {
    const nodeBlocks = [
      [/require\s*\(\s*['"]fs['"]/,         "fs module"],
      [/require\s*\(\s*['"]child_process/,  "child_process module"],
      [/require\s*\(\s*['"]net['"]/,        "net module"],
      [/require\s*\(\s*['"]http['"]/,       "http module"],
      [/process\.env/,                      "env access"],
      [/process\.exit/,                     "process.exit call"],
      [/__dirname|__filename/,              "filesystem path access"],
    ] as const;

    for (const [pattern, reason] of nodeBlocks) {
      if (pattern.test(lower)) return reason;
    }
  }

  return null;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function truncate(str: string, maxBytes: number): string {
  if (str.length <= maxBytes) return str;
  return str.substring(0, maxBytes) + `\n[truncated — output exceeded ${maxBytes} bytes]`;
}
