import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// quotaCheck.ts against the QUOTA_LIMITS tier table in kemmaRouter.ts.
// Fake db emulates the single user_quotas row with the drizzle call chain used
// by the module; vitest fake timers control the UTC day/month boundaries.
// Patches are applied the way Postgres would: plain values assign, and a
// sql`col + n` fragment (atomic increment, batch-2 fix) is evaluated against
// the current stored row instead of assigning the fragment itself.
const dialect = new PgDialect();

function applyPatchToRow(patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && "queryChunks" in (value as any)) {
      const rendered = dialect.sqlToQuery(value as never);
      const m = rendered.sql.match(/\+ \$1$/);
      if (!m) throw new Error(`fake db: unexpected SQL patch: ${rendered.sql}`);
      (state.row as any)[key] = ((state.row as any)[key] ?? 0) + Number(rendered.params[0]);
    } else {
      (state.row as any)[key] = value;
    }
  }
}

const state = vi.hoisted(() => ({
  row: null as any,
  dbAvailable: true,
  updatePatches: [] as any[],
  insertValues: [] as any[],
  delaySelects: false,
}));

const dbh = vi.hoisted(() => ({
  getDb: vi.fn(async () => {
    if (!state.dbAvailable) return null;
    return fakeDb;
  }),
}));

vi.mock("../db", () => ({ getDb: dbh.getDb }));

function snapshot() {
  return state.row ? { ...state.row } : null;
}

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          if (state.delaySelects) { await Promise.resolve(); await Promise.resolve(); }
          return snapshot() ? [snapshot()] : [];
        },
      }),
    }),
  }),
  insert: () => ({
    values: (v: any) => {
      const run = async () => {
        state.insertValues.push(v);
        state.row = {
          id: 1,
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
          ...state.row,
          ...v,
        };
      };
      // The atomic-create path calls .onConflictDoNothing(); a bare await still works.
      return { onConflictDoNothing: run, then: (res: any) => run().then(res) };
    },
  }),
  update: () => ({
    set: (patch: any) => ({
      where: async () => {
        state.updatePatches.push(patch);
        if (state.delaySelects) { await Promise.resolve(); await Promise.resolve(); }
        applyPatchToRow(patch);
      },
    }),
  }),
};

import { checkQuota, incrementQuota, getQuotaSummary, activateTrial, setUserTier } from "./quotaCheck";
import { QUOTA_LIMITS } from "./kemmaRouter";

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

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
}

