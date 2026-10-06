/**
 * URL canonicalization and reciprocal rank fusion (RRF) for the search provider layer (P1-08).
 */

import type { SearchHit } from "./types";

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set(["fbclid", "gclid"]);

/**
 * Canonical form used only for dedupe keys, never shown to the model or the user: lowercase host,
 * strip utm_ (any suffix), fbclid and gclid query params, strip the trailing slash and the fragment.
 */
export function canonicalizeUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl.trim().toLowerCase();
  }
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  const kept = [...u.searchParams.entries()].filter(
    ([key]) => !TRACKING_PARAMS.has(key.toLowerCase()) && !TRACKING_PARAM_PREFIXES.some((p) => key.toLowerCase().startsWith(p)),
  );
  u.search = "";
  for (const [key, value] of kept) u.searchParams.append(key, value);
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  u.pathname = path;
  const query = u.search ? u.search : "";
  return `${u.protocol}//${u.hostname}${u.pathname}${query}`;
}

/** First-seen-wins dedupe by canonical URL, preserving the input order. */
export function dedupeByCanonicalUrl(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const hit of hits) {
    const key = canonicalizeUrl(hit.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

/**
 * Reciprocal rank fusion, k=60: for each hit, score += 1 / (k + rank), rank starting at 1 within
 * its own provider's result list. Hits that canonicalize to the same URL across lists are merged
 * (scores summed, first-seen hit's fields kept), then sorted by descending score.
 */
export function reciprocalRankFusion(lists: SearchHit[][], k = 60): SearchHit[] {
  const scoreByUrl = new Map<string, number>();
  const hitByUrl = new Map<string, SearchHit>();
  const orderByUrl = new Map<string, number>();
  let order = 0;

  for (const list of lists) {
    list.forEach((hit, idx) => {
      const key = canonicalizeUrl(hit.url);
      if (!key) return;
      const rank = idx + 1;
      const add = 1 / (k + rank);
      scoreByUrl.set(key, (scoreByUrl.get(key) ?? 0) + add);
      if (!hitByUrl.has(key)) {
        hitByUrl.set(key, hit);
        orderByUrl.set(key, order++);
      }
    });
  }

  return [...hitByUrl.keys()]
    .map((key) => ({ ...hitByUrl.get(key)!, score: scoreByUrl.get(key)! }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return orderByUrl.get(canonicalizeUrl(a.url))! - orderByUrl.get(canonicalizeUrl(b.url))!;
    });
}
