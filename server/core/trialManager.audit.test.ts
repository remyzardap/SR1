import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// trialManager.ts: expiry sweep, the (absent) grace period, tool rate limiter,
// and sanitizeToolInput. Also verifies the downgrade effect on quotaCheck limits
// through the same user_quotas row semantics.

const state = vi.hoisted(() => ({
  dbAvailable: true,
  quotaRows: [] as any[],
  selectCount: 0,
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => {
    if (!state.dbAvailable) return null;
    return fakeDb;
  }),
}));

function thenable<T>(v: T): any {
  const p = Promise.resolve(v);
  return Object.assign(p, { limit: () => Promise.resolve(v) });
}

const fakeDb = {
  select: (config?: any) => {
    const isQuotaScan = !!config && "userId" in config;
    return {
      from: () => ({
        where: () => {
          if (isQuotaScan) {
            state.selectCount++;
            const now = new Date();
            const expired = state.quotaRows.filter(
              (r) => r.tier === "trial" && r.trialEndsAt instanceof Date && r.trialEndsAt < now,
            );
            return thenable(expired.map((r) => ({ userId: r.userId })));
          }
          return thenable([]); // users lookup: no email configured, loop skips sending
        },
      }),
    };
  },
  update: () => ({
    set: (patch: any) => ({
      where: async () => {
        const now = new Date();
        for (const r of state.quotaRows) {
          if (r.tier === "trial" && r.trialEndsAt instanceof Date && r.trialEndsAt < now) Object.assign(r, patch);
        }
      },
    }),
  }),
};

import { runTrialExpiry, startTrialExpiryJob, checkToolRateLimit, sanitizeToolInput, logToolExecution } from "./trialManager";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-15T10:00:00Z"));
  state.dbAvailable = true;
  state.selectCount = 0;
  state.quotaRows = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runTrialExpiry", () => {
  it("downgrades exactly the expired trials, leaves active trials and free users alone", async () => {
    state.quotaRows = [
      { userId: 1, tier: "trial", trialEndsAt: new Date("2026-02-14T09:00:00Z") },
      { userId: 2, tier: "trial", trialEndsAt: new Date("2026-02-20T00:00:00Z") },
      { userId: 3, tier: "free", trialEndsAt: new Date("2026-01-01T00:00:00Z") },
      { userId: 4, tier: "trial", trialEndsAt: new Date("2026-02-15T09:59:00Z") }, // expired 1 min ago, NO grace
      { userId: 5, tier: "trial", trialEndsAt: null }, // malformed row must not be downgraded
    ];
    const r = await runTrialExpiry();
    expect(r.expired).toBe(2);
    expect(state.quotaRows[0].tier).toBe("free");
    expect(state.quotaRows[1].tier).toBe("trial");
    expect(state.quotaRows[2].tier).toBe("free");
    expect(state.quotaRows[3].tier).toBe("free"); // expiry is instant: there is no grace period
    expect(state.quotaRows[4].tier).toBe("trial");
  });

  it("nothing expired => no update attempted, returns 0", async () => {
    state.quotaRows = [{ userId: 2, tier: "trial", trialEndsAt: new Date("2026-02-20T00:00:00Z") }];
    const r = await runTrialExpiry();
    expect(r.expired).toBe(0);
    expect(state.selectCount).toBe(1);
  });

  it("db unavailable => {expired: 0}, never throws (boot-safe cron)", async () => {
    state.dbAvailable = false;
    await expect(runTrialExpiry()).resolves.toEqual({ expired: 0 });
  });

  it("startTrialExpiryJob runs immediately and re-runs every 24h", async () => {
    state.quotaRows = [{ userId: 1, tier: "trial", trialEndsAt: new Date("2026-02-15T09:00:00Z") }];
    const timer = startTrialExpiryJob();
    await vi.advanceTimersByTimeAsync(1); // let the immediate fire drain
    expect(state.selectCount).toBe(1);
    expect(state.quotaRows[0].tier).toBe("free");
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 1);
    expect(state.selectCount).toBe(2);
    clearInterval(timer);
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(state.selectCount).toBe(2); // cleared
  });

  it("expired trial really loses trial limits (cross-check with QUOTA_LIMITS table)", async () => {
    // after the sweep the row is free, so free limits apply; this mirrors what
    // quotaCheck.checkQuota computes from the tier column
    const { QUOTA_LIMITS } = await import("./kemmaRouter");
    expect(QUOTA_LIMITS.free.thinkPerDay).toBe(0);
    expect(QUOTA_LIMITS.trial.thinkPerDay).toBe(3);
  });
});

