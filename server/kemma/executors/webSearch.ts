/**
 * Perplexity Sonar API Client for Web Search
 *
 * Uses the KEMMA_MODEL_SEARCH env var (default sonar-pro) and enforces a
 * configurable per-minute rate limit (KEMMA_SEARCH_RPM, default 40) with
 * exponential backoff on 429 responses.
 */

import { resolveRouteAuth, routeHasAuth, searchRoute, type RouteConfig } from "../../core/kemmaRouter";

interface PerplexityMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface PerplexityCitation {
  url: string;
}

interface PerplexityChoice {
  index: number;
  message: PerplexityMessage;
  finish_reason: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  citations?: Array<PerplexityCitation | string>;
  search_results?: Array<{ title?: string; url?: string; date?: string; snippet?: string }>;
  choices: PerplexityChoice[];
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

interface PerplexityErrorResponse {
  error?: {
    message: string;
    type: string;
    code: string;
  };
  message?: string;
}

class PerplexityAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'PerplexityAPIError';
  }
}

class PerplexityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerplexityConfigError';
  }
}

function extractTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const lastSegment = pathParts[pathParts.length - 1];
      return lastSegment
        .replace(/[-_]/g, ' ')
        .replace(/\.(html?|php|asp)$/i, '')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return 'Untitled Result';
  }
}

function parseSearchResults(response: PerplexityResponse): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const assistantMessage = response.choices.find((choice) => choice.message.role === 'assistant');
  const content = assistantMessage?.message.content || '';

  const add = (url: string | undefined, title: string | undefined, snippet: string, date?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    results.push({ title: title?.trim() || extractTitleFromUrl(url), url, snippet, ...(date ? { date } : {}) });
  };

  // Sonar returns per-source metadata in search_results and bare URL strings in citations.
  for (const r of response.search_results ?? []) {
    add(r.url, r.title, (r.snippet ?? '').slice(0, 500), r.date);
  }
  for (const c of response.citations ?? []) {
    add(typeof c === 'string' ? c : c?.url, undefined, '');
  }

  // The synthesized answer carries the facts the [n] markers point at; keep it on the first result.
  if (results.length > 0 && content) {
    results[0].snippet = `SEARCH ANSWER (markers [n] refer to the numbered sources in order):\n${content.slice(0, 6000)}\n\n${results[0].snippet}`.slice(0, 7000);
  }

  return results;
}

// ─── Rate limiter (in-process, per-instance) ─────────────────────────────────

const searchTimestamps: number[] = [];

function getMaxRpm(): number {
  const raw = process.env.KEMMA_SEARCH_RPM || '40';
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
}

