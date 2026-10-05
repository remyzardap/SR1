/**
 * Tier 2 reader: Firecrawl (https://api.firecrawl.dev/v2/scrape).
 *
 * Verified against Firecrawl's current docs on 2026-10-05
 * (https://docs.firecrawl.dev/api-reference/endpoint/scrape): POST with `Authorization: Bearer
 * <FIRECRAWL_API_KEY>`, body `{ url, formats: ["markdown"], onlyMainContent: true }`. A success
 * response is `{ success: true, data: { markdown, metadata: { title, ... } } }`; failures carry
 * `success: false` plus an HTTP status (403 for access-restricted pages, 429 for rate limits,
 * 402 for insufficient credits).
 */

import { ReaderTierError, type Tier2Result } from "./jina";

export const FIRECRAWL_TIMEOUT_MS = 30_000;
const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";

interface FirecrawlResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      publishedTime?: string;
    };
  };
  error?: string;
}

export async function readWithFirecrawl(
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<Tier2Result> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) throw new ReaderTierError("FIRECRAWL_API_KEY is not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIRECRAWL_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);

  let res: Response;
  try {
    res = await fetch(FIRECRAWL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ReaderTierError(`Firecrawl request failed: ${err instanceof Error ? err.message : "network error"}`);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }

  if (!res.ok) throw new ReaderTierError(`Firecrawl returned ${res.status}`, res.status);

  let body: FirecrawlResponse | null;
  try {
    body = (await res.json()) as FirecrawlResponse;
  } catch {
    throw new ReaderTierError("Firecrawl returned an unreadable response");
  }

  const markdown = body?.data?.markdown;
  if (!body?.success || typeof markdown !== "string" || markdown.trim().length === 0) {
    throw new ReaderTierError("Firecrawl returned no content");
  }

  return {
    title: body.data?.metadata?.title ?? "",
    markdown: markdown.trim(),
    publishedAt: body.data?.metadata?.publishedTime,
  };
}