beforeEach(() => {
  vi.useFakeTimers();
  setNow("2026-02-15T10:00:00Z");
  state.row = null;
  state.dbAvailable = true;
  state.updatePatches = [];
  state.insertValues = [];
  state.delaySelects = false;
  freshRow();
  delete process.env.KEMMA_UNLIMITED_USER_IDS;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("free tier boundaries", () => {
  it("think is hard-blocked on free (0/day) even with zero usage", async () => {
    const r = await checkQuota(7, "think");
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(0);
    expect(r.reason).toMatch(/Pro or Max/);
  });

  it("plain messages are NOT blocked by the zero think limit: 20/day boundary", async () => {
    expect(QUOTA_LIMITS.free.msgsPerDay).toBe(20);
    freshRow({ messagesToday: 19 });
    let r = await checkQuota(7, "message");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
    freshRow({ messagesToday: 20 });
    r = await checkQuota(7, "message");
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.reason).toMatch(/Daily message limit/);
  });

  it("voice is zero on free and cannot even take amount=1", async () => {
    const r = await checkQuota(7, "voice_minute");
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(0);
  });

  it("agentic tasks: 3/month boundary, remaining floored at zero", async () => {
    freshRow({ agenticTasksThisMonth: 2 });
    expect((await checkQuota(7, "agentic_task")).allowed).toBe(true);
    freshRow({ agenticTasksThisMonth: 3 });
    const r = await checkQuota(7, "agentic_task");
    expect(r.allowed).toBe(false);
    freshRow({ agenticTasksThisMonth: 10 });
    expect((await checkQuota(7, "agentic_task")).remaining).toBe(0);
  });

  it("tokens accumulate per day: 50000 cap", async () => {
    freshRow({ tokensToday: 49_999 });
    expect((await checkQuota(7, "token", 1)).allowed).toBe(true);
    expect((await checkQuota(7, "token", 2)).allowed).toBe(false);
    freshRow({ tokensToday: 50_000 });
    expect((await checkQuota(7, "token")).allowed).toBe(false);
  });

  it("byos bonus tasks extend the monthly task limit", async () => {
    freshRow({ agenticTasksThisMonth: 3, byosBonusTasks: 5 });
    const r = await checkQuota(7, "agentic_task");
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(8);
  });
});

describe("UTC day and month rollover (fake timers)", () => {
  it("daily counters reset after UTC midnight, not local midnight", async () => {
    // row was reset at 09:00Z today with usage; advance 3h to 12:00Z same day: NO reset
    freshRow({ messagesToday: 20, tokensToday: 50_000, dailyResetAt: new Date("2026-02-15T09:00:00Z") });
    setNow("2026-02-15T12:00:00Z");
    expect((await checkQuota(7, "message")).allowed).toBe(false);
    // cross 00:00Z
    setNow("2026-02-16T00:05:00Z");
    const r = await checkQuota(7, "message");
    expect(r.allowed).toBe(true);
    expect(state.row.messagesToday).toBe(0);
    expect(state.row.tokensToday).toBe(0);
    // the reset persisted dailyResetAt
    expect(state.updatePatches.some((p) => "dailyResetAt" in p)).toBe(true);
  });

  it("resetAt in a check points at the NEXT UTC midnight", async () => {
    setNow("2026-02-15T23:30:00Z");
    const r = await checkQuota(7, "message");
    expect(r.resetAt.toISOString()).toBe("2026-02-16T00:00:00.000Z");
  });

  it("monthly counters reset on the 1st UTC", async () => {
    freshRow({ agenticTasksThisMonth: 3, monthlyResetAt: new Date("2026-02-10T00:00:00Z") });
    setNow("2026-03-01T00:01:00Z");
    const r = await checkQuota(7, "agentic_task");
    expect(r.allowed).toBe(true);
    expect(state.row.agenticTasksThisMonth).toBe(0);
    expect(r.resetAt.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("a row whose dailyResetAt is from the FUTURE same day does not reset (clock skew sanity)", async () => {
    freshRow({ messagesToday: 20, dailyResetAt: new Date("2026-02-15T23:00:00Z") });
    setNow("2026-02-15T10:00:00Z"); // earlier than reset (skew)
    expect((await checkQuota(7, "message")).allowed).toBe(false);
  });
});

describe("tier resolution incl. trial expiry", () => {
  it("active trial gets trial limits and getQuotaSummary reports daysLeft", async () => {
    freshRow({ tier: "trial", trialEndsAt: new Date("2026-02-18T00:00:00Z"), messagesToday: 100 });
    const r = await checkQuota(7, "message");
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(QUOTA_LIMITS.trial.msgsPerDay);
    const s = await getQuotaSummary(7);
    expect(s.tier).toBe("trial");
    expect(s.trial).not.toBeNull();
    expect(s.trial!.daysLeft).toBe(3);
  });

  it("an expired trial is downgraded to free inside checkQuota and think is then blocked", async () => {
    freshRow({ tier: "trial", trialEndsAt: new Date("2026-02-14T23:00:00Z"), thinkPressesToday: 0 });
    const r = await checkQuota(7, "think");
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(0); // free thinkPerDay
    expect(state.row.tier).toBe("free");
    expect(state.updatePatches.some((p) => p.tier === "free")).toBe(true);
  });

  it("pro and max tiers resolve to their table limits", async () => {
    freshRow({ tier: "pro" });
    expect((await checkQuota(7, "message")).limit).toBe(QUOTA_LIMITS.pro.msgsPerDay);
    freshRow({ tier: "max", messagesToday: 999 });
    let r = await checkQuota(7, "message");
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(1000);
    r = await checkQuota(7, "think");
    expect(r.limit).toBe(QUOTA_LIMITS.max.thinkPerDay);
  });

  it("KEMMA_UNLIMITED_USER_IDS bypasses everything for listed ids only", async () => {
    freshRow({ tier: "free", messagesToday: 10_000 });
    process.env.KEMMA_UNLIMITED_USER_IDS = "8, 9";
    expect((await checkQuota(7, "message")).allowed).toBe(false);
    expect((await checkQuota(9, "message")).allowed).toBe(true);
    expect((await checkQuota(9, "think")).allowed).toBe(true);
  });

  it("missing row is created as free, then enforced", async () => {
    state.row = null;
    const r = await checkQuota(7, "message");
    expect(r.limit).toBe(QUOTA_LIMITS.free.msgsPerDay);
    expect(state.insertValues).toEqual([{ userId: 7, tier: "free" }]);
  });

  it("db unavailable => fail-open (chat stays usable, quota skipped)", async () => {
    state.dbAvailable = false;
    const r = await checkQuota(7, "message");
    expect(r.allowed).toBe(true);
  });
});

describe("incrementQuota", () => {
  it("adds to the right column per action", async () => {
    freshRow();
    await incrementQuota(7, "message");
    expect(state.row.messagesToday).toBe(1);
    await incrementQuota(7, "message", 2);
    expect(state.row.messagesToday).toBe(3);
    await incrementQuota(7, "token", 1234);
    expect(state.row.tokensToday).toBe(1234);
    await incrementQuota(7, "agentic_task");
    expect(state.row.agenticTasksThisMonth).toBe(1);
    await incrementQuota(7, "think");
    expect(state.row.thinkPressesToday).toBe(1);
    await incrementQuota(7, "voice_minute", 2);
    expect(state.row.voiceMinutesThisMonth).toBe(2);
  });

  it("no-op without db", async () => {
    state.dbAvailable = false;
    await expect(incrementQuota(7, "message")).resolves.toBeUndefined();
  });

  it("concurrent increments both land (atomic SQL update, batch-2 fix)", async () => {
    state.delaySelects = true;
    freshRow({ messagesToday: 0 });
    await Promise.all([incrementQuota(7, "message"), incrementQuota(7, "message")]);
    // The old read-modify-write left 1 here; SET col = col + 1 applied twice gives 2.
    expect(state.row.messagesToday).toBe(2);
  });
});

describe("getQuotaSummary shape", () => {
  it("reports used/remaining/limit/resetAt for every surface", async () => {
    freshRow({ tier: "trial", messagesToday: 5, tokensToday: 10, agenticTasksThisMonth: 1, voiceMinutesThisMonth: 2, thinkPressesToday: 1, trialEndsAt: new Date("2026-02-20T00:00:00Z") });
    const s = await getQuotaSummary(7);
    expect(s.messages).toMatchObject({ used: 5, limit: 200, remaining: 195 });
    expect(s.tasks).toMatchObject({ used: 1, limit: 30 });
    expect(s.think).toMatchObject({ used: 1, remaining: 2 });
    expect(s.voice).toMatchObject({ used: 2, limit: 60 });
    expect(s.byos).toEqual({ enabled: false, bonusTasks: 0 });
  });

  it("does NOT apply trial expiry or counter resets (stale until a checkQuota runs) - documented gap", async () => {
    freshRow({ tier: "trial", trialEndsAt: new Date("2026-02-14T00:00:00Z"), messagesToday: 500 });
    setNow("2026-02-15T10:00:00Z");
    const s = await getQuotaSummary(7);
    // summary still claims trial with 500 used for "today", even though the trial
    // expired yesterday AND the day rolled over; the next checkQuota fixes both.
    expect(s.tier).toBe("trial");
    expect(s.messages.used).toBe(500);
    expect(s.messages.remaining).toBe(-300);
  });
});

describe("activateTrial / setUserTier", () => {
  it("activateTrial grants 7 days once and refuses a second grant", async () => {
    // Batch-2 fix (trial re-grant finding): trialStartedAt is a permanent marker.
    freshRow({ tier: "free", trialStartedAt: new Date("2026-01-01T00:00:00Z"), trialEndsAt: new Date("2026-01-08T00:00:00Z") });
    const granted = await activateTrial(7);
    expect(granted).toBe(false);
    expect(state.row.tier).toBe("free");
    expect(state.row.trialEndsAt).toEqual(new Date("2026-01-08T00:00:00Z"));
  });

  it("activateTrial grants on a fresh free row", async () => {
    freshRow({ tier: "free" });
    const granted = await activateTrial(7);
    expect(granted).toBe(true);
    expect(state.row.tier).toBe("trial");
    expect(state.row.trialEndsAt.getTime()).toBe(new Date("2026-02-22T10:00:00Z").getTime());
  });

  it("activateTrial inserts when no quota row exists yet", async () => {
    state.row = null;
    await activateTrial(7);
    expect(state.insertValues[0]).toMatchObject({ userId: 7, tier: "trial" });
  });

  it("setUserTier writes the tier verbatim with no validation", async () => {
    freshRow();
    await setUserTier(7, "max" as any);
    expect(state.row.tier).toBe("max");
  });
});
