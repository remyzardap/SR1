/**
 * Chat bench (P1-01): latency, tool use, tokens and cost per prompt, run straight through
 * kemmaExecute (no HTTP), so work packages can show before and after numbers.
 *
 * Usage:
 *   npm run bench -- [--runs N] [--filter <terms>] [--user <id>] [--cache]
 *
 *   --runs N        runs per prompt (default 1). Tables show the median of the successful runs.
 *   --filter terms  comma-separated; keeps prompts whose id or category contains a term
 *                   (e.g. "multi-search", "chat-1,read").
 *   --user id       user the prompts run as (default EVAL_USER_ID). Put the same id in
 *                   KEMMA_UNLIMITED_USER_IDS so daily quotas don't cut the run short.
 *   --cache         keep the in-process web_search cache. By default the bench turns it off
 *                   (KEMMA_SEARCH_CACHE_TTL_SEC=0 for this process) so repeated runs measure real searches.
 *
 * Env: the app's .env (provider keys and DATABASE_URL), EVAL_USER_ID, and EVAL_DB_HOST, which
 * replaces the DATABASE_URL host when the bench runs on the VPS host outside docker.
 * Feature flags apply as in the app, e.g. `FF_PARALLEL_TOOLS=1 npm run bench -- --runs 3`.
 *
 * Per prompt and run: time to the first streamed token (TTFT), time to the first activity of any
 * kind (step start, tool start, notice or token), total time, tool calls, LLM calls (step starts),
 * input and output tokens and estimated cost from the usage_logs rows the run wrote (each run has
 * its own sessionId), and the answer length.
 *
 * Output: markdown tables on stdout, and JSON in evals/results/bench-<date>.json.
 * Exit code: 0 when every run answered, 1 when any run failed, 2 when the bench could not start.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPTS_FILE = join(HERE, "bench-prompts.json");
const RESULTS_DIR = join(HERE, "..", "evals", "results");
// A run that takes longer counts as failed. The engine can't be cancelled yet (P1-05), so it
// finishes in the background; its late usage rows are not counted.
const PROMPT_TIMEOUT_MS = 10 * 60_000;

interface BenchPrompt {
  id: string;
  category: string;
  prompt: string;
  isThinking?: boolean;
}

interface RunResult {
  run: number;
  sessionId: string;
  ok: boolean;
  error?: string;
  ttftMs: number | null;
  firstActivityMs: number | null;
  totalMs: number;
  toolCount: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  usageRows: number;
  answerChars: number;
  tools: Array<{ name: string; ms: number }>;
  models: string[];
}

const METRICS = [
  "ttftMs",
  "firstActivityMs",
  "totalMs",
  "toolCount",
  "llmCalls",
  "inputTokens",
  "outputTokens",
  "costUsd",
  "answerChars",
] as const;
type Metric = (typeof METRICS)[number];
type Medians = Record<Metric, number | null>;

class BenchSetupError extends Error {}
class BenchTimeoutError extends Error {}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function median(values: Array<number | null>): number | null {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function mediansOf(runs: RunResult[]): Medians {
  const ok = runs.filter((r) => r.ok);
  return Object.fromEntries(METRICS.map((m) => [m, median(ok.map((r) => r[m]))])) as Medians;
}

function loadPrompts(): BenchPrompt[] {
  const raw: unknown = JSON.parse(readFileSync(PROMPTS_FILE, "utf8"));
  if (!Array.isArray(raw)) throw new BenchSetupError(`${PROMPTS_FILE} must hold a JSON array of prompts.`);
  const seen = new Set<string>();
  return raw.map((p, i) => {
    const ok = p && typeof p.id === "string" && typeof p.category === "string" && typeof p.prompt === "string";
    if (!ok) throw new BenchSetupError(`Prompt #${i + 1} in bench-prompts.json needs string id, category and prompt.`);
    if (seen.has(p.id)) throw new BenchSetupError(`Duplicate prompt id "${p.id}" in bench-prompts.json.`);
    seen.add(p.id);
    return { id: p.id, category: p.category, prompt: p.prompt, isThinking: p.isThinking === true };
  });
}

function selectPrompts(all: BenchPrompt[], filter: string | undefined): BenchPrompt[] {
  if (!filter) return all;
  const terms = filter.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const picked = all.filter((p) => terms.some((t) => p.id.toLowerCase().includes(t) || p.category.toLowerCase().includes(t)));
  if (picked.length === 0) {
    throw new BenchSetupError(`--filter "${filter}" matches no prompt. Ids: ${all.map((p) => p.id).join(", ")}.`);
  }
  return picked;
}

function parseRuns(): number {
  const raw = arg("runs");
  if (raw === undefined) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new BenchSetupError(`--runs must be a whole number from 1 to 20 (got "${raw}").`);
  return n;
}

function parseUserId(): number {
  const raw = arg("user") ?? process.env.EVAL_USER_ID;
  if (!raw || !raw.trim()) {
    throw new BenchSetupError("No bench user: set EVAL_USER_ID in .env or pass --user <id>.");
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new BenchSetupError(`The bench user id must be a positive whole number (got "${raw}").`);
  return n;
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BenchTimeoutError(`timed out after ${Math.round(ms / 1000)} s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const fmtInt = (v: number | null) => (v === null ? "–" : Math.round(v).toLocaleString("en-US"));
const fmtCost = (v: number | null) => (v === null ? "–" : v.toFixed(4));

async function main() {
  // ─── Setup: everything that can be checked before spending money ──────────────
  const runs = parseRuns();
  const prompts = selectPrompts(loadPrompts(), arg("filter"));
  const userId = parseUserId();

  const problems: string[] = [];
  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL is not set: the bench reads usage_logs for tokens and cost.");
  }
  const { chatRoute, searchRoute, routeHasAuth } = await import("../server/core/kemmaRouter");
  const chat = chatRoute();
  const search = searchRoute();
  if (!routeHasAuth(chat)) {
    problems.push(`No credentials for the chat model ${chat.label} (KEMMA_MODEL_CHAT): set that provider's API key in .env.`);
  }
  if (!routeHasAuth(search)) {
    problems.push(`No credentials for the search model ${search.label} (KEMMA_MODEL_SEARCH): web_search would fail. Set that provider's API key in .env.`);
  }
  if (problems.length > 0) throw new BenchSetupError(problems.join("\n"));

  if (process.env.EVAL_DB_HOST && process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    u.hostname = process.env.EVAL_DB_HOST;
    process.env.DATABASE_URL = u.toString();
  }

  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("../server/db");
  const { users, usageLogs } = await import("../drizzle/schema");
  const db = await getDb();
  if (!db) throw new BenchSetupError("Could not open the database from DATABASE_URL.");
  try {
    const found = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (found.length === 0) throw new BenchSetupError(`User ${userId} does not exist in this database.`);
  } catch (err) {
    if (err instanceof BenchSetupError) throw err;
    throw new BenchSetupError(`Could not reach the database: ${(err as Error).message}`);
  }

  const unlimited = (process.env.KEMMA_UNLIMITED_USER_IDS ?? "").split(",").some((v) => Number(v.trim()) === userId);
  if (!unlimited) {
    console.warn(`Note: user ${userId} is not in KEMMA_UNLIMITED_USER_IDS; daily quotas may stop the run partway.`);
  }

  const searchCache = hasFlag("cache") ? "on" : "off";
  if (searchCache === "off") process.env.KEMMA_SEARCH_CACHE_TTL_SEC = "0";

  const { kemmaExecute } = await import("../server/kemma/engine");
  const { getQuotaSummary } = await import("../server/core/quotaCheck");
  const { FLAGS, flag } = await import("../server/core/flags");
  const flags = Object.fromEntries((Object.keys(FLAGS) as Array<keyof typeof FLAGS>).map((n) => [n, flag(n)]));
  const { tier } = await getQuotaSummary(userId);

  // ─── Runs: pass by pass, every prompt once per pass ───────────────────────────
  const startedAt = new Date();
  const results = new Map<string, RunResult[]>(prompts.map((p) => [p.id, []]));
  console.error(`Bench: ${prompts.length} prompts x ${runs} runs as user ${userId} (tier ${tier}), search cache ${searchCache}.`);

  for (let run = 1; run <= runs; run++) {
    for (const p of prompts) {
      const sessionId = randomUUID();
      const t0 = performance.now();
      const since = () => Math.round(performance.now() - t0);
      let ttftMs: number | null = null;
      let firstActivityMs: number | null = null;
      const activity = () => {
        if (firstActivityMs === null) firstActivityMs = since();
      };
      let toolCount = 0;
      let llmCalls = 0;
      const tools: RunResult["tools"] = [];

      let ok = false;
      let error: string | undefined;
      let answerChars = 0;
      let models: string[] = [];
      try {
        const out = await withTimeout(
          kemmaExecute({
            userId,
            messages: [{ role: "user", content: p.prompt }],
            tier,
            isThinking: p.isThinking === true,
            sessionId,
            onStream: (chunk) => {
              if (!chunk) return;
              if (ttftMs === null) ttftMs = since();
              activity();
            },
            onToolStart: () => {
              toolCount++;
              activity();
            },
            onToolEnd: (tool, _result, durationMs) => {
              tools.push({ name: tool, ms: durationMs });
            },
            onStepStart: () => {
              llmCalls++;
              activity();
            },
            onNotice: () => activity(),
          }),
          PROMPT_TIMEOUT_MS,
        );
        models = out.modelsUsed;
        ok = !out.isError && (out.response ?? "").trim().length > 0;
        answerChars = ok ? out.response.length : 0;
        // The engine's error text can carry a provider response body: keep it out of the results.
        if (!ok) error = out.isError ? "engine error (see the [kemma] log lines above)" : "empty answer";
      } catch (err) {
        const timedOut = err instanceof BenchTimeoutError;
        error = timedOut ? err.message : `exception: ${(err as Error).name}`;
        if (!timedOut) console.error(`[run ${run}/${runs}] ${p.id} threw:`, (err as Error).message);
      }
      const totalMs = since();

      // Cost and tokens: every usage_logs row this run wrote carries its sessionId.
      const rows = await db
        .select({ input: usageLogs.inputTokens, output: usageLogs.outputTokens, cost: usageLogs.estimatedCostUsd })
        .from(usageLogs)
        .where(eq(usageLogs.sessionId, sessionId));
      const result: RunResult = {
        run,
        sessionId,
        ok,
        ...(error ? { error } : {}),
        ttftMs,
        firstActivityMs,
        totalMs,
        toolCount,
        llmCalls,
        inputTokens: rows.reduce((s, r) => s + r.input, 0),
        outputTokens: rows.reduce((s, r) => s + r.output, 0),
        costUsd: rows.reduce((s, r) => s + Number(r.cost ?? 0), 0),
        usageRows: rows.length,
        answerChars,
        tools,
        models,
      };
      results.get(p.id)!.push(result);
      console.error(
        `[run ${run}/${runs}] ${p.id}: ${ok ? "ok" : `FAILED (${error})`} total ${fmtInt(totalMs)} ms, TTFT ${fmtInt(ttftMs)} ms, ${toolCount} tools, ${llmCalls} LLM calls`,
      );
    }
  }

  // ─── Summaries ────────────────────────────────────────────────────────────────
  const perPrompt = prompts.map((p) => {
    const rs = results.get(p.id)!;
    return { id: p.id, category: p.category, prompt: p.prompt, ok: rs.filter((r) => r.ok).length, runs: rs.length, median: mediansOf(rs), results: rs };
  });

  const categories = [...new Set(prompts.map((p) => p.category))].map((category) => {
    const rs = perPrompt.filter((p) => p.category === category).flatMap((p) => p.results);
    return { category, prompts: perPrompt.filter((p) => p.category === category).length, ok: rs.filter((r) => r.ok).length, runs: rs.length, median: mediansOf(rs) };
  });

  const toolCalls = perPrompt.flatMap((p) => p.results.filter((r) => r.ok).flatMap((r) => r.tools));
  const toolStats = [...new Set(toolCalls.map((t) => t.name))].sort().map((name) => {
    const ms = toolCalls.filter((t) => t.name === name).map((t) => t.ms);
    return { tool: name, calls: ms.length, medianMs: median(ms) };
  });

  const date = startedAt.toISOString().slice(0, 10);
  const onFlags = Object.entries(flags).filter(([, on]) => on).map(([n]) => n);
  const md: string[] = [];
  md.push(`### Chat bench ${date}: ${runs} run${runs === 1 ? "" : "s"} per prompt, medians of successful runs`);
  md.push("");
  md.push(
    `User ${userId} (tier ${tier}) · chat model ${chat.label} · search model ${search.label} · search cache ${searchCache} · flags on: ${onFlags.join(", ") || "none"}`,
  );
  md.push("");
  md.push("| Prompt | Category | OK | TTFT ms | First activity ms | Total ms | Tools | LLM calls | Input tok | Output tok | Cost USD | Answer chars |");
  md.push("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const p of perPrompt) {
    const m = p.median;
    md.push(
      `| ${p.id} | ${p.category} | ${p.ok}/${p.runs} | ${fmtInt(m.ttftMs)} | ${fmtInt(m.firstActivityMs)} | ${fmtInt(m.totalMs)} | ${fmtInt(m.toolCount)} | ${fmtInt(m.llmCalls)} | ${fmtInt(m.inputTokens)} | ${fmtInt(m.outputTokens)} | ${fmtCost(m.costUsd)} | ${fmtInt(m.answerChars)} |`,
    );
  }
  md.push("");
  md.push("| Category | Prompts | OK runs | TTFT ms | First activity ms | Total ms | Cost USD |");
  md.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const c of categories) {
    const m = c.median;
    md.push(`| ${c.category} | ${c.prompts} | ${c.ok}/${c.runs} | ${fmtInt(m.ttftMs)} | ${fmtInt(m.firstActivityMs)} | ${fmtInt(m.totalMs)} | ${fmtCost(m.costUsd)} |`);
  }
  if (toolStats.length > 0) {
    md.push("");
    md.push("| Tool | Calls | Median ms |");
    md.push("|---|---:|---:|");
    for (const t of toolStats) md.push(`| ${t.tool} | ${t.calls} | ${fmtInt(t.medianMs)} |`);
  }
  console.log(md.join("\n"));

  mkdirSync(RESULTS_DIR, { recursive: true });
  const jsonPath = join(RESULTS_DIR, `bench-${date}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        date,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        runsPerPrompt: runs,
        userId,
        tier,
        chatModel: chat.label,
        searchModel: search.label,
        searchCache,
        flags,
        prompts: perPrompt,
        categories,
        tools: toolStats,
      },
      null,
      2,
    ),
  );
  console.error(`Wrote ${jsonPath}`);

  const failed = perPrompt.reduce((n, p) => n + (p.runs - p.ok), 0);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  if (err instanceof BenchSetupError) {
    console.error(`Bench not started:\n${err.message}`);
  } else {
    console.error("Bench failed:", (err as Error).message);
  }
  process.exit(2);
});
