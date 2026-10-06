/**
 * Brave Search API provider.
 *
 * Docs checked: https://api-dashboard.search.brave.com/app/documentation/web-search/query
 * (web search query reference) on 2026-10-05.
 *
 * GET https://api.search.brave.com/res/v1/web/search (web vertical) or
 *     https://api.search.brave.com/res/v1/news/search (news vertical)
 * Auth header: X-Subscription-Token.
 * `freshness`: pd (24h) / pw (7d) / pm (31d) / py (1y).
 */

import { fetchWithRetry } from "../../../core/llmHttp";
import { searchCostPerRequestUsd } from "../config";
import { acquireSearchToken } from "../rateLimit";
import type { SearchHit, SearchOptions, SearchProvider } from "../types";

const BASE_URL = "https://api.search.brave.com/res/v1";

export function braveApiKey(): string {
  return process.env.BRAVE_SEARCH_API_KEY || "";
}

export function braveConfigured(): boolean {
  return braveApiKey() !== "";
}

const FRESHNESS_BY_RECENCY: Record<NonNullable<SearchOptions["recency"]>, string> = {
  day: "pd",
  week: "pw",
  month: "pm",
  year: "py",
};

/** Builds the Brave request URL for a query + options, for both calling the API and for tests. */
export function buildBraveRequestUrl(query: string, options: SearchOptions): string {
  const vertical = options.vertical === "news" ? "news" : "web";
  // Brave has no native include/exclude-domain param; fold them into the query with site: operators,
  // the same way a person would narrow a Brave search in the browser.
  const includeDomains = options.includeDomains ?? [];
  const excludeDomains = options.excludeDomains ?? [];
  const terms = [query];
  if (includeDomains.length > 0) terms.push(`(${includeDomains.map((d) => `site:${d}`).join(" OR ")})`);
  for (const domain of excludeDomains) terms.push(`-site:${domain}`);

  const params = new URLSearchParams();
  params.set("q", terms.join(" "));
  params.set("count", String(Math.min(20, Math.max(1, options.k ?? 10))));
  if (options.recency) params.set("freshness", FRESHNESS_BY_RECENCY[options.recency]);
  return `${BASE_URL}/${vertical}/search?${params.toString()}`;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  page_age?: string;
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
  news?: { results?: BraveWebResult[] };
  results?: BraveWebResult[]; // news endpoint returns results at the top level
}

/** Maps a raw Brave API JSON body to SearchHit[]. Exported for fixture-driven tests. */
export function mapBraveResponse(raw: BraveResponse): SearchHit[] {
  const items = raw.web?.results ?? raw.news?.results ?? raw.results ?? [];
  return items
    .filter((r) => !!r.url)
    .map((r) => ({
      title: r.title?.trim() || r.url!,
      url: r.url!,
      snippet: (r.description ?? "").slice(0, 500),
      ...(r.page_age || r.age ? { date: String(r.page_age ?? r.age) } : {}),
      provider: "brave",
    }));
}

async function search(q: string, o: SearchOptions): Promise<SearchHit[]> {
  const key = braveApiKey();
  if (!key) throw new Error("Brave search is not configured");
  await acquireSearchToken("brave");
  const res = await fetchWithRetry(
    buildBraveRequestUrl(q, o),
    { method: "GET", headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: o.signal },
    {},
  );
  if (!res.ok) {
    throw new Error(`Brave search failed with status ${res.status}`);
  }
  const data = (await res.json()) as BraveResponse;
  return mapBraveResponse(data);
}

export const braveProvider: SearchProvider = {
  id: "brave",
  configured: braveConfigured,
  get costPerRequestUsd() {
    return searchCostPerRequestUsd("brave");
  },
  search,
};
