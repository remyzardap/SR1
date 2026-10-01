/**
 * Batch 2 audit test, item 6: a trial is one per user (activateTrial refuses to
 * re-grant once trialStartedAt is set), and a row that claims tier "trial" but has
 * no trialEndsAt is treated as expired instead of lasting forever.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  row: null as any,
  insertValues: [] as any[],
}));

const dialect = new PgDialect();

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => (state.row ? [{ ...state.row }] : []),
      }),
    }),
  }),
  insert: () => ({
    values: (v: any) => {
      const run = async () => {
        state.insertValues.push(v);
        if (!state.row) {
          state.row = { id: 1, messagesToday: 0, thinkPressesToday: 0, tokensToday: 0, agenticTasksThisMonth: 0, voiceMinutesThisMonth: 0, ...v };
        }
      };
      return { onConflictDoNothing: run, then: (res: any) => run().then(res) };
    },
  }),
  update: () => ({
    set: (patch: any) => ({
      where: () =>
        Promise.resolve().then(() => {
          if (!state.row) return;
          for (const [key, value] of Object.entries(patch)) {
            if (value && typeof value === "object" && "queryChunks" in (value as any)) {
              const rendered = dialect.sqlToQuery(value as never);
              const m = rendered.sql.match(/\+ \$1$/);
              if (m) state.row[key] = (state.row[key] ?? 0) + Number(rendered.params[0]);
            } else {
              state.row[key] = value;
            }
          }
        }),
    }),
  }),
};

vi.mock("../db", () => ({ getDb: vi.fn(async () => fakeDb) }));

import { activateTrial, checkQuota } from "./quotaCheck";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-15T10:00:00Z"));
  state.insertValues = [];
  state.row = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trial is one per user", () => {
  it("first activation grants seven days", async () => {
    state.row = { id: 1, userId: 7, tier: "free", trialStartedAt: null, trialEndsAt: null, messagesToday: 0 };
    const granted = await activateTrial(7);
    expect(granted).toBe(true);
    expect(state.row.tier).toBe("trial");
    expect(state.row.trialStartedAt).toBeInstanceOf(Date);
    expect(state.row.trialEndsAt.getTime() - state.row.trialStartedAt.getTime()).toBe(7 * 24 * 3600 * 1000);
  });

  it("a downgraded (previously trialed) user can NOT re-grant", async () => {
    state.row = {
      id: 1,
      userId: 7,
      tier: "free",
      trialStartedAt: new Date("2026-01-01T00:00:00Z"),
      trialEndsAt: new Date("2026-01-08T00:00:00Z"),
      messagesToday: 0,
    };
    const granted = await activateTrial(7);
    expect(granted).toBe(false);
    expect(state.row.tier).toBe("free");
    expect(state.row.trialStartedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("a user with no quota row yet grants through the insert path", async () => {
    const granted = await activateTrial(9);
    expect(granted).toBe(true);
    expect(state.row.tier).toBe("trial");
  });
});

describe("null trialEndsAt on a trial row means expired", () => {
  it("checkQuota downgrades a stuck trial row to free instead of honoring it forever", async () => {
    state.row = {
      id: 1,
      userId: 7,
      tier: "trial",
      trialStartedAt: new Date("2026-02-01T00:00:00Z"),
      trialEndsAt: null,
      messagesToday: 0,
      thinkPressesToday: 0,
    };
    const res = await checkQuota(7, "think");
    expect(res.allowed).toBe(false); // free tier now: thinkPerDay 0
    expect(state.row.tier).toBe("free");
  });
});
