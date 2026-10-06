/**
 * Two-level cache for the search provider layer (P1-08).
 *
 * L1 is an in-process LRU, the same behavior the legacy Sonar path has today: a bounded map,
 * oldest-touched eviction, and a 120s cap for queries that read as time-sensitive. L2 is
 * `kv_cache` (namespace "search"), read on an L1 miss and written whenever an L1 entry is
 * resolved, so a cold process (a new deploy, a second instance) still avoids the upstream call.
 *
 * A miss or any kv_cache problem reads as "not cached" (kvGet/kvSet already guarantee this); this
 * module never throws because of the cache.
 */

import { kvGet, kvSet } from "../../core/kvCache";
import type { SearchHit } from "./types";
import { searchCacheTtlSec } from "./config";

const NAMESPACE = "search";
const CACHE_MAX = 200;
const SHORT_TTL_SEC = 120;
const RECENCY_WORDS = /\b(now|today|tonight|latest|breaking|live|right now|this (hour|morning|week)|current (price|score|status))\b/i;

interface L1Entry {
  at: number;
  hits: SearchHit[];
}

const l1 = new Map<string, L1Entry>();
const inflight = new Map<string, Promise<SearchHit[]>>();

export function clearSearchV2Cache(): void {
  l1.clear();
  inflight.clear();
}

/** TTL in seconds for this query: the configured TTL, capped at 120s for time-sensitive queries. */
export function searchCacheTtlSecFor(query: string): number {
  const ttl = searchCacheTtlSec();
  if (ttl <= 0) return 0;
  return RECENCY_WORDS.test(query) ? Math.min(ttl, SHORT_TTL_SEC) : ttl;
}

const cloneHits = (hits: SearchHit[]): SearchHit[] => hits.map((h) => ({ ...h }));

function touchL1(key: string, entry: L1Entry): void {
  l1.delete(key);
  l1.set(key, entry);
  while (l1.size > CACHE_MAX) {
    const oldest = l1.keys().next().value;
    if (oldest === undefined) break;
    l1.delete(oldest);
  }
}

/**
 * Runs `fetchFresh` behind a two-level cache keyed by `key`, with in-flight de-duplication so
 * concurrent identical calls share one upstream round trip. A ttlSec of 0 disables caching
 * entirely (every call goes to `fetchFresh`). Results are only cached when non-empty.
 */
export async function cachedSearch(key: string, ttlSec: number, fetchFresh: () => Promise<SearchHit[]>): Promise<SearchHit[]> {
  if (ttlSec <= 0) return fetchFresh();

  const now = Date.now();
  const hit = l1.get(key);
  if (hit && now - hit.at < ttlSec * 1000) {
    touchL1(key, hit);
    return cloneHits(hit.hits);
  }
  if (hit) l1.delete(key);

  const pending = inflight.get(key);
  if (pending) return cloneHits(await pending);

  const l2 = await kvGet<SearchHit[]>(NAMESPACE, key);
  if (Array.isArray(l2) && l2.length > 0) {
    touchL1(key, { at: now, hits: cloneHits(l2) });
    return cloneHits(l2);
  }

  const request = fetchFresh()
    .then(async (hits) => {
      if (hits.length > 0) {
        touchL1(key, { at: Date.now(), hits: cloneHits(hits) });
        await kvSet(NAMESPACE, key, cloneHits(hits), ttlSec);
      }
      return hits;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, request);
  return cloneHits(await request);
}
