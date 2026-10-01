/**
 * Batch 2 audit test, item 3: quotaCheck increments must be atomic (UPDATE SET
 * col = col + n evaluated by Postgres) and the first-message row creation must
 * survive the race of two concurrent inserts of the same user_quotas row.
 *
 * The fake db applies patches the way Postgres does: a plain value assigns; a
 * sql`${col} + ${n}` fragment is evaluated against the CURRENT stored row (not
 * the snapshot the caller read earlier); an insert whose row already exists
 * either throws a unique violation (plain insert) or is ignored
 * (onConflictDoNothing). The old read-modify-write code cannot pass this.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  row: null as any,
  readsGated: false,
  firstReadSeesNothing: false,
  readCount: 0,
  insertBehavior: [] as string[],
}));

const dialect = new PgDialect();

function isSqlFragment(v: any): boolean {
  return !!v && typeof v === "object" && "queryChunks" in v;
}

function applySet(patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (isSqlFragment(value)) {
      const rendered = dialect.sqlToQuery(value as never);
      const m = rendered.sql.match(/\+ \$1$/);
      if (!m) throw new Error(`fake db: unexpected SQL patch: ${rendered.sql}`);
      state.row[key] = (state.row[key] ?? 0) + Number(rendered.params[0]);
    } else {
      (state.row as any)[key] = value;
    }
  }
}

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          while (state.readsGated) await new Promise((r) => setTimeout(r, 5));
          state.readCount += 1;
          // Race simulation: the row exists in storage but is invisible to the
          // first read (another session is mid-insert).
          if (state.firstReadSeesNothing && state.readCount === 1) return [];
          return state.row ? [{ ...state.row }] : [];
        },
      }),
    }),
  }),
  insert: () => ({
    values: (v: any) => {
      const run = async (ignoreConflict: boolean) => {
        state.insertBehavior.push(ignoreConflict ? "onConflictDoNothing" : "plain");
        if (state.row) {
          if (ignoreConflict) return; // the concurrent creator's row stands
          const err: any = new Error("duplicate key value violates unique constraint");
          err.code = "23505";
          throw err;
        }
        state.row = {
          id: 1,
          userId: 7,
          tier: "free",
          messagesToday: 0,
          thinkPressesToday: 0,
          tokensToday: 0,
          agenticTasksThisMonth: 0,
          voiceMinutesThisMonth: 0,
          dailyResetAt: new Date(),
          monthlyResetAt: new Date(),
          trialEndsAt: null,
          hasByos: false,
          byosBonusTasks: 0,
          ...v,
        };
      };
      return {
        onConflictDoNothing: () => run(true),
        then: (res: any, rej: any) => run(false).then(res, rej),
      };
    },
  }),
  update: () => ({
    set: (patch: any) => ({
      where: async () => {
        if (!state.row) return;
        applySet(patch);
      },
    }),
  }),
};

vi.mock("../db", () => ({
  getDb: vi.fn(async () => fakeDb),
}));

import { incrementQuota, checkQuota } from "./quotaCheck";

function freshRow(patch: Record<string, unknown> = {}) {
  state.row = {
    id: 1,
    userId: 7,
    tier: "free",
    messagesToday: 0,
    thinkPressesToday: 0,
    tokensToday: 0,
    agenticTasksThisMonth: 0,
    voiceMinutesThisMonth: 0,
    dailyResetAt: new Date(),
    monthlyResetAt: new Date(),
    trialEndsAt: null,
    hasByos: false,
    byosBonusTasks: 0,
    ...patch,
  };
  state.readsGated = false;
  state.firstReadSeesNothing = false;
  state.readCount = 0;
  state.insertBehavior = [];
}

beforeEach(() => freshRow());

describe("incrementQuota atomicity", () => {
  it("two concurrent increments of the same counter both land", async () => {
    state.readsGated = true; // both calls park in getOrCreateQuota before either updates
    const p1 = incrementQuota(7, "message", 1);
    const p2 = incrementQuota(7, "message", 1);
    await new Promise((r) => setTimeout(r, 20)); // both reads have settled
    state.readsGated = false;
    await Promise.all([p1, p2]);
    // Old code: both read 0, both write literal 1. New code: col = col + 1 twice.
    expect(state.row.messagesToday).toBe(2);
  });

  it("SET carries a col + n SQL expression, not a precomputed literal", async () => {
    const patches: any[] = [];
    (fakeDb as any).update = () => ({
      set: (patch: any) => {
        patches.push(patch);
        return { where: async () => {} };
      },
    });
    await incrementQuota(7, "token", 150);
    expect(patches).toHaveLength(1);
    expect(isSqlFragment(patches[0].tokensToday)).toBe(true);
    const rendered = dialect.sqlToQuery(patches[0].tokensToday);
    expect(rendered.sql).toContain('"tokens_today" + $1');
    expect(Number(rendered.params[0])).toBe(150);
  });
});

describe("getOrCreateQuota race on the first message", () => {
  it("checkQuota survives a concurrent row insert instead of 23505", async () => {
    state.row = null;
    state.firstReadSeesNothing = true; // our read misses the row another session is creating
    await expect(checkQuota(7, "message")).resolves.toMatchObject({ allowed: true });
    expect(state.insertBehavior).toContain("onConflictDoNothing");
  });
});
