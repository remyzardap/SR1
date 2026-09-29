/**
 * Perplexity Sonar API Client for Web Search
 *
 * Uses the KEMMA_MODEL_SEARCH env var (default sonar-pro) and enforces a
 * configurable per-minute rate limit (KEMMA_SEARCH_RPM, default 40) with
 * exponential backoff on 429 responses.
 */

import { searchRoute, type RouteConfig } from "../../core/kemmaRouter";

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

export async function webSearch(
  query: string
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  if (!query || query.trim() === '') {
    throw new Error('Search query cannot be empty');
  }

  await throttleSearch();

  const route = searchRoute();
  if (!route.apiKey) {
    throw new PerplexityConfigError(
      'SONAR_API_KEY / PERPLEXITY_API_KEY environment variable is not set or is empty'
    );
  }

  const requestBody = {
    model: route.model,
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
      const response = await fetch(`${route.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${route.apiKey}`,
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

export { PerplexityAPIError, PerplexityConfigError };
export default webSearch;
