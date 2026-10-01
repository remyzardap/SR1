import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Express } from "express";

// jobsTick.ts is mounted in _core/index.ts WITHOUT requireSession. The endpoint is
// therefore only as safe as its own header check. These tests drive the registered
// handler directly (fake Express app), asserting an unauthenticated caller can
// neither trigger nor read the job runner.

const jobs = vi.hoisted(() => ({ startJobRunner: vi.fn() }));
vi.mock("./jobs", () => jobs);

import { registerJobsTick } from "./jobsTick";

type Handler = (req: any, res: any) => Promise<void>;

function mount(): Handler {
  let handler: Handler | null = null;
  const app = {
    post: (route: string, h: Handler) => {
      expect(route).toBe("/api/jobs/tick");
      handler = h;
    },
  } as unknown as Express;
  registerJobsTick(app);
  if (!handler) throw new Error("registerJobsTick did not mount POST /api/jobs/tick");
  return handler;
}

function fakeRes() {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

const SECRET = "tick-secret-123";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.JOBS_TICK_SECRET;
  jobs.startJobRunner.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  if (saved === undefined) delete process.env.JOBS_TICK_SECRET;
  else process.env.JOBS_TICK_SECRET = saved;
});

describe("auth on POST /api/jobs/tick", () => {
  it("endpoint is 404 (not mounted in spirit) when JOBS_TICK_SECRET is unset", async () => {
    delete process.env.JOBS_TICK_SECRET;
    const h = mount();
    const res = fakeRes();
    await h({ header: () => SECRET, query: {} } as any, res);
    expect(res.statusCode).toBe(404);
    expect(jobs.startJobRunner).not.toHaveBeenCalled();
  });

  it("missing secret header => 401, runner never started", async () => {
    process.env.JOBS_TICK_SECRET = SECRET;
    const h = mount();
    const res = fakeRes();
    await h({ header: () => undefined, query: {} } as any, res);
    expect(res.statusCode).toBe(401);
    expect(jobs.startJobRunner).not.toHaveBeenCalled();
  });

  it("wrong secret => 401, including same-length near misses", async () => {
    process.env.JOBS_TICK_SECRET = SECRET;
    const h = mount();
    for (const bad of ["nope", "", SECRET.slice(0, -1) + "x", SECRET + "0"]) {
      const res = fakeRes();
      await h({ header: () => bad || undefined, query: {} } as any, res);
      expect(res.statusCode).toBe(401);
    }
    expect(jobs.startJobRunner).not.toHaveBeenCalled();
  });

  it("empty JOBS_TICK_SECRET env rejects every caller (no null-secret bypass)", async () => {
    process.env.JOBS_TICK_SECRET = "";
    const h = mount();
    const res = fakeRes();
    await h({ header: () => "", query: {} } as any, res);
    expect(res.statusCode).toBe(404); // falsy secret => endpoint reports as not existing
    expect(jobs.startJobRunner).not.toHaveBeenCalled();
  });
});

describe("authenticated behavior", () => {
  it("valid secret wakes the runner and holds the request for the wait window", async () => {
    process.env.JOBS_TICK_SECRET = SECRET;
    jobs.startJobRunner.mockResolvedValue({ id: 1 });
    const h = mount();
    const res = fakeRes();
    const p = h({ header: () => SECRET, query: { wait: "7" } } as any, res);
    await vi.advanceTimersByTimeAsync(6000);
    expect(res.body).toBeNull(); // still holding the connection open
    await vi.advanceTimersByTimeAsync(1500);
    await p;
    expect(jobs.startJobRunner).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeLessThanOrEqual(200); // success path sets no explicit status (express defaults 200)
    expect(res.body).toEqual({ ok: true, waitedSeconds: 7 });
  });

  it("wait is clamped to [0, 55] and garbage falls back to the 20s default", async () => {
    process.env.JOBS_TICK_SECRET = SECRET;
    jobs.startJobRunner.mockResolvedValue({ id: 1 });
    const h = mount();
    const cases: Array<[string, number]> = [["999", 55], ["-5", 0], ["abc", 20]];
    for (const [given, expected] of cases) {
      const res = fakeRes();
      const p = h({ header: () => SECRET, query: { wait: given } } as any, res);
      await vi.advanceTimersByTimeAsync(60_000);
      await p;
      expect(res.body).toEqual({ ok: true, waitedSeconds: expected });
    }
    // note: wait=0 is NOT expressible: Number("0") is falsy so the default 20 applies
    const res = fakeRes();
    const p = h({ header: () => SECRET, query: { wait: "0" } } as any, res);
    await vi.advanceTimersByTimeAsync(60_000);
    await p;
    expect(res.body).toEqual({ ok: true, waitedSeconds: 20 });
  });

  it("runner unavailable => 503, no hang", async () => {
    process.env.JOBS_TICK_SECRET = SECRET;
    jobs.startJobRunner.mockResolvedValue(null);
    const h = mount();
    const res = fakeRes();
    await h({ header: () => SECRET, query: { wait: "1" } } as any, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: "Job runner unavailable" });
  });

  it("the response leaks nothing about job contents or queue depth", async () => {
    process.env.JOBS_TICK_SECRET = SECRET;
    jobs.startJobRunner.mockResolvedValue({ id: 1 });
    const h = mount();
    const res = fakeRes();
    const p = h({ header: () => SECRET, query: { wait: "1" } } as any, res);
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(Object.keys(res.body).sort()).toEqual(["ok", "waitedSeconds"]);
  });
});
