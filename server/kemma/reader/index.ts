/**
 * Tiered page reader (P1-09): `readPage(url, opts)` replaces sending every URL through the
 * browser-use cloud agent. Tier 1 is a plain, SSRF-guarded fetch plus local extraction
 * (Readability/Turndown for HTML, `unpdf` for PDF, pass-through for text/*). Tier 2 is a hosted
 * reader (Jina or Firecrawl) for pages tier 1 cannot get through cleanly. Tier 3 is the existing
 * browser-use agent, used only for `interactive: true` or when tiers 1 and 2 both failed.
 *
 * Results are cached in `kv_cache` (namespace "page", 24h) by canonical URL, except for
 * `interactive` reads, which are never cached.
 */

import { lookup } from "node:dns/promises";
import { getDb } from "../../db";
import { usageLogs } from "../../../drizzle/schema";
import { isPrivateAddress } from "../../lib/fnFetch";
import { kvGet, kvSet } from "../../core/kvCache";
import { extractHtml, htmlToMarkdown } from "./extract";
import { extractPdf } from "./pdf";
import { readWithJina, type Tier2Result } from "./jina";
import { readWithFirecrawl } from "./firecrawl";
import { selectForBudget } from "./select";
import type { browseWithAgent as BrowseWithAgentFn } from "../kemmaMax";

export const READER_CACHE_NAMESPACE = "page";
export const READER_CACHE_TTL_SEC = 24 * 60 * 60;
export const DEFAULT_MAX_CHARS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MIN_CONTENT_CHARS = 400;
const ESCALATE_STATUSES = new Set([403, 429, 503]);

export type ReaderTier = 1 | 2 | 3;

export interface ReadPageOptions {
  query?: string;
  maxChars?: number;
  interactive?: boolean;
  signal?: AbortSignal;
  /** For usage logging only; omit to skip writing a usage row. */
  userId?: number;
  sessionId?: string;
}

export interface ReadPageResult {
  url: string;
  finalUrl: string;
  title: string;
  markdown: string;
  tier: ReaderTier;
  truncated: boolean;
  publishedAt?: string;
}

/** The page content a tier produced, before query-focused selection and caching. */
interface RawPage {
  finalUrl: string;
  title: string;
  markdown: string;
  publishedAt?: string;
  tier: ReaderTier;
}

export class EscalateError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "EscalateError";
  }
}

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SsrfBlockedError";
  }
}

export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error) {
    return err.name === "AbortError" || /abort/i.test(err.name) || /aborted/i.test(err.message);
  }
  return false;
}

// ─── URL canonicalization (for the cache key) ────────────────────────────────────────────────
// A standalone copy for this reader, deliberately not shared with P1-08's search cache (that
// WP's branch is not merged yet): lowercase host, strip common tracking params, drop the
// fragment, and drop a trailing slash on the path.

const TRACKING_PARAM_RE = /^(utm_|mc_[ce]id$|ref$|gclid$|fbclid$|igshid$|si$|spm$|mkt_tok$)/i;

export function canonicalizeUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl.trim().toLowerCase();
  }
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  const kept = new URLSearchParams();
  for (const [key, value] of [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (TRACKING_PARAM_RE.test(key)) continue;
    kept.append(key, value);
  }
  parsed.search = kept.toString() ? `?${kept.toString()}` : "";
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}

// ─── SSRF-guarded tier-1 fetch ───────────────────────────────────────────────────────────────
// Same address rules as server/lib/fnFetch.ts (isPrivateAddress), re-applied on every redirect
// hop by hand — `fetch`'s own redirect following is never used.

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata", "metadata.google.internal"]);

export async function assertPublicPageUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfBlockedError("Not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError("Only http and https URLs can be read.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new SsrfBlockedError("That address cannot be read.");
  }
  if (/^\d+$/.test(host)) throw new SsrfBlockedError("That address cannot be read.");
  if (host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateAddress(host)) throw new SsrfBlockedError("That address cannot be read.");
    return url;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new SsrfBlockedError("That address cannot be resolved.");
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new SsrfBlockedError("That address cannot be read.");
  }
  return url;
}

interface Tier1Fetch {
  finalUrl: string;
  status: number;
  contentType: string;
  buffer: Buffer;
}

