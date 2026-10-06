/**
 * Per-provider token-bucket rate limiting for the search provider layer (P1-08).
 *
 * One bucket per provider id, in-process (like the existing Sonar throttle). Capacity and refill
 * rate both come from `searchRpmFor(id)` (KEMMA_SEARCH_RPM, overridable per provider), read fresh
 * on every acquire so an env change takes effect without a restart.
 */

import { searchRpmFor } from "./config";

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

/** Test-only: drops every bucket so tests don't leak state across runs. */
export function resetSearchRateLimiters(): void {
  buckets.clear();
}

/**
 * Waits, if necessary, until a token is available for this provider, then consumes it.
 * `nowMs`/`sleep` are test seams; defaults use the real clock and timers.
 */
export async function acquireSearchToken(
  providerId: string,
  opts: { nowMs?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const now = opts.nowMs ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const rpm = searchRpmFor(providerId);
  const capacity = Math.max(1, rpm);
  const refillPerMs = capacity / 60_000;

  for (;;) {
    let bucket = buckets.get(providerId);
    const t = now();
    if (!bucket) {
      bucket = { tokens: capacity, lastRefillMs: t };
      buckets.set(providerId, bucket);
    } else {
      const elapsed = Math.max(0, t - bucket.lastRefillMs);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
      bucket.lastRefillMs = t;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    const deficitMs = (1 - bucket.tokens) / refillPerMs;
    await sleep(Math.max(1, Math.ceil(deficitMs)));
  }
}
