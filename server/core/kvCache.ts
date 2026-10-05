/**
 * Shared key-value cache in Postgres (`kv_cache`) for values worth keeping across processes and
 * restarts, such as search results (P1-08, namespace "search") and fetched pages (P1-09, "page").
 *
 * A miss, an expired row, a missing database and a database error all read as "not cached": the
 * cache never fails its caller. Reads ignore expired rows; the daily `kv-cache-sweep` job
 * (registered in jobs.ts) deletes them.
 *
 * Keys longer than 128 characters (the column width) are stored as their sha256 hex digest.
 * Errors are logged with the namespace only, never the key or the value.
 */
import { createHash } from "crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { getDb } from "../db";
import { kvCache } from "../../drizzle/schema";

export const KV_SWEEP_JOB = "kv-cache-sweep";
/** pg-boss cron, UTC: once a day at 03:17. */
export const KV_SWEEP_CRON = "17 3 * * *";

export const MAX_NAMESPACE_CHARS = 32;
export const MAX_KEY_CHARS = 128;

/** The key as stored: unchanged up to 128 characters, otherwise its sha256 hex digest. */
export function kvStorageKey(key: string): string {
  if (typeof key !== "string" || key.length === 0) throw new Error("kv key must be a non-empty string");
  return key.length > MAX_KEY_CHARS ? createHash("sha256").update(key).digest("hex") : key;
}

function checkNamespace(namespace: string): void {
  if (typeof namespace !== "string" || namespace.length === 0 || namespace.length > MAX_NAMESPACE_CHARS) {
    throw new Error(`kv namespace must be 1 to ${MAX_NAMESPACE_CHARS} characters`);
  }
}

/** The cached value, or null on a miss, an expired row or any database problem. */
export async function kvGet<T = unknown>(namespace: string, key: string): Promise<T | null> {
  checkNamespace(namespace);
  const storedKey = kvStorageKey(key);
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select({ value: kvCache.value })
      .from(kvCache)
      .where(and(eq(kvCache.namespace, namespace), eq(kvCache.key, storedKey), gt(kvCache.expiresAt, new Date())))
      .limit(1);
    return rows.length > 0 ? (rows[0].value as T) : null;
  } catch (err) {
    console.warn(`[kv-cache] read failed in namespace "${namespace}":`, (err as Error).message);
    return null;
  }
}

/**
 * Stores a JSON value for ttlSec seconds, replacing any value under the same key. A ttl of 0 or
 * less stores nothing. null and undefined are refused: they would read back as a miss.
 */
export async function kvSet(namespace: string, key: string, value: unknown, ttlSec: number): Promise<void> {
  checkNamespace(namespace);
  const storedKey = kvStorageKey(key);
  if (value === undefined || value === null) throw new Error("kvSet needs a value; null and undefined read back as a miss");
  if (!Number.isFinite(ttlSec) || ttlSec <= 0) return;
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSec * 1000);
  try {
    await db
      .insert(kvCache)
      .values({ namespace, key: storedKey, value, expiresAt, createdAt: now })
      .onConflictDoUpdate({ target: [kvCache.namespace, kvCache.key], set: { value, expiresAt, createdAt: now } });
  } catch (err) {
    console.warn(`[kv-cache] write failed in namespace "${namespace}":`, (err as Error).message);
  }
}

/** Deletes every expired row; the `kv-cache-sweep` job. Returns the number of rows removed. */
export async function sweepExpiredKv(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.delete(kvCache).where(lte(kvCache.expiresAt, new Date()));
  const removed = result.rowCount ?? 0;
  console.log(`[kv-cache] sweep removed ${removed} expired rows`);
  return removed;
}
