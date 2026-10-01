import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// db/betaInvites.ts builds queries through the drizzle client returned by
// ../db getDb(). The fake below records set/where arguments and lets each test
// script what the UPDATE ... RETURNING returns, which is exactly where the
// redemption race is decided.
const dbh = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
vi.mock("../db", () => dbh);

import { useBetaInviteCode, generateBetaInviteCode, getAllBetaInviteCodes, deactivateBetaInviteCode } from "./betaInvites";

type CapturedCall = { kind: string; where?: unknown; values?: Record<string, unknown>; set?: Record<string, unknown> };

function makeFakeDb() {
  const captured: CapturedCall[] = [];
  const state = {
    results: [] as unknown[][],
    rows: [] as unknown[],
    // rows returned by UPDATE ... RETURNING, consumed per claim attempt
    claimResults: [] as unknown[][],
  };
  function chain(kind: string): any {
    let sawReturning = false;
    const api: any = {
      from: () => api,
      where: (c?: unknown) => {
        captured.push({ kind, where: c });
        return api;
      },
      orderBy: () => api,
      limit: () => api,
      values: (v: Record<string, unknown>) => {
        captured.push({ kind, values: v });
        return api;
      },
      set: (v: Record<string, unknown>) => {
        captured.push({ kind, set: v });
        return api;
      },
      returning: () => {
        sawReturning = true;
        return api;
      },
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
        let rows: unknown;
        if (kind === "select") {
          rows = state.results.length > 0 ? state.results.shift() : state.rows;
        } else if (kind === "update" && sawReturning) {
          rows = state.claimResults.length > 0 ? state.claimResults.shift() : [];
        } else {
          rows = state.rows;
        }
        return Promise.resolve(rows ?? []).then(onF, onR);
      },
    };
    return api;
  }
  return {
    captured,
    state,
    select: () => chain("select"),
    update: () => chain("update"),
    insert: () => chain("insert"),
  };
}

let fake: ReturnType<typeof makeFakeDb>;
const dialect = new PgDialect();

function inviteRow(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    code: "ABCDEFGHJKLM",
    createdBy: 1,
    usedBy: null,
    maxUses: null,
    usageCount: 0,
    expiresAt: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeDb();
  dbh.getDb.mockResolvedValue(fake);
});

describe("useBetaInviteCode: validation order and case handling", () => {
  it("unknown code is invalid; lookup uppercases the caller input", async () => {
    fake.state.results = [[]];
    const res = await useBetaInviteCode("abcdefghjklm", 5);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/invalid/i);
    const rendered = dialect.sqlToQuery(fake.captured[0].where as never);
    expect(rendered.params).toEqual(["ABCDEFGHJKLM"]);
    expect(rendered.sql).toContain('"beta_invite_codes"."code"');
  });

  it("surrounding whitespace is trimmed before lookup", async () => {
    fake.state.results = [[]];
    await useBetaInviteCode("  abcdefghjklm  ", 5);
    const rendered = dialect.sqlToQuery(fake.captured[0].where as never);
    expect(rendered.params).toEqual(["ABCDEFGHJKLM"]);
  });

  it("deactivated code cannot be redeemed and writes nothing", async () => {
    fake.state.results = [[inviteRow({ isActive: false })]];
    const res = await useBetaInviteCode("ABCDEFGHJKLM", 5);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/no longer active/i);
    expect(fake.captured.some((c) => c.kind === "update")).toBe(false);
  });

  it("expired code cannot be redeemed and writes nothing", async () => {
    fake.state.results = [[inviteRow({ expiresAt: new Date(Date.now() - 1000) })]];
    const res = await useBetaInviteCode("ABCDEFGHJKLM", 5);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/expired/i);
    expect(fake.captured.some((c) => c.kind === "update")).toBe(false);
  });

  it("pre-check: exhausted maxUses is rejected before attempting the claim", async () => {
    fake.state.results = [[inviteRow({ maxUses: 2, usageCount: 2 })]];
    const res = await useBetaInviteCode("ABCDEFGHJKLM", 5);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/usage limit/i);
  });
});

