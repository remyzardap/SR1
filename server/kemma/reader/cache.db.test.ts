/**
 * readPage's cache against a real Postgres: a page already in kv_cache (namespace "page") is
 * served without a fetch; interactive reads never touch it. Needs TEST_DATABASE_URL pointing at
 * a scratch database with the migrations applied. Skips without it.
 */
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { kvCache } from "../../../drizzle/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("reader cache (Postgres)", () => {
  const run = randomUUID().slice(0, 8);
  const url = `https://cache-test-${run}.example.com/article`;

  let savedDatabaseUrl: string | undefined;
  let reader: typeof import("./index");
  let db: NonNullable<Awaited<ReturnType<typeof import("../../db").getDb>>>;

  beforeAll(async () => {
    savedDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    reader = await import("./index");
    const got = await (await import("../../db")).getDb();
    if (!got) throw new Error("TEST_DATABASE_URL is set but no database connection was made");
    db = got;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(kvCache).where(sql`${kvCache.namespace} = 'page'`);
      await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
    }
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves a page already cached without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Prime the cache the same way a real tier-1 read would populate it.
    const cacheKey = reader.canonicalizeUrl(url);
    const stored = { finalUrl: url, title: "Cached Title", markdown: "Cached body text.", tier: 1 as const };
    const { kvSet } = await import("../../core/kvCache");
    await kvSet("page", cacheKey, stored, 3600);

    const result = await reader.readPage(url);
    expect(result.title).toBe("Cached Title");
    expect(fetchMock).not.toHaveBeenCalled();

    const rows = await db.select().from(kvCache).where(and(eq(kvCache.namespace, "page"), eq(kvCache.key, cacheKey)));
    expect(rows).toHaveLength(1);
  });
});
