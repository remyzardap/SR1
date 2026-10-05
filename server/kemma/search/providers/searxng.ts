/**
 * Self-hosted SearXNG provider.
 *
 * Docs checked: https://docs.searxng.org/dev/search_api.html on 2026-10-05.
 *
 * GET {SEARXNG_URL}/search?format=json&q=...&time_range=day|month|year&categories=news
 * No auth; many public instances disable JSON output, so this is meant for a self-hosted instance
 * (SEARXNG_URL). SearXNG's own time_range only supports day/month/year (no "week"); a "week"
 * recency falls back to "day" (the closer, narrower bound) rather than silently widening it.
 */

import { fetchWithRetry } from "../../../core/llmHttp";
import { searchCostPerRequestUsd } from "../config";
import { acquireSearchToken } from "../rateLimit";
import type { SearchHit, SearchOptions, SearchProvider } from "../types";

export function searxngUrl(): string {
  return (process.env.SEARXNG_URL || "").replace(/\/+$/, "");
}

export function searxngConfigured(): boolean {
  return searxngUrl() !== "";
}

const TIME_RANGE_BY_RECENCY: Record<NonNullable<SearchOptions["recency"]>, string> = {
  day: "day",
  week: "day",
  month: "month",
  year: "year",
};

/** Builds the SearXNG request URL for a query + options, for both calling the instance and tests. */
export function buildSearxngRequestUrl(baseUrl: string, query: string, options: SearchOptions): string {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("format", "json");
  if (options.vertical === "news") params.set("categories", "news");
  if (options.recency) params.set("time_range", TIME_RANGE_BY_RECENCY[options.recency]);
  return `${baseUrl}/search?${params.toString()}`;
}

function matchesDomainFilters(url: string, includeDomains: string[], excludeDomains: string[]): boolean {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return includeDomains.length === 0;
  }
  if (includeDomains.length > 0 && !includeDomains.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))) {
    return false;
  }
  if (excludeDomains.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))) return false;
  return true;
}

interface SearxngResult {
  title?: string;
  url?: string;
  content?: string;
  publishedDate?: string;
}

interface SearxngResponse {
  results?: SearxngResult[];
}

/**
 * Maps a raw SearXNG JSON body to SearchHit[], applying include/exclude domain filters that the
 * SearXNG JSON API has no native parameter for. Exported for fixture-driven tests.
 */
export function mapSearxngResponse(raw: SearxngResponse, options: SearchOptions = {}): SearchHit[] {
  const includeDomains = options.includeDomains ?? [];
  const excludeDomains = options.excludeDomains ?? [];
  return (raw.results ?? [])
    .filter((r) => !!r.url && matchesDomainFilters(r.url!, includeDomains, excludeDomains))
    .slice(0, Math.min(20, Math.max(1, options.k ?? 10)))
    .map((r) => ({
      title: r.title?.trim() || r.url!,
      url: r.url!,
      snippet: (r.content ?? "").slice(0, 500),
      ...(r.publishedDate ? { date: r.publishedDate } : {}),
      provider: "searxng",
    }));
}

async function search(q: string, o: SearchOptions): Promise<SearchHit[]> {
  const baseUrl = searxngUrl();
  if (!baseUrl) throw new Error("SearXNG search is not configured");
  await acquireSearchToken("searxng");
  const res = await fetchWithRetry(
    buildSearxngRequestUrl(baseUrl, q, o),
    { method: "GET", headers: { Accept: "application/json" }, signal: o.signal },
    {},
  );
  if (!res.ok) {
    throw new Error(`SearXNG search failed with status ${res.status}`);
  }
  const data = (await res.json()) as SearxngResponse;
  return mapSearxngResponse(data, o);
}

export const searxngProvider: SearchProvider = {
  id: "searxng",
  configured: searxngConfigured,
  get costPerRequestUsd() {
    return searchCostPerRequestUsd("searxng");
  },
  search,
};
