/**
 * Tier 2 reader: Jina Reader (https://r.jina.ai/<url>).
 *
 * Verified against Jina's current docs on 2026-10-05 (https://jina.ai/reader): prepend
 * `https://r.jina.ai/` to the target URL, GET it, optionally send `Authorization: Bearer
 * <JINA_API_KEY>` (raises the rate limit; the endpoint works keyless at a lower one), and
 * `Accept: application/json` to get back `{ code, data: { title, content, publishedTime, ... } }`
 * instead of a bare markdown body — `content` is already markdown.
 */

export const JINA_TIMEOUT_MS = 20_000;

/** What a tier-2 provider (Jina, Firecrawl) hands back on success. */
export interface Tier2Result {
  title: string;
  markdown: string;
  publishedAt?: string;
}

/** Thrown by a tier-2 provider on failure; `status` carries the HTTP status when there was one. */
export class ReaderTierError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ReaderTierError";
    this.status = status;
  }
}

interface JinaResponse {
  data?: {
    title?: string;
    content?: string;
    publishedTime?: string;
  };
}

export async function readWithJina(
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<Tier2Result> {
  if (opts.signal?.aborted) {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  }

  const apiKey = process.env.JINA_API_KEY?.trim();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Respond-With": "markdown",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JINA_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);

  let res: Response;
  try {
    res = await fetch(`https://r.jina.ai/${url}`, { headers, signal: controller.signal });
  } catch (err) {
    if (opts.signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
      const abortErr = new Error("The operation was aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    throw new ReaderTierError(`Jina Reader request failed: ${err instanceof Error ? err.message : "network error"}`);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }

  if (!res.ok) throw new ReaderTierError(`Jina Reader returned ${res.status}`, res.status);

  let body: JinaResponse | null;
  try {
    body = (await res.json()) as JinaResponse;
  } catch {
    throw new ReaderTierError("Jina Reader returned an unreadable response");
  }

  const content = body?.data?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new ReaderTierError("Jina Reader returned no content");
  }

  return {
    title: body?.data?.title ?? "",
    markdown: content.trim(),
    publishedAt: body?.data?.publishedTime,
  };
}
