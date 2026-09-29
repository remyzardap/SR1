/**
 * Research eval harness (Stage H4).
 *
 * Usage:
 *   npm run eval:research -- [--limit N] [--ids solar-01,pln-02] [--set-baseline]
 *
 * Env: EVAL_USER_ID (default 199), EVAL_DB_HOST (rewrites the DATABASE_URL host when running
 * on the VPS host outside docker), EVAL_JUDGE_MODEL (default KEMMA_MODEL_VERIFY),
 * EVAL_QUESTION_TIMEOUT_MS (default 900000).
 *
 * Each question runs through Kemma Deep Research, then a separate Gemini judge call scores it.
 * Results: evals/results/<date>.json and <date>.md. The first run also becomes baseline.json.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, "..", "results");

interface Question {
  id: string;
  domain: string;
  time_sensitive: boolean;
  question: string;
  must_cover: string[];
  primary_sources: string[];
}

interface JudgeScores {
  citation_support: number;
  claim_coverage: number;
  recency: number;
  contradictions: number;
  formatting: number;
  covered: string[];
  missing: string[];
  notes: string;
}

interface QuestionResult {
  id: string;
  domain: string;
  ok: boolean;
  error?: string;
  durationSec: number;
  writerModels: string[];
  judgeModel: string;
  sourceCount: number;
  urlsChecked: number;
  urlOkPct: number;
  primarySourcePct: number;
  danglingCitations: number;
  emojiCount: number;
  dashCount: number;
  scores: { citation_validity: number; claim_coverage: number; recency: number; contradictions: number; formatting: number; overall: number };
  judge?: JudgeScores;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

async function checkUrl(url: string): Promise<boolean> {
  const tryFetch = async (method: "HEAD" | "GET") => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const r = await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; SutaeruEval/1.0)" } });
      // 401/403/429 mean the host answered but blocks bots; count as reachable.
      return r.status < 400 || r.status === 401 || r.status === 403 || r.status === 429;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  };
  return (await tryFetch("HEAD")) || (await tryFetch("GET"));
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

async function judge(
  q: Question,
  answer: string,
  sources: Array<{ id: number; title: string; url: string; snippet?: string }>,
  urlOkPct: number,
  judgeModel: string,
): Promise<JudgeScores> {
  const { routeFor } = await import("../../server/core/kemmaRouter");
  const route = routeFor(judgeModel);
  if (!route.apiKey) throw new Error(`No API key for judge model ${judgeModel}`);
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are a strict research quality judge. Today is ${today}. Score the ANSWER to the QUESTION.

QUESTION: ${q.question}
TIME SENSITIVE: ${q.time_sensitive}
MUST COVER (topics a good answer addresses): ${JSON.stringify(q.must_cover)}
PREFERRED PRIMARY SOURCE DOMAINS: ${JSON.stringify(q.primary_sources)}
FRACTION OF CITED URLS THAT RESOLVE: ${(urlOkPct / 100).toFixed(2)}

SOURCES (as cited by the answer):
${sources.slice(0, 150).map((s) => `[${s.id}] ${s.title}${(s as any).date ? ` (${(s as any).date})` : ""} | ${s.url} | ${(s.snippet ?? "").slice(0, 120)}`).join("\n") || "(none)"}

ANSWER:
${answer.slice(0, 24000)}

Score each 1 to 5 (1 = poor, 5 = excellent). Be harsh; reserve 5 for near flawless.
- citation_support: do the factual claims carry numbered citations, and do the listed sources plausibly support them? Penalize uncited claims and sources that do not match the claim.
- claim_coverage: how many MUST COVER topics are answered accurately and specifically (not vaguely)?
- recency: for time sensitive questions, does the answer state dates, use current sources, and flag anything older than 6 months or possibly amended or revoked? For stable questions, judge whether it avoided stale claims.
- contradictions: does it surface where sources disagree and say which is more authoritative? If sources genuinely agree, 4 is fine when it says so.
- formatting: direct answer first, clear structure, numbered citations, sources list with dates, no hedging filler, no emoji, no dash punctuation.

Reply with ONLY JSON:
{"citation_support":n,"claim_coverage":n,"recency":n,"contradictions":n,"formatting":n,"covered":["..."],"missing":["..."],"notes":"two sentences max"}`;

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${route.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${route.apiKey}` },
        body: JSON.stringify({ model: route.model, temperature: 0, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(`judge HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content ?? "";
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("judge returned no JSON");
      const j = JSON.parse(m[0]) as Partial<JudgeScores>;
      return {
        citation_support: clamp(Number(j.citation_support), 1, 5),
        claim_coverage: clamp(Number(j.claim_coverage), 1, 5),
        recency: clamp(Number(j.recency), 1, 5),
        contradictions: clamp(Number(j.contradictions), 1, 5),
        formatting: clamp(Number(j.formatting), 1, 5),
        covered: Array.isArray(j.covered) ? j.covered.map(String) : [],
        missing: Array.isArray(j.missing) ? j.missing.map(String) : [],
        notes: String(j.notes ?? ""),
      };
    } catch (e) {
      lastErr = (e as Error).message;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`judge failed: ${lastErr}`);
}

async function main() {
  if (process.env.EVAL_DB_HOST && process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    u.hostname = process.env.EVAL_DB_HOST;
    process.env.DATABASE_URL = u.toString();
  }

  const all: Question[] = JSON.parse(readFileSync(join(HERE, "questions.json"), "utf8"));
  const ids = arg("ids")?.split(",").map((s) => s.trim());
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  let questions = ids ? all.filter((q) => ids.includes(q.id)) : all;
  if (limit) questions = questions.slice(0, limit);

  const userId = Number(process.env.EVAL_USER_ID || 199);
  const timeoutMs = Number(process.env.EVAL_QUESTION_TIMEOUT_MS || 900_000);
  const { kemmaExecute } = await import("../../server/kemma/engine");
  const { verifyRoute } = await import("../../server/core/kemmaRouter");
  const judgeModel = process.env.EVAL_JUDGE_MODEL || verifyRoute().model;

  mkdirSync(RESULTS_DIR, { recursive: true });
  const results: QuestionResult[] = [];

  for (const q of questions) {
    const started = Date.now();
    process.stdout.write(`[${q.id}] running... `);
    try {
      const out = await Promise.race([
        kemmaExecute({
          userId,
          tier: "max",
          isThinking: true,
          messages: [{ role: "user", content: q.question }],
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
      ]);

      const answer = out.response ?? "";
      if (!answer.trim() || out.stepsUsed === 0) {
        throw new Error(`engine returned no answer: ${answer.slice(0, 1200)}`);
      }

      const urlSet = new Set<string>(out.sources.map((s) => s.url).filter(Boolean));
      for (const m of answer.matchAll(/https?:\/\/[^\s)\]>"']+/g)) urlSet.add(m[0].replace(/[.,;]+$/, ""));
      const urls = [...urlSet].slice(0, 40);
      const checks = await Promise.all(urls.map(checkUrl));
      const urlOkPct = urls.length ? (checks.filter(Boolean).length / urls.length) * 100 : 0;

      const primary = q.primary_sources;
      const hosts = out.sources.map((s) => hostOf(s.url)).filter(Boolean);
      const primaryPct = primary.length && hosts.length
        ? (hosts.filter((h) => primary.some((p) => h === p || h.endsWith(`.${p}`))).length / hosts.length) * 100
        : 0;

      const markers = [...answer.matchAll(/\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g)].flatMap((m) => m[1].split(/[,;]/).map((d) => Number(d.trim())));
      const dangling = markers.filter((n) => n < 1 || n > out.sources.length).length;
      const emojiCount = (answer.match(/\p{Extended_Pictographic}/gu) ?? []).length;
      const dashCount = (answer.match(/[–—]/g) ?? []).length;

      const j = await judge(q, answer, out.sources, urlOkPct, judgeModel);

      const progFormatting = clamp(100 - 10 * Math.min(emojiCount + dashCount, 5) - 10 * Math.min(dangling, 3) - (markers.length === 0 ? 30 : 0), 0, 100);
      const scores = {
        citation_validity: Math.round(0.5 * urlOkPct + 0.5 * j.citation_support * 20),
        claim_coverage: Math.round(j.claim_coverage * 20),
        recency: Math.round(j.recency * 20),
        contradictions: Math.round(j.contradictions * 20),
        formatting: Math.round(0.5 * j.formatting * 20 + 0.5 * progFormatting),
        overall: 0,
      };
      scores.overall = Math.round((scores.citation_validity + scores.claim_coverage + scores.recency + scores.contradictions + scores.formatting) / 5);

      results.push({
        id: q.id, domain: q.domain, ok: true,
        durationSec: Math.round((Date.now() - started) / 1000),
        writerModels: out.modelsUsed, judgeModel,
        sourceCount: out.sources.length, urlsChecked: urls.length,
        urlOkPct: Math.round(urlOkPct), primarySourcePct: Math.round(primaryPct),
        danglingCitations: dangling, emojiCount, dashCount, scores, judge: j,
      });
      console.log(`overall ${scores.overall} (${results[results.length - 1].durationSec}s, ${out.sources.length} sources)`);
    } catch (e) {
      const msg = (e as Error).message;
      results.push({
        id: q.id, domain: q.domain, ok: false, error: msg,
        durationSec: Math.round((Date.now() - started) / 1000),
        writerModels: [], judgeModel, sourceCount: 0, urlsChecked: 0, urlOkPct: 0, primarySourcePct: 0,
        danglingCitations: 0, emojiCount: 0, dashCount: 0,
        scores: { citation_validity: 0, claim_coverage: 0, recency: 0, contradictions: 0, formatting: 0, overall: 0 },
      });
      console.log(`FAILED: ${msg}`);
    }
  }

  const okResults = results.filter((r) => r.ok);
  const avg = (f: (r: QuestionResult) => number) => okResults.length ? Math.round(okResults.reduce((s, r) => s + f(r), 0) / okResults.length) : 0;
  const summary = {
    date: new Date().toISOString().slice(0, 10),
    questions: results.length,
    succeeded: okResults.length,
    failed: results.length - okResults.length,
    avg: {
      overall: avg((r) => r.scores.overall),
      citation_validity: avg((r) => r.scores.citation_validity),
      claim_coverage: avg((r) => r.scores.claim_coverage),
      recency: avg((r) => r.scores.recency),
      contradictions: avg((r) => r.scores.contradictions),
      formatting: avg((r) => r.scores.formatting),
      urlOkPct: avg((r) => r.urlOkPct),
      primarySourcePct: avg((r) => r.primarySourcePct),
    },
    writerModels: [...new Set(results.flatMap((r) => r.writerModels))],
    judgeModel,
  };

  const stamp = summary.date;
  const jsonPath = join(RESULTS_DIR, `${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 2));

  const sameFamily = summary.writerModels.some((m) => m === judgeModel);
  const md: string[] = [];
  md.push(`# Research eval scorecard ${stamp}`, "");
  md.push(`Questions run: ${summary.questions}. Succeeded: ${summary.succeeded}. Failed: ${summary.failed}.`);
  md.push(`Writer models used: ${summary.writerModels.join(", ") || "none"}. Judge model: ${judgeModel}.`);
  if (sameFamily) md.push("", "> Warning: the judge model also acted as a writer in this run, so scores may be biased upward.");
  md.push("", "## Averages (0 to 100, successful runs only)", "");
  md.push("| Overall | Citation validity | Claim coverage | Recency | Contradictions | Formatting | URLs resolving | Primary sources |");
  md.push("|---|---|---|---|---|---|---|---|");
  const a = summary.avg;
  md.push(`| ${a.overall} | ${a.citation_validity} | ${a.claim_coverage} | ${a.recency} | ${a.contradictions} | ${a.formatting} | ${a.urlOkPct}% | ${a.primarySourcePct}% |`);
  md.push("", "## Per question", "");
  md.push("| ID | Domain | Overall | Cite | Cover | Recent | Contra | Format | Sources | URL ok | Primary | Secs |");
  md.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    if (!r.ok) { md.push(`| ${r.id} | ${r.domain} | FAILED | | | | | | | | | ${r.durationSec} |`); continue; }
    const s = r.scores;
    md.push(`| ${r.id} | ${r.domain} | ${s.overall} | ${s.citation_validity} | ${s.claim_coverage} | ${s.recency} | ${s.contradictions} | ${s.formatting} | ${r.sourceCount} | ${r.urlOkPct}% | ${r.primarySourcePct}% | ${r.durationSec} |`);
  }
  md.push("", "## Judge notes", "");
  for (const r of results) {
    if (r.ok && r.judge) md.push(`- **${r.id}**: ${r.judge.notes}${r.judge.missing.length ? ` Missing: ${r.judge.missing.join("; ")}.` : ""}`);
    if (!r.ok) md.push(`- **${r.id}**: failed with ${r.error}`);
  }
  md.push("", "## How scores are built", "",
    "Citation validity is half the share of cited URLs that resolve and half the judge's citation support score. Claim coverage, recency and contradictions come from the judge. Formatting is half the judge and half programmatic checks (emoji, dash punctuation, dangling or missing citation markers).");
  writeFileSync(join(RESULTS_DIR, `${stamp}.md`), md.join("\n") + "\n");

  const baselinePath = join(RESULTS_DIR, "baseline.json");
  let exitCode = 0;
  if (flag("set-baseline") || (!existsSync(baselinePath) && summary.succeeded >= Math.ceil(summary.questions * 0.8) && summary.questions >= 10)) {
    writeFileSync(baselinePath, JSON.stringify(summary, null, 2));
    console.log(`Baseline written (${summary.avg.overall}).`);
  } else if (existsSync(baselinePath)) {
    const base = JSON.parse(readFileSync(baselinePath, "utf8")) as { avg: { overall: number } };
    const delta = summary.avg.overall - base.avg.overall;
    console.log(`Overall ${summary.avg.overall} vs baseline ${base.avg.overall} (${delta >= 0 ? "+" : ""}${delta}).`);
    if (summary.questions >= 10 && delta < -3) { console.log("REGRESSION: average dropped more than 3 points."); exitCode = 1; }
  }
  console.log(`Scorecard: evals/results/${stamp}.md`);
  process.exit(exitCode);
}

main().catch((e) => { console.error(e); process.exit(2); });