async function throttleSearch(): Promise<void> {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRpm = getMaxRpm();

  // Drop timestamps outside the rolling window
  while (searchTimestamps.length > 0 && searchTimestamps[0] <= now - windowMs) {
    searchTimestamps.shift();
  }

  if (searchTimestamps.length >= maxRpm) {
    const oldest = searchTimestamps[0];
    const wait = oldest + windowMs - now;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  searchTimestamps.push(Date.now());
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main function ───────────────────────────────────────────────────────────

type SearchHit = { title: string; url: string; snippet: string; date?: string };

/**
 * The exact upstream Sonar call, unchanged. Exported so the P1-08 `sonar` provider
 * (server/kemma/search/providers/sonar.ts) can reuse it as the search layer's last-resort
 * fallback, rather than duplicating the key resolution, throttling and retry logic here.
 */
export async function searchUpstream(
  query: string
): Promise<SearchHit[]> {
  if (!query || query.trim() === '') {
    throw new Error('Search query cannot be empty');
  }

  await throttleSearch();

  const route = searchRoute();
  if (!routeHasAuth(route)) {
    throw new PerplexityConfigError(
      'SONAR_API_KEY / PERPLEXITY_API_KEY environment variable is not set or is empty'
    );
  }

  const target = await resolveRouteAuth(route);
  const requestBody = {
    model: target.model,
    messages: [
      {
        role: 'user' as const,
        content: query.trim(),
      },
    ],
  };

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const response = await fetch(`${target.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${target.auth}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 429) {
        const backoff = Math.min(1000 * 2 ** attempts, 8000);
        await sleep(backoff);
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        let parsedError: PerplexityErrorResponse | null = null;
        try {
          parsedError = JSON.parse(errorBody) as PerplexityErrorResponse;
        } catch {
          // use raw text
        }

        const errorMessage =
          parsedError?.error?.message ||
          parsedError?.message ||
          `Perplexity API returned status ${response.status}`;

        throw new PerplexityAPIError(
          errorMessage,
          response.status,
          parsedError || errorBody
        );
      }

      const data = (await response.json()) as PerplexityResponse;

      if (!data.choices || !Array.isArray(data.choices)) {
        throw new PerplexityAPIError(
          'Invalid response structure from Perplexity API: missing choices array'
        );
      }

      const results = parseSearchResults(data);

      if (results.length === 0 && data.choices.length > 0) {
        const content = data.choices[0]?.message?.content || '';
        if (content) {
          return [
            {
              title: 'Search Result',
              url: '',
              snippet: content.slice(0, 500),
            },
          ];
        }
      }

      return results;
    } catch (error) {
      if (error instanceof PerplexityAPIError || error instanceof PerplexityConfigError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new PerplexityAPIError(
          `Failed to connect to Perplexity API: ${error.message}`
        );
      }
      throw new PerplexityAPIError(
        'An unexpected error occurred while calling Perplexity API'
      );
    }
  }

  throw new PerplexityAPIError('Perplexity API rate limit persisted after retries.', 429);
}

// ─── Response cache + in-flight dedupe ───────────────────────────────────────
// Deep research and parallel sub-agents often issue the same query several times; every upstream
// call is a paid Sonar request. Identical queries within the TTL are served from memory, and
// identical queries already in flight share one request. Errors and empty answers are never cached.
// KEMMA_SEARCH_CACHE_TTL_SEC (default 900, 0 disables). Queries that read as time-sensitive are
// capped at 120 s so "latest" and "today" do not go stale.

const SEARCH_CACHE_MAX = 200;
const SHORT_TTL_MS = 120_000;
const RECENCY_WORDS = /\b(now|today|tonight|latest|breaking|live|right now|this (hour|morning|week)|current (price|score|status))\b/i;

const searchCache = new Map<string, { at: number; results: SearchHit[] }>();
const searchInflight = new Map<string, Promise<SearchHit[]>>();

function searchCacheTtlMs(query: string): number {
  const raw = process.env.KEMMA_SEARCH_CACHE_TTL_SEC;
  const sec = raw === undefined || raw.trim() === '' ? 900 : Number(raw);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  const ms = sec * 1000;
  return RECENCY_WORDS.test(query) ? Math.min(ms, SHORT_TTL_MS) : ms;
}

const cloneHits = (hits: SearchHit[]): SearchHit[] => hits.map((h) => ({ ...h }));

export function clearSearchCache(): void {
  searchCache.clear();
  searchInflight.clear();
}

async function webSearchLegacy(
  query: string
): Promise<SearchHit[]> {
  const ttl = typeof query === 'string' ? searchCacheTtlMs(query) : 0;
  if (ttl <= 0 || !query || query.trim() === '') return searchUpstream(query);

  // Same contract as an uncached call: a missing key is a configuration error even when an answer is cached.
  const route = searchRoute();
  if (!routeHasAuth(route)) return searchUpstream(query);

  const key = `${route.model}|${query.trim().replace(/\s+/g, ' ').toLowerCase()}`;
  const now = Date.now();

  const hit = searchCache.get(key);
  if (hit && now - hit.at < ttl) {
    // Re-insert so the oldest-touched entry is the one evicted.
    searchCache.delete(key);
    searchCache.set(key, hit);
    return cloneHits(hit.results);
  }
  if (hit) searchCache.delete(key);

  const pending = searchInflight.get(key);
  if (pending) return cloneHits(await pending);

  const request = searchUpstream(query)
    .then((results) => {
      if (results.length > 0) {
        searchCache.set(key, { at: Date.now(), results: cloneHits(results) });
        while (searchCache.size > SEARCH_CACHE_MAX) {
          const oldest = searchCache.keys().next().value;
          if (oldest === undefined) break;
          searchCache.delete(oldest);
        }
      }
      return results;
    })
    .finally(() => { searchInflight.delete(key); });
  searchInflight.set(key, request);
  return cloneHits(await request);
}

// ─── SEARCH_V2 (P1-08): the new multi-provider layer, behind a flag ──────────────────────────────
// Importing the search layer here (rather than from kemmaMax.ts) keeps the switch inside this
// executor's function body, so P1-08 only ever adds one call site in this file and the tool-call
// plumbing in kemmaMax.ts/tools.ts only gains optional pass-through fields. See
// server/kemma/search/index.ts for the provider layer itself.

import { flag } from "../../core/flags";
import { searchV2, SearchUnavailableError, type SearchV2Options } from "../search";

export interface WebSearchCallOptions {
  recency?: "day" | "week" | "month" | "year";
  includeDomains?: string[];
  excludeDomains?: string[];
  vertical?: "web" | "news";
  depth?: "standard" | "deep";
  /** Needed only for SEARCH_V2 usage logging; the legacy (flag off) path ignores it, same as before. */
  userId?: number;
  sessionId?: string;
}

/**
 * query, plus an optional trailing options object — kept optional so every existing call site
 * (`webSearch(query)`) is unaffected. With `flag("SEARCH_V2")` off, behavior is byte-identical to
 * before: `opts` is read nowhere in `webSearchLegacy`.
 */
export async function webSearch(query: string, opts: WebSearchCallOptions = {}): Promise<SearchHit[]> {
  if (flag("SEARCH_V2")) {
    const options: SearchV2Options = {
      recency: opts.recency,
      includeDomains: opts.includeDomains,
      excludeDomains: opts.excludeDomains,
      vertical: opts.vertical,
      depth: opts.depth,
    };
    return searchV2(query, options, { userId: opts.userId ?? 0, sessionId: opts.sessionId });
  }
  return webSearchLegacy(query);
}

export { PerplexityAPIError, PerplexityConfigError, SearchUnavailableError };
export default webSearch;
