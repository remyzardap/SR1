import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests without a database: key hashing, argument checks, and the "never fail the caller"
// paths. kvCache.db.test.ts runs the real SQL against TEST_DATABASE_URL.

const dbState = vi.hoisted(() => ({ db: null as any }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => dbState.db) }));

import { MAX_KEY_CHARS, kvGet, kvSet, kvStorageKey, sweepExpiredKv } from "./kvCache";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** A drizzle-shaped fake that records calls; each terminal step runs `impl`. */
function fakeDb(impl: { read?: () => unknown; write?: () => unknown; remove?: () => unknown } = {}) {
  const calls: { values?: any; conflict?: any } = {};
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (impl.read ? impl.read() : []) }) }) }),
    insert: () => ({
      values: (values: any) => {
        calls.values = values;
        return {
          onConflictDoUpdate: async (conflict: any) => {
            calls.conflict = conflict;
            return impl.write ? impl.write() : undefined;
          },
        };
      },
    }),
    delete: () => ({ where: async () => (impl.remove ? impl.remove() : { rowCount: 0 }) }),
  };
  return { db, calls };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  dbState.db = null;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("kvStorageKey", () => {
  it("keeps keys up to 128 characters as they are", () => {
    expect(kvStorageKey("q:weather jakarta")).toBe("q:weather jakarta");
    const exact = "k".repeat(MAX_KEY_CHARS);
    expect(kvStorageKey(exact)).toBe(exact);
  });

  it("stores a key longer than 128 characters as its sha256 hex digest", () => {
    const long = "k".repeat(MAX_KEY_CHARS + 1);
    expect(kvStorageKey(long)).toBe(sha256(long));
    expect(kvStorageKey(long)).toHaveLength(64);
  });

  it("hashes deterministically and keeps different long keys apart", () => {
    const a = `https://example.com/${"a".repeat(200)}`;
    const b = `https://example.com/${"a".repeat(199)}b`;
    expect(kvStorageKey(a)).toBe(kvStorageKey(a));
    expect(kvStorageKey(a)).not.toBe(kvStorageKey(b));
  });

  it("rejects an empty key", () => {
    expect(() => kvStorageKey("")).toThrow(/non-empty/);
  });
});

describe("argument checks", () => {
  it("rejects an empty or over-long namespace", async () => {
    await expect(kvGet("", "k")).rejects.toThrow(/namespace/);
    await expect(kvGet("n".repeat(33), "k")).rejects.toThrow(/namespace/);
    await expect(kvSet("n".repeat(33), "k", 1, 60)).rejects.toThrow(/namespace/);
  });

  it("refuses null and undefined values, which would read back as a miss", async () => {
    await expect(kvSet("search", "k", null, 60)).rejects.toThrow(/null and undefined/);
    await expect(kvSet("search", "k", undefined, 60)).rejects.toThrow(/null and undefined/);
  });

  it("stores nothing for a ttl of 0, a negative ttl or NaN", async () => {
    const { db, calls } = fakeDb();
    dbState.db = db;
    await kvSet("search", "k", { a: 1 }, 0);
    await kvSet("search", "k", { a: 1 }, -5);
    await kvSet("search", "k", { a: 1 }, Number.NaN);
    expect(calls.values).toBeUndefined();
  });
});

describe("writes", () => {
  it("upserts the hashed key with an expiry ttlSec from now", async () => {
    const { db, calls } = fakeDb();
    dbState.db = db;
    const long = "q".repeat(300);
    const before = Date.now();
    await kvSet("page", long, { title: "T" }, 3600);
    expect(calls.values).toMatchObject({ namespace: "page", key: sha256(long), value: { title: "T" } });
    const expires = (calls.values.expiresAt as Date).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 3600_000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 3600_000);
    expect(calls.conflict.set).toMatchObject({ value: { title: "T" } });
  });
});

describe("the cache never fails its caller", () => {
  it("without a database: get is a miss, set is a no-op", async () => {
    await expect(kvGet("search", "k")).resolves.toBeNull();
    await expect(kvSet("search", "k", 1, 60)).resolves.toBeUndefined();
  });

  it("a read error is a miss, logged with the namespace but not the key", async () => {
    dbState.db = fakeDb({ read: () => { throw new Error("connection reset"); } }).db;
    await expect(kvGet("search", "secret query text")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).toContain("search");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret query text");
  });

  it("a write error resolves, logged without the key or the value", async () => {
    dbState.db = fakeDb({ write: () => { throw new Error("disk full"); } }).db;
    await expect(kvSet("page", "secret-url", { body: "secret page text" }, 60)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("secret-url");
    expect(logged).not.toContain("secret page text");
  });

  it("returns the stored value on a hit", async () => {
    dbState.db = fakeDb({ read: () => [{ value: { hits: [1, 2] } }] }).db;
    await expect(kvGet("search", "k")).resolves.toEqual({ hits: [1, 2] });
  });
});

describe("sweepExpiredKv", () => {
  it("returns the number of rows deleted", async () => {
    dbState.db = fakeDb({ remove: () => ({ rowCount: 7 }) }).db;
    await expect(sweepExpiredKv()).resolves.toBe(7);
  });

  it("throws without a database, so the job run is marked failed", async () => {
    await expect(sweepExpiredKv()).rejects.toThrow(/Database unavailable/);
  });
});
