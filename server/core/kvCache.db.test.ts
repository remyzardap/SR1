/**
 * kvCache against a real Postgres: set, get, overwrite, expiry, hashed keys and the sweep.
 *
 * Needs TEST_DATABASE_URL pointing at a scratch database with the migrations applied
 * (`DATABASE_URL=$TEST_DATABASE_URL npm run migrate`, as the CI db-tests job does). Skips without it.
 * Every row it writes lives in a namespace unique to this run and is removed afterwards.
 */
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { kvCache } from "../../drizzle/schema";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("kvCache (Postgres)", () => {
  const savedDatabaseUrl = process.env.DATABASE_URL;
  const run = randomUUID().slice(0, 8);
  const NS = `test-${run}`;
  const OTHER_NS = `test2-${run}`;

  let kv: typeof import("./kvCache");
  let db: NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

  beforeAll(async () => {
    // getDb() reads DATABASE_URL on first use; point it at the scratch database only.
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    kv = await import("./kvCache");
    const got = await (await import("../db")).getDb();
    if (!got) throw new Error("TEST_DATABASE_URL is set but no database connection was made");
    db = got;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(kvCache).where(sql`${kvCache.namespace} in (${NS}, ${OTHER_NS})`);
      await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
    }
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
  });

  async function storedRow(key: string) {
    const rows = await db.select().from(kvCache).where(and(eq(kvCache.namespace, NS), eq(kvCache.key, key)));
    return rows[0];
  }

  it("set then get returns the same JSON value", async () => {
    const value = { hits: [{ title: "A", url: "https://a.example" }], n: 2, ok: true };
    await kv.kvSet(NS, "q:solar", value, 60);
    await expect(kv.kvGet(NS, "q:solar")).resolves.toEqual(value);
  });

  it("stores strings, numbers and arrays as JSON too", async () => {
    await kv.kvSet(NS, "str", "plain text", 60);
    await kv.kvSet(NS, "num", 42, 60);
    await kv.kvSet(NS, "arr", [1, "two"], 60);
    await expect(kv.kvGet(NS, "str")).resolves.toBe("plain text");
    await expect(kv.kvGet(NS, "num")).resolves.toBe(42);
    await expect(kv.kvGet(NS, "arr")).resolves.toEqual([1, "two"]);
  });

  it("a missing key is a miss", async () => {
    await expect(kv.kvGet(NS, "never-set")).resolves.toBeNull();
  });

  it("a second set overwrites the value and the expiry", async () => {
    await kv.kvSet(NS, "q:over", { v: 1 }, 60);
    const first = await storedRow("q:over");
    await kv.kvSet(NS, "q:over", { v: 2 }, 3600);
    const second = await storedRow("q:over");
    await expect(kv.kvGet(NS, "q:over")).resolves.toEqual({ v: 2 });
    expect(second.expiresAt.getTime()).toBeGreaterThan(first.expiresAt.getTime());
  });

  it("writes expires_at ttlSec from now", async () => {
    const before = Date.now();
    await kv.kvSet(NS, "q:ttl", { v: 1 }, 600);
    const row = await storedRow("q:ttl");
    // timestamp without time zone, written and read as UTC by drizzle; allow clock and rounding slack.
    expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 600_000 - 1_000);
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 600_000 + 1_000);
  });

  it("an expired row is a miss even before the sweep deletes it", async () => {
    await kv.kvSet(NS, "q:old", { v: "stale" }, 60);
    await db
      .update(kvCache)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(and(eq(kvCache.namespace, NS), eq(kvCache.key, "q:old")));
    await expect(kv.kvGet(NS, "q:old")).resolves.toBeNull();
    expect(await storedRow("q:old")).toBeDefined();
  });

  it("a short ttl expires on its own", async () => {
    await kv.kvSet(NS, "q:short", { v: 1 }, 1);
    await expect(kv.kvGet(NS, "q:short")).resolves.toEqual({ v: 1 });
    await new Promise((r) => setTimeout(r, 1_200));
    await expect(kv.kvGet(NS, "q:short")).resolves.toBeNull();
  });

  it("a key over 128 characters round-trips through its sha256 digest", async () => {
    const longKey = `https://example.com/article?${"x".repeat(300)}`;
    await kv.kvSet(NS, longKey, { title: "Long" }, 60);
    await expect(kv.kvGet(NS, longKey)).resolves.toEqual({ title: "Long" });
    const row = await storedRow(kv.kvStorageKey(longKey));
    expect(row.key).toHaveLength(64);
    expect(row.key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("namespaces keep the same key apart", async () => {
    await kv.kvSet(NS, "shared", { from: "a" }, 60);
    await kv.kvSet(OTHER_NS, "shared", { from: "b" }, 60);
    await expect(kv.kvGet(NS, "shared")).resolves.toEqual({ from: "a" });
    await expect(kv.kvGet(OTHER_NS, "shared")).resolves.toEqual({ from: "b" });
  });

  it("the sweep deletes expired rows and keeps live ones", async () => {
    await kv.kvSet(NS, "sweep:live", { v: 1 }, 3600);
    await kv.kvSet(NS, "sweep:dead", { v: 2 }, 3600);
    await db
      .update(kvCache)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(and(eq(kvCache.namespace, NS), eq(kvCache.key, "sweep:dead")));

    const removed = await kv.sweepExpiredKv();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await storedRow("sweep:dead")).toBeUndefined();
    expect(await storedRow("sweep:live")).toBeDefined();
  });
});
