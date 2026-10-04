/**
 * server/kemma/orchestrator/retries.ts
 * Exponential backoff with jitter and retryable error detection.
 */

import type { RetryPolicy } from "./types";

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  initialDelayMs: 400,
  maxDelayMs: 5000,
  backoffFactor: 2,
};

export function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  // Status codes and typical network messages
  return (
    /429|500|502|503|504|529|ECONNRESET|ETIMEDOUT|socket hang up|network error|rate limit|overloaded|fetch failed/i.test(
      msg
    )
  );
}

export async function executeWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  signal?: AbortSignal,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
): Promise<T> {
  let attempt = 0;
  let delay = policy.initialDelayMs;

  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new Error("Aborted");
    }

    try {
      return await fn(attempt);
    } catch (err) {
      attempt++;
      if (signal?.aborted) {
        throw signal.reason ?? new Error("Aborted");
      }

      const retryable = policy.isRetryable ? policy.isRetryable(err) : isTransientError(err);
      if (attempt > policy.maxRetries || !retryable) {
        throw err;
      }

      // Exponential backoff with full jitter
      const currentDelay = Math.min(policy.maxDelayMs, delay);
      const jitteredDelay = Math.floor(Math.random() * currentDelay);
      delay = Math.min(policy.maxDelayMs, delay * policy.backoffFactor);

      onRetry?.(attempt, err, jitteredDelay);

      // Abort-aware sleep
      await new Promise<void>((resolve, reject) => {
        let timer: NodeJS.Timeout;
        const abortHandler = () => {
          clearTimeout(timer);
          reject(signal?.reason ?? new Error("Aborted"));
        };

        timer = setTimeout(() => {
          signal?.removeEventListener("abort", abortHandler);
          resolve();
        }, jitteredDelay);

        signal?.addEventListener("abort", abortHandler, { once: true });
      });
    }
  }
}