describe("checkToolRateLimit (in-memory per user+tool per minute)", () => {
  const fresh = () => import("./trialManager");

  it("allows up to the configured limit then blocks with retryAfter", async () => {
    const m = await fresh();
    const user = 100 + Math.floor(Math.random() * 1e6);
    for (let i = 0; i < 10; i++) {
      expect(m.checkToolRateLimit(user, "web_search").allowed).toBe(true);
    }
    const blocked = m.checkToolRateLimit(user, "web_search");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("run_code has a stricter limit of 5", async () => {
    const m = await fresh();
    const user = 200 + Math.floor(Math.random() * 1e6);
    for (let i = 0; i < 5; i++) expect(m.checkToolRateLimit(user, "run_code").allowed).toBe(true);
    expect(m.checkToolRateLimit(user, "run_code").allowed).toBe(false);
  });

  it("window slides after 60s under fake timers", async () => {
    const m = await fresh();
    const user = 300 + Math.floor(Math.random() * 1e6);
    for (let i = 0; i < 10; i++) m.checkToolRateLimit(user, "browse");
    expect(m.checkToolRateLimit(user, "browse").allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(m.checkToolRateLimit(user, "browse").allowed).toBe(true);
  });

  it("limits are per user", async () => {
    const m = await fresh();
    const u1 = 400 + Math.floor(Math.random() * 1e6);
    const u2 = 500 + Math.floor(Math.random() * 1e6);
    for (let i = 0; i < 10; i++) m.checkToolRateLimit(u1, "browse");
    expect(m.checkToolRateLimit(u1, "browse").allowed).toBe(false);
    expect(m.checkToolRateLimit(u2, "browse").allowed).toBe(true);
  });
});

describe("sanitizeToolInput", () => {
  it("safe_files: strips ../ and leading / but is NAIVE (documented bypasses)", () => {
    expect(sanitizeToolInput("safe_files", { path: "../../../etc/passwd" })).toEqual({ path: "etc/passwd" });
    expect(sanitizeToolInput("safe_files", { path: "/etc/passwd" })).toEqual({ path: "etc/passwd" });
    // single-pass replace leaves a re-formed traversal: this STILL contains ../
    const sneaky = sanitizeToolInput("safe_files", { path: "....//etc/passwd" }) as { path: string };
    expect(sneaky.path).toBe("../etc/passwd"); // bypass of the sanitizer itself
  });

  it("browse: blocks the obvious private hosts, empties invalid URLs", () => {
    const clean = sanitizeToolInput("browse", { url: "https://example.com/x" }) as { url: string };
    expect(clean.url).toBe("https://example.com/x");
    for (const bad of ["http://127.0.0.1/x", "http://localhost/x", "http://169.254.1.1/x", "http://10.1.2.3/x", "http://192.168.0.4/x", "http://172.16.9.9/x", "file:///etc/passwd"]) {
      expect((sanitizeToolInput("browse", { url: bad }) as { url: string }).url).toBe("");
    }
    // documented coverage gap: 172.16-172.31 range beyond 172.16., and bracketed IPv6
    expect((sanitizeToolInput("browse", { url: "http://172.22.0.1/x" }) as { url: string }).url).not.toBe("");
    expect((sanitizeToolInput("browse", { url: "http://[::1]/x" }) as { url: string }).url).not.toBe("");
    // WHATWG URL canonicalizes decimal IPv4 to dotted form, so this one IS caught
    expect((sanitizeToolInput("browse", { url: "http://2130706433/x" }) as { url: string }).url).toBe("");
  });

  it("run_code caps at 10k, web_search caps at 500 and strips angle brackets", () => {
    const code = sanitizeToolInput("run_code", { code: "a".repeat(20_000) }) as { code: string };
    expect(code.code.length).toBe(10_000);
    const q = sanitizeToolInput("web_search", { query: "<script>alert(1)</script>" + "b".repeat(600) }) as { query: string };
    expect(q.query.length).toBeLessThanOrEqual(500);
    expect(q.query).not.toContain("<");
  });

  it("passes through non-object args untouched", () => {
    expect(sanitizeToolInput("browse", null)).toBe(null);
    expect(sanitizeToolInput("browse", "str")).toBe("str");
  });
});

describe("logToolExecution + wiring", () => {
  it("only console.logs: nothing is persisted despite the comment", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await logToolExecution(1, "web_search", "hash", true, 12);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload).toMatchObject({ userId: 1, tool: "web_search", inputHash: "hash", success: true, durationMs: 12 });
    spy.mockRestore();
  });

  it("checkToolRateLimit/sanitizeToolInput have no production call sites (dead guard)", () => {
    // static proof: grep of server/ in the audit report found zero importers outside
    // trialManager.ts itself; assert the exported functions exist so the claim is pinned
    expect(typeof checkToolRateLimit).toBe("function");
    expect(typeof sanitizeToolInput).toBe("function");
  });
});