describe("useBetaInviteCode: redemption race is closed by one atomic claim", () => {
  it("a successful claim is a single UPDATE whose WHERE re-checks every limit", async () => {
    fake.state.results = [[inviteRow({ maxUses: 1 })]];
    fake.state.claimResults = [[{ id: "c1" }]];
    const res = await useBetaInviteCode("ABCDEFGHJKLM", 5);
    expect(res).toEqual({ valid: true });
    const claimWhere = fake.captured.find((c) => c.kind === "update" && c.where !== undefined);
    expect(claimWhere).toBeTruthy();
    const rendered = dialect.sqlToQuery(claimWhere!.where as never);
    // guard conditions: still active, not expired, and below the usage limit,
    // so the decision is made by Postgres, not by an earlier read
    expect(rendered.sql).toContain('"beta_invite_codes"."isActive"');
    expect(rendered.params).toContain(true);
    expect(rendered.sql).toMatch(/"expiresAt" is null|"expiresAt" > /);
    expect(rendered.sql).toMatch(/"maxUses" is null|"usageCount" < "maxUses"/);
    expect(rendered.params).toContain("c1");
    const claimSet = fake.captured.find((c) => c.kind === "update" && c.set !== undefined);
    expect((claimSet!.set as Record<string, unknown>).usedBy).toBe(5);
    const setSql = dialect.sqlToQuery((claimSet!.set as Record<string, unknown>).usageCount as never);
    expect(setSql.sql).toContain('"beta_invite_codes"."usageCount" + 1');
    expect(setSql.sql).not.toMatch(/usage_count/);
  });

  it("the loser of two concurrent redemptions of a one-use code gets valid:false", async () => {
    // Both requests read the row while usageCount is still 0 (max 1). The atomic
    // UPDATE RETURNING grants only the first claim and returns no row for the second.
    fake.state.results = [[inviteRow({ maxUses: 1 })], [inviteRow({ maxUses: 1 })]];
    fake.state.claimResults = [[{ id: "c1" }], []];
    const [a, b] = await Promise.all([
      useBetaInviteCode("ABCDEFGHJKLM", 10),
      useBetaInviteCode("ABCDEFGHJKLM", 11),
    ]);
    const results = [a, b].sort((x, y) => (x.valid === y.valid ? 0 : x.valid ? -1 : 1));
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[1].reason).toMatch(/limit|available/i);
  });

  it("usageCount increment is computed by SQL, not from the stale read", async () => {
    fake.state.results = [[inviteRow({ maxUses: 5, usageCount: 1 })]];
    fake.state.claimResults = [[{ id: "c1" }]];
    await useBetaInviteCode("ABCDEFGHJKLM", 5);
    const claim = fake.captured.find((c) => c.kind === "update" && c.set !== undefined);
    const set = claim!.set as Record<string, unknown>;
    expect(typeof set.usageCount).not.toBe("number"); // must be an SQL expression
    expect(set.usedBy).toBe(5);
  });
});

describe("db availability failures are explicit, not TypeErrors", () => {
  it("generateBetaInviteCode without a db throws a clear Error, not a null-deref", async () => {
    dbh.getDb.mockResolvedValue(null);
    await expect(generateBetaInviteCode(1, {})).rejects.toThrow(/database not available/i);
  });

  it("useBetaInviteCode with no db returns open access today (documented risk)", async () => {
    dbh.getDb.mockResolvedValue(null);
    const res = await useBetaInviteCode("ANY", 1);
    expect(res).toEqual({ valid: true });
  });

  it("helpers degrade to empty results without a db", async () => {
    dbh.getDb.mockResolvedValue(null);
    expect(await getAllBetaInviteCodes()).toEqual([]);
    await expect(deactivateBetaInviteCode("c1")).resolves.toBeUndefined();
  });
});
