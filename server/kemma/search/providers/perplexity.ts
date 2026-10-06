/**
 * Perplexity Search API provider — the results-only search endpoint, distinct from the
 * Sonar chat-completions path in server/kemma/executors/webSearch.ts (kept as the `sonar`
 * provider below, provider.ts in this folder).
 *
 * Docs checked: https://docs.perplexity.ai/api-reference/search-post on 2026-10-05.
 *
 * POST https://api.perplexity.ai/search
 * Auth: Authorization: Bearer <PERPLEXITY_API_KEY> (the same key already documented for the
 * Sonar path; see PERPLEXITY_API_KEY in ENVIRONMENT_VARIABLES.md).
 * Body: query, max_results, search_recency_filter ("hour"|"day"|"week"|"month"|"year"),
 * search_domain_filter (array; a leading "-" excludes a domain).
 */

import { fetchWithRetry } from "../../../core/llmHttp";
import { searchCostPerRequestUsd } from "../config";
import { acquireSearchToken } from "../rateLimit";
import type { SearchHit, SearchOptions, SearchProvider } from "../types";

const URL_ENDPOINT = "https://api.perplexity.ai/search";

export function perplexitySearchApiKey(): string {
  return process.env.PERPLEXITY_API_KEY || process.env.SONAR_API_KEY || "";
}

export function perplexitySearchConfigured(): boolean {
  return perplexitySearchApiKey() !== "";
}

/** Builds the Perplexity Search API POST body. Exported for parameter-translation tests. */
export function buildPerplexitySearchRequestBody(query: string, options: SearchOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query,
    max_results: Math.min(20, Math.max(1, options.k ?? 10)),
  };
  if (options.recency) body.search_recency_filter = options.recency;
  const domainFilter = [...(options.includeDomains ?? []), ...(options.excludeDomains ?? []).map((d) => `-${d}`)];
  if (domainFilter.length > 0) body.search_domain_filter = domainFilter;
  return body;
}

interface PerplexitySearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  date?: string | null;
}

interface PerplexitySearchResponse {
  results?: PerplexitySearchResult[];
}

/** Maps a raw Perplexity Search API JSON body to SearchHit[]. Exported for fixture-driven tests. */
export function mapPerplexitySearchResponse(raw: PerplexitySearchResponse): SearchHit[] {
  return (raw.results ?? [])
    .filter((r) => !!r.url)
    .map((r) => ({
      title: r.title?.trim() || r.url!,
      url: r.url!,
      snippet: (r.snippet ?? "").slice(0, 500),
      ...(r.date ? { date: r.date } : {}),
      provider: "perplexity",
    }));
}

async function search(q: string, o: SearchOptions): Promise<SearchHit[]> {
  const key = perplexitySearchApiKey();
  if (!key) throw new Error("Perplexity search is not configured");
  await acquireSearchToken("perplexity");
  const res = await fetchWithRetry(
    URL_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(buildPerplexitySearchRequestBody(q, o)),
      signal: o.signal,
    },
    {},
  );
  if (!res.ok) {
    throw new Error(`Perplexity search failed with status ${res.status}`);
  }
  const data = (await res.json()) as PerplexitySearchResponse;
  return mapPerplexitySearchResponse(data);
}

export const perplexitySearchProvider: SearchProvider = {
  id: "perplexity",
  configured: perplexitySearchConfigured,
  get costPerRequestUsd() {
    return searchCostPerRequestUsd("perplexity");
  },
  search,
};
