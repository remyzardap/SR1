/**
 * searchV2's L2 cache (kv_cache, namespace "search") against a real Postgres.
 *
 * Needs TEST_DATABASE_URL pointing at a scratch database with the migrations applied. Skips
 * without it. Proves an L1 (in-process) miss still avoids the upstream provider call when the
 * answer is in kv_cache — the case a fresh process (a new deploy, a second instance) hits.
 */
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { kvCache } from "../../../drizzle/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("searchV2 L2 cache (Postgres)", () => {
  let savedDatabaseUrl: string | undefined;
  let savedEnv: Map<string, string | undefined>;
  let db: NonNullable<Awaited<ReturnType<typeof import("../../db").getDb>>>;
  let searchV2: typeof import("./index").searchV2;
  let clearSearchV2Cache: typeof import("./cache").clearSearchV2Cache;

  const ENV_NAMES = ["BRAVE_SEARCH_API_KEY", "KEMMA_SEARCH_PROVIDERS", "KEMMA_SEARCH_CACHE_TTL_SEC"];

  beforeAll(async () => {
    savedDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    savedEnv = new Map(ENV_NAMES.map((n) => [n, process.env[n]]));
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    process.env.KEMMA_SEARCH_PROVIDERS = "brave";
    process.env.KEMMA_SEARCH_CACHE_TTL_SEC = "900";

    ({ searchV2 } = await import("./index"));
    ({ clearSearchV2Cache } = await import("./cache"));
    const got = await (await import("../../db")).getDb();
    if (!got) throw new Error("TEST_DATABASE_URL is set but no database connection was made");
    db = got;
  });

  afterAll(async () => {
    await db.delete(kvCache).where(sql`${kvCache.namespace} = 'search'`);
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    for (const [n, v] of savedEnv) if (v === undefined) delete process.env[n]; else process.env[n] = v;
  });

  beforeEach(() => {
    clearSearchV2Cache();
    vi.unstubAllGlobals();
  });

  it("serves an L2 (kv_cache) hit after an L1 miss, without calling the provider again", async () => {
    const query = `l2 db test ${randomUUID()}`;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ web: { results: [{ title: "A", url: "https://a.example", description: "d" }] } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await searchV2(query, {}, { userId: 1 });
    expect(first[0].url).toBe("https://a.example");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simulate a cold process: drop the in-process L1 cache, but kv_cache (L2) still has the row.
    clearSearchV2Cache();

    const second = await searchV2(query, {}, { userId: 1 });
    expect(second[0].url).toBe("https://a.example");
    expect(fetchMock).toHaveBeenCalledTimes(1); // no second upstream call
  });

  it("a kv_cache miss still goes upstream and then writes the row for next time", async () => {
    const query = `l2 miss test ${randomUUID()}`;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ web: { results: [{ title: "B", url: "https://b.example", description: "d" }] } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await searchV2(query, {}, { userId: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(kvCache).where(sql`${kvCache.namespace} = 'search'`);
    expect(rows.length).toBeGreaterThan(0);
  });
});
