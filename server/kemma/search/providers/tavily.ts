/**
 * Tavily Search API provider.
 *
 * Docs checked: https://docs.tavily.com/documentation/api-reference/endpoint/search on 2026-10-05.
 *
 * POST https://api.tavily.com/search
 * Auth: Authorization: Bearer <TAVILY_API_KEY> (Tavily also accepts the key in the body; the
 * bearer header is current and avoids putting the key in a logged body).
 * Body: query, topic ("general"|"news"|"finance"), time_range ("day"|"week"|"month"|"year"),
 * include_domains, exclude_domains.
 */

import { fetchWithRetry } from "../../../core/llmHttp";
import { searchCostPerRequestUsd } from "../config";
import { acquireSearchToken } from "../rateLimit";
import type { SearchHit, SearchOptions, SearchProvider } from "../types";

const URL_ENDPOINT = "https://api.tavily.com/search";

export function tavilyApiKey(): string {
  return process.env.TAVILY_API_KEY || "";
}

export function tavilyConfigured(): boolean {
  return tavilyApiKey() !== "";
}

/** Builds the Tavily POST body for a query + options. Exported for parameter-translation tests. */
export function buildTavilyRequestBody(query: string, options: SearchOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query,
    topic: options.vertical === "news" ? "news" : "general",
    max_results: Math.min(20, Math.max(1, options.k ?? 10)),
    include_published_date: true,
  };
  if (options.recency) body.time_range = options.recency;
  if (options.includeDomains?.length) body.include_domains = options.includeDomains;
  if (options.excludeDomains?.length) body.exclude_domains = options.excludeDomains;
  return body;
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

/** Maps a raw Tavily API JSON body to SearchHit[]. Exported for fixture-driven tests. */
export function mapTavilyResponse(raw: TavilyResponse): SearchHit[] {
  return (raw.results ?? [])
    .filter((r) => !!r.url)
    .map((r) => ({
      title: r.title?.trim() || r.url!,
      url: r.url!,
      snippet: (r.content ?? "").slice(0, 500),
      ...(r.published_date ? { date: r.published_date } : {}),
      provider: "tavily",
    }));
}

async function search(q: string, o: SearchOptions): Promise<SearchHit[]> {
  const key = tavilyApiKey();
  if (!key) throw new Error("Tavily search is not configured");
  await acquireSearchToken("tavily");
  const res = await fetchWithRetry(
    URL_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(buildTavilyRequestBody(q, o)),
      signal: o.signal,
    },
    {},
  );
  if (!res.ok) {
    throw new Error(`Tavily search failed with status ${res.status}`);
  }
  const data = (await res.json()) as TavilyResponse;
  return mapTavilyResponse(data);
}

export const tavilyProvider: SearchProvider = {
  id: "tavily",
  configured: tavilyConfigured,
  get costPerRequestUsd() {
    return searchCostPerRequestUsd("tavily");
  },
  search,
};
