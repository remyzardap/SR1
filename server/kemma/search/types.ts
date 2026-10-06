/**
 * Shared types for the P1-08 search provider layer (server/kemma/search/*).
 *
 * This layer is additive: it only runs when `flag("SEARCH_V2")` is on (see
 * server/kemma/executors/webSearch.ts). With the flag off, nothing here is touched and the
 * original Sonar-only path keeps running exactly as before.
 */

export interface SearchOptions {
  /** Desired result count. Providers clamp this to their own max. */
  k?: number;
  recency?: "day" | "week" | "month" | "year";
  includeDomains?: string[];
  excludeDomains?: string[];
  vertical?: "web" | "news";
  signal?: AbortSignal;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  date?: string;
  /** Additive: which provider produced this hit. Existing consumers (sources.ts, activity.ts) ignore it. */
  provider: string;
  /** Additive: rank-fusion or provider relevance score, when available. */
  score?: number;
}

export interface SearchProvider {
  /** Short, stable id: "brave" | "tavily" | "exa" | "perplexity" | "searxng" | "sonar". */
  id: string;
  /** Whether this provider has the credentials/config it needs, read from env at call time. */
  configured(): boolean;
  /** Estimated cost of one upstream request, in USD. Read at call time so env overrides apply. */
  readonly costPerRequestUsd: number;
  search(q: string, o: SearchOptions): Promise<SearchHit[]>;
}
