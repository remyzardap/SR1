/**
 * Search provider layer orchestrator (P1-08).
 *
 * `searchV2` is the one entry point: it picks providers from `KEMMA_SEARCH_PROVIDERS`, runs the
 * fast path (first configured provider, failing over on error or empty results) or the fan-out
 * path (`depth: "deep"`: the first two configured providers in parallel, fused with RRF), caches
 * the result (L1 in-process, L2 kv_cache), and logs one usage_logs row per upstream request made.
 *
 * Only called when `flag("SEARCH_V2")` is on (server/kemma/executors/webSearch.ts). Reads every
 * env var through server/kemma/search/config.ts, at call time.
 */

import { logFixedCostUsage } from "../../core/usage";
import { cachedSearch, searchCacheTtlSecFor } from "./cache";
import { searchProviderOrder } from "./config";
import { dedupeByCanonicalUrl, reciprocalRankFusion } from "./fusion";
import { braveProvider } from "./providers/brave";
import { exaProvider } from "./providers/exa";
import { perplexitySearchProvider } from "./providers/perplexity";
import { searxngProvider } from "./providers/searxng";
import { sonarProvider } from "./providers/sonar";
import { tavilyProvider } from "./providers/tavily";
import type { SearchHit, SearchOptions, SearchProvider } from "./types";

export type { SearchHit, SearchOptions, SearchProvider } from "./types";

const REGISTRY: Record<string, SearchProvider> = {
  brave: braveProvider,
  tavily: tavilyProvider,
  exa: exaProvider,
  perplexity: perplexitySearchProvider,
  searxng: searxngProvider,
  sonar: sonarProvider,
};

export interface SearchV2Options extends SearchOptions {
  /** "deep" runs the fan-out path (first two configured providers, RRF-fused). Default: fast path. */
  depth?: "standard" | "deep";
}

export interface SearchV2Context {
  userId: number;
  sessionId?: string;
  reportId?: string;
  /** usage_logs purpose; defaults to "search". */
  purpose?: string;
}

/** The configured providers, in `KEMMA_SEARCH_PROVIDERS` order. Exported for tests and diagnostics. */
export function configuredSearchProviders(): SearchProvider[] {
  return searchProviderOrder()
    .map((id) => REGISTRY[id])
    .filter((p): p is SearchProvider => !!p && p.configured());
}

interface UpstreamRequest {
  providerId: string;
  costUsd: number;
}

async function runFastPath(query: string, options: SearchOptions, providers: SearchProvider[]): Promise<{ hits: SearchHit[]; requests: UpstreamRequest[]; anySucceeded: boolean }> {
  const requests: UpstreamRequest[] = [];
  let anySucceeded = false;
  for (const provider of providers) {
    try {
      const hits = await provider.search(query, options);
      requests.push({ providerId: provider.id, costUsd: provider.costPerRequestUsd });
      anySucceeded = true;
      if (hits.length > 0) return { hits: dedupeByCanonicalUrl(hits), requests, anySucceeded };
    } catch {
      requests.push({ providerId: provider.id, costUsd: provider.costPerRequestUsd });
      // try the next configured provider
    }
  }
  return { hits: [], requests, anySucceeded };
}

async function runFanOut(query: string, options: SearchOptions, providers: SearchProvider[]): Promise<{ hits: SearchHit[]; requests: UpstreamRequest[]; anySucceeded: boolean }> {
  const chosen = providers.slice(0, 2);
  const requests: UpstreamRequest[] = [];
  let anySucceeded = false;
  const lists = await Promise.all(
    chosen.map(async (provider) => {
      try {
        const hits = await provider.search(query, options);
        requests.push({ providerId: provider.id, costUsd: provider.costPerRequestUsd });
        anySucceeded = true;
        return hits;
      } catch {
        requests.push({ providerId: provider.id, costUsd: provider.costPerRequestUsd });
        return [] as SearchHit[];
      }
    }),
  );
  const fused = reciprocalRankFusion(lists, 60);
  return { hits: dedupeByCanonicalUrl(fused), requests, anySucceeded };
}

function cacheKeyFor(query: string, options: SearchV2Options, providerIds: string[]): string {
  const normalizedQuery = query.trim().replace(/\s+/g, " ").toLowerCase();
  const sig = {
    q: normalizedQuery,
    k: options.k,
    recency: options.recency,
    include: [...(options.includeDomains ?? [])].sort(),
    exclude: [...(options.excludeDomains ?? [])].sort(),
    vertical: options.vertical,
    depth: options.depth ?? "standard",
    providers: providerIds,
  };
  return JSON.stringify(sig);
}

/** Thrown when no provider in `KEMMA_SEARCH_PROVIDERS` has the configuration it needs. */
export class NoSearchProviderConfiguredError extends Error {
  constructor() {
    super("No search provider is configured.");
    this.name = "NoSearchProviderConfiguredError";
  }
}

/** Thrown when all attempted search providers throw an error (bad key, outage, etc.). */
export class SearchUnavailableError extends Error {
  constructor(message = "Search is currently unavailable.") {
    super(message);
    this.name = "SearchUnavailableError";
  }
}

export async function searchV2(query: string, options: SearchV2Options, ctx: SearchV2Context): Promise<SearchHit[]> {
  if (typeof query !== "string" || query.trim() === "") throw new Error("Search query cannot be empty");

  const providers = configuredSearchProviders();
  if (providers.length === 0) throw new NoSearchProviderConfiguredError();

  const key = cacheKeyFor(query, options, providers.map((p) => p.id));
  const ttl = searchCacheTtlSecFor(query);

  return cachedSearch(key, ttl, async () => {
    const { hits, requests, anySucceeded } =
      options.depth === "deep" ? await runFanOut(query, options, providers) : await runFastPath(query, options, providers);

    for (const r of requests) {
      await logFixedCostUsage({
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        reportId: ctx.reportId,
        provider: r.providerId,
        model: "search",
        estimatedCostUsd: r.costUsd,
        purpose: ctx.purpose ?? "search",
      });
    }

    if (!anySucceeded) {
      throw new SearchUnavailableError();
    }

    return hits;
  });
}
