/**
 * The `sonar` provider: the existing Perplexity Sonar chat-completions call
 * (server/kemma/executors/webSearch.ts, unchanged), wrapped as a SearchProvider so it can sit in
 * `KEMMA_SEARCH_PROVIDERS` as the always-available last resort. It already reads its own key
 * (SONAR_API_KEY / PERPLEXITY_API_KEY) and rate limit (KEMMA_SEARCH_RPM) via searchRoute(), so it
 * does not go through this layer's generic per-provider rate limiter — doing so would double-
 * throttle the one path shared with the legacy (SEARCH_V2 off) code.
 *
 * recency/includeDomains/excludeDomains/vertical are not supported by this path (the upstream
 * call has always taken only a query string) and are ignored here, same as before.
 */

import { routeHasAuth, searchRoute } from "../../../core/kemmaRouter";
import { searchUpstream } from "../../executors/webSearch";
import { searchCostPerRequestUsd } from "../config";
import type { SearchHit, SearchOptions, SearchProvider } from "../types";

async function search(q: string, _o: SearchOptions): Promise<SearchHit[]> {
  const hits = await searchUpstream(q);
  return hits.map((h) => ({ ...h, provider: "sonar" }));
}

export const sonarProvider: SearchProvider = {
  id: "sonar",
  configured: () => routeHasAuth(searchRoute()),
  get costPerRequestUsd() {
    return searchCostPerRequestUsd("sonar");
  },
  search,
};
