/**
 * Exa Search API provider.
 *
 * Docs checked: https://docs.exa.ai/reference/search (redirects to https://exa.ai/docs/reference/search)
 * on 2026-10-05.
 *
 * POST https://api.exa.ai/search
 * Auth: x-api-key: <EXA_API_KEY>.
 * Body: query, type:"auto", numResults, includeDomains, excludeDomains, startPublishedDate,
 * category ("news" for the news vertical).
 */

import { fetchWithRetry } from "../../../core/llmHttp";
import { searchCostPerRequestUsd } from "../config";
import { acquireSearchToken } from "../rateLimit";
import type { SearchHit, SearchOptions, SearchProvider } from "../types";

const URL_ENDPOINT = "https://api.exa.ai/search";

export function exaApiKey(): string {
  return process.env.EXA_API_KEY || "";
}

export function exaConfigured(): boolean {
  return exaApiKey() !== "";
}

function startPublishedDateFor(recency: NonNullable<SearchOptions["recency"]>, now = Date.now()): string {
  const msByRecency: Record<NonNullable<SearchOptions["recency"]>, number> = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };
  return new Date(now - msByRecency[recency]).toISOString();
}

/** Builds the Exa POST body for a query + options. Exported for parameter-translation tests. */
export function buildExaRequestBody(query: string, options: SearchOptions, now = Date.now()): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query,
    type: "auto",
    numResults: Math.min(100, Math.max(1, options.k ?? 10)),
    contents: { text: { maxCharacters: 500 } },
  };
  if (options.vertical === "news") body.category = "news";
  if (options.recency) body.startPublishedDate = startPublishedDateFor(options.recency, now);
  if (options.includeDomains?.length) body.includeDomains = options.includeDomains;
  if (options.excludeDomains?.length) body.excludeDomains = options.excludeDomains;
  return body;
}

interface ExaResult {
  title?: string;
  url?: string;
  text?: string;
  highlights?: string[];
  publishedDate?: string;
}

interface ExaResponse {
  results?: ExaResult[];
}

/** Maps a raw Exa API JSON body to SearchHit[]. Exported for fixture-driven tests. */
export function mapExaResponse(raw: ExaResponse): SearchHit[] {
  return (raw.results ?? [])
    .filter((r) => !!r.url)
    .map((r) => ({
      title: r.title?.trim() || r.url!,
      url: r.url!,
      snippet: (r.text ?? r.highlights?.[0] ?? "").slice(0, 500),
      ...(r.publishedDate ? { date: r.publishedDate } : {}),
      provider: "exa",
    }));
}

async function search(q: string, o: SearchOptions): Promise<SearchHit[]> {
  const key = exaApiKey();
  if (!key) throw new Error("Exa search is not configured");
  await acquireSearchToken("exa");
  const res = await fetchWithRetry(
    URL_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify(buildExaRequestBody(q, o)),
      signal: o.signal,
    },
    {},
  );
  if (!res.ok) {
    throw new Error(`Exa search failed with status ${res.status}`);
  }
  const data = (await res.json()) as ExaResponse;
  return mapExaResponse(data);
}

export const exaProvider: SearchProvider = {
  id: "exa",
  configured: exaConfigured,
  get costPerRequestUsd() {
    return searchCostPerRequestUsd("exa");
  },
  search,
};