async function fetchTier1(rawUrl: string, signal?: AbortSignal): Promise<Tier1Fetch> {
  let url = await assertPublicPageUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (signal?.aborted) {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html,application/pdf,text/plain,*/*" },
      });
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) {
        const abortErr = new Error("The operation was aborted");
        abortErr.name = "AbortError";
        throw abortErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) throw new Error("Redirect with no location.");
      url = await assertPublicPageUrl(new URL(location, url).toString());
      continue;
    }

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (ESCALATE_STATUSES.has(res.status)) {
      await res.body?.cancel().catch(() => {});
      throw new EscalateError(`status ${res.status}`);
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`Fetch failed with status ${res.status}.`);
    }

    const buffer = await readCapped(res.body, MAX_PAGE_BYTES);
    return { finalUrl: url.toString(), status: res.status, contentType, buffer };
  }

  throw new Error("Too many redirects.");
}

async function readCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      chunks.push(value.slice(0, value.byteLength - (total - maxBytes)));
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

// ─── Tier 1: fetch + extract ──────────────────────────────────────────────────────────────────

async function readTier1(url: string, signal?: AbortSignal): Promise<RawPage> {
  const fetched = await fetchTier1(url, signal);
  const { contentType, finalUrl } = fetched;

  if (contentType === "application/pdf" || /\.pdf($|\?)/i.test(finalUrl)) {
    const { markdown } = await extractPdf(new Uint8Array(fetched.buffer));
    if (markdown.trim().length < MIN_CONTENT_CHARS) throw new EscalateError("short PDF extraction");
    return { finalUrl, title: "", markdown, tier: 1 };
  }

  if (contentType.startsWith("text/") && contentType !== "text/html") {
    const text = fetched.buffer.toString("utf-8");
    if (text.trim().length < MIN_CONTENT_CHARS) throw new EscalateError("short text content");
    return { finalUrl, title: "", markdown: text, tier: 1 };
  }

  // Treat anything else (including a blank content-type) as HTML, the common case.
  const html = fetched.buffer.toString("utf-8");
  const extracted = extractHtml(html, finalUrl);
  if (extracted.looksLikeJsShell) throw new EscalateError("looks like a JS app shell");
  if (extracted.textLength < MIN_CONTENT_CHARS) throw new EscalateError("extracted text too short");

  return {
    finalUrl: extracted.canonicalUrl ?? finalUrl,
    title: extracted.title,
    markdown: extracted.markdown,
    publishedAt: extracted.publishedAt,
    tier: 1,
  };
}

// ─── Tier 2: hosted reader ────────────────────────────────────────────────────────────────────

function readerFallbackProvider(): "jina" | "firecrawl" | null {
  const raw = process.env.READER_FALLBACK?.trim().toLowerCase();
  return raw === "jina" || raw === "firecrawl" ? raw : null;
}

async function readTier2(url: string, signal?: AbortSignal): Promise<RawPage> {
  const provider = readerFallbackProvider();
  if (!provider) throw new Error("No tier-2 reader is configured (READER_FALLBACK).");

  const result: Tier2Result = provider === "jina" ? await readWithJina(url, { signal }) : await readWithFirecrawl(url, { signal });
  if (!result.markdown || result.markdown.trim().length === 0) throw new Error("Tier 2 reader returned no content.");

  return { finalUrl: url, title: result.title, markdown: result.markdown, publishedAt: result.publishedAt, tier: 2 };
}

// ─── Tier 3: browser-use agent (unchanged) ───────────────────────────────────────────────────

// Dynamically imported, not statically: kemmaMax.ts calls into this module for its tier-1/2
// path, so a static import here would be circular. The dynamic import below resolves once the
// module graph has already settled, which breaks the cycle.
async function readTier3(url: string, opts?: { interactive?: boolean; signal?: AbortSignal }): Promise<RawPage> {
  const { browseWithAgent } = (await import("../kemmaMax")) as { browseWithAgent: typeof BrowseWithAgentFn };
  const result = await browseWithAgent(url, {
    extractText: true,
    maxLength: 50_000,
    interactive: opts?.interactive,
    signal: opts?.signal,
  });
  return { finalUrl: url, title: result.title, markdown: htmlToMarkdown(result.content) || result.content, tier: 3 };
}

function tier3Available(): boolean {
  return Boolean(process.env.BROWSER_USE_API_KEY?.trim());
}

// ─── Cache ────────────────────────────────────────────────────────────────────────────────────

interface CachedPage {
  finalUrl: string;
  title: string;
  markdown: string;
  publishedAt?: string;
  tier: ReaderTier;
}

async function getCachedPage(cacheKey: string): Promise<CachedPage | null> {
  return kvGet<CachedPage>(READER_CACHE_NAMESPACE, cacheKey);
}

async function setCachedPage(cacheKey: string, page: CachedPage): Promise<void> {
  await kvSet(READER_CACHE_NAMESPACE, cacheKey, page, READER_CACHE_TTL_SEC);
}

// ─── Usage ────────────────────────────────────────────────────────────────────────────────────
// Tier 1 is a plain fetch with no paid provider behind it, so it writes no usage row (matching
// server/lib/fnFetch.ts, which never logs usage for its fetches either). Tier 2 and tier 3 cost
// real money per call, so each writes one row with a flat, env-overridable estimate — these are
// not token-priced, so this bypasses logUsage()'s per-token cost model the way
// server/lib/fnImage.ts's logImageUsage() already does for images.

function readerCostUsd(tier: 2 | 3, provider: "jina" | "firecrawl" | "browser-use"): number {
  const envVar =
    provider === "jina" ? "READER_COST_JINA" : provider === "firecrawl" ? "READER_COST_FIRECRAWL" : "READER_COST_BROWSER_USE_TASK";
  const raw = Number(process.env[envVar]);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return provider === "jina" ? 0.002 : provider === "firecrawl" ? 0.005 : 0.03;
}

async function logReaderUsage(opts: ReadPageOptions, tier: 2 | 3, provider: "jina" | "firecrawl" | "browser-use"): Promise<void> {
  if (opts.userId === undefined) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(usageLogs).values({
      userId: opts.userId,
      sessionId: opts.sessionId ?? null,
      reportId: null,
      provider,
      model: provider,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: String(readerCostUsd(tier, provider)),
      purpose: tier === 2 ? "reader:tier2" : "reader:tier3",
    });
  } catch (err) {
    console.warn("[reader] failed to log usage:", (err as Error).message);
  }
}

// ─── Orchestration ────────────────────────────────────────────────────────────────────────────

/** Reads a page through the tiered reader and returns markdown selected for `opts.query`/`opts.maxChars`. */
export async function readPage(url: string, opts: ReadPageOptions = {}): Promise<ReadPageResult> {
  if (opts.signal?.aborted) {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  }

  // SSRF guard: run before cache, before tier 1, tier 2, or tier 3 (including interactive)
  await assertPublicPageUrl(url);

  const maxChars = opts.maxChars && opts.maxChars > 0 ? opts.maxChars : DEFAULT_MAX_CHARS;
  const cacheKey = canonicalizeUrl(url);

  if (!opts.interactive) {
    const cached = await getCachedPage(cacheKey);
    if (cached) return finish(url, cached, opts.query, maxChars);
  }

  if (opts.interactive) {
    const page = await readTier3(url, { interactive: true, signal: opts.signal });
    if (tier3Available()) await logReaderUsage(opts, 3, "browser-use");
    return finish(url, page, opts.query, maxChars);
  }

  let page: RawPage | null = null;
  let lastError: unknown = null;

  try {
    page = await readTier1(url, opts.signal);
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err;
    if (opts.signal?.aborted || isAbortError(err)) throw err;
    lastError = err;
  }

  if (!page) {
    const provider = readerFallbackProvider();
    if (provider) {
      try {
        page = await readTier2(url, opts.signal);
        await logReaderUsage(opts, 2, provider);
      } catch (err) {
        if (opts.signal?.aborted || isAbortError(err)) throw err;
        lastError = err;
      }
    }
  }

  if (!page) {
    if (tier3Available()) {
      page = await readTier3(url, { signal: opts.signal });
      await logReaderUsage(opts, 3, "browser-use");
    } else {
      throw lastError instanceof Error ? lastError : new Error("Could not read that page.");
    }
  }

  // Cache under canonical URL (page.finalUrl) as required by spec,
  // and also under the requested URL so aliases / redirects hit the cache.
  const canonicalKey = canonicalizeUrl(page.finalUrl);
  const cachePayload: CachedPage = {
    finalUrl: page.finalUrl,
    title: page.title,
    markdown: page.markdown,
    publishedAt: page.publishedAt,
    tier: page.tier,
  };

  await setCachedPage(canonicalKey, cachePayload);
  if (cacheKey !== canonicalKey) {
    await setCachedPage(cacheKey, cachePayload);
  }

  return finish(url, page, opts.query, maxChars);
}

function finish(originalUrl: string, page: CachedPage | RawPage, query: string | undefined, maxChars: number): ReadPageResult {
  const selection = selectForBudget(page.markdown, query, maxChars);
  return {
    url: originalUrl,
    finalUrl: page.finalUrl,
    title: page.title,
    markdown: selection.text,
    tier: page.tier,
    truncated: selection.truncated,
    publishedAt: page.publishedAt,
  };
}
