import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({
  clearMonitorSchedule: vi.fn(),
  countMonitors: vi.fn(),
  createMonitor: vi.fn(),
  getMonitor: vi.fn(),
  insertMonitorRun: vi.fn(),
  listMonitorRuns: vi.fn(),
  listMonitors: vi.fn(),
  markMonitorRun: vi.fn(),
  removeMonitor: vi.fn(),
  setActiveMonitor: vi.fn(),
  serializeMonitor: vi.fn((row: unknown) => row),
}));
const jobs = vi.hoisted(() => ({ enqueueJob: vi.fn(), registerJob: vi.fn() }));
const engine = vi.hoisted(() => ({ kemmaExecute: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn() }));

vi.mock("../../lib/fnStore", () => store);
vi.mock("../../core/jobs", () => jobs);
vi.mock("../../kemma/engine", () => engine);
vi.mock("../../core/quotaCheck", () => quota);

import {
  FREQUENCIES,
  MAX_MONITORS_PER_USER,
  buildResearchPrompt,
  delaySecondsUntil,
  handleMonitors,
  intervalSeconds,
  nextRunTime,
  registerMonitorJobs,
  researchTopic,
} from "./monitors";

const DAY = 86400;

const owned = {
  id: "m-1",
  userId: 7,
  topic: "Nickel export policy",
  frequency: "weekly",
  active: true,
  nextRunAt: new Date("2026-10-02T10:00:00.000Z"),
  lastRunAt: null,
  createdAt: new Date("2026-09-25T10:00:00.000Z"),
  updatedAt: new Date("2026-09-25T10:00:00.000Z"),
};

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const request = (body: unknown) => ({ body } as never);

beforeEach(() => {
  vi.clearAllMocks();
  jobs.enqueueJob.mockResolvedValue("job-1");
  store.countMonitors.mockResolvedValue(0);
  store.getMonitor.mockResolvedValue(owned);
  store.createMonitor.mockResolvedValue(owned);
  store.listMonitors.mockResolvedValue([]);
  store.listMonitorRuns.mockResolvedValue([]);
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  engine.kemmaExecute.mockResolvedValue({
    response: "## Overview\nNothing changed.",
    sources: [
      { id: 1, url: "https://example.com/a", title: "Source A" },
      { id: 2, url: "", title: "No url" },
    ],
  });
});

describe("cadence", () => {
  it("offers only the frequencies Monitors.tsx has buttons for", () => {
    expect(FREQUENCIES).toEqual(["daily", "weekly"]);
  });

  it("spaces runs by the frequency", () => {
    expect(intervalSeconds("daily")).toBe(DAY);
    expect(intervalSeconds("weekly")).toBe(DAY * 7);
    const at = new Date("2026-09-25T10:00:00.000Z");
    expect(nextRunTime(at, "daily")).toEqual(new Date("2026-09-26T10:00:00.000Z"));
    expect(nextRunTime(at, "weekly")).toEqual(new Date("2026-10-02T10:00:00.000Z"));
  });

  it("never queues in the past", () => {
    const now = new Date("2026-09-25T10:00:00.000Z");
    expect(delaySecondsUntil(new Date(now.getTime() + 5000), now)).toBe(5);
    expect(delaySecondsUntil(new Date(now.getTime() - 60000), now)).toBe(1);
  });
});

describe("create", () => {
  it("stores the topic, arms the first run and queues it", async () => {
    const res = fakeRes();
    await handleMonitors(7, request({ action: "create", topic: "Nickel export policy", frequency: "daily" }), res as never);
    expect(store.createMonitor).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, topic: "Nickel export policy", frequency: "daily" })
    );
    expect(jobs.enqueueJob).toHaveBeenCalledWith("monitor-run", expect.objectContaining({ monitorId: expect.any(String), userId: 7 }), {
      startAfterSeconds: expect.any(Number),
    });
    expect(res.body).toMatchObject({ ok: true });
  });

  it("caps one user at 20 monitors", async () => {
    store.countMonitors.mockResolvedValueOnce(MAX_MONITORS_PER_USER);
    await expect(
      handleMonitors(7, request({ action: "create", topic: "Another topic", frequency: "weekly" }), fakeRes() as never)
    ).rejects.toMatchObject({ status: 429 });
    expect(store.createMonitor).not.toHaveBeenCalled();
  });

  it("refuses a topic the client would not send and a cadence it does not offer", async () => {
    await expect(handleMonitors(7, request({ action: "create", topic: "ab", frequency: "daily" }), fakeRes() as never)).rejects.toThrow(
      "Topic is too short."
    );
    await expect(handleMonitors(7, request({ action: "create", topic: "nickel", frequency: "hourly" }), fakeRes() as never)).rejects.toThrow(
      "Frequency is not valid."
    );
    expect(store.countMonitors).not.toHaveBeenCalled();
  });
});

describe("setActive and remove are scoped to the owner", () => {
  it("404s on a monitor that is not the caller's", async () => {
    store.getMonitor.mockResolvedValueOnce(null);
    await expect(handleMonitors(8, request({ action: "setActive", id: "m-1", active: false }), fakeRes() as never)).rejects.toMatchObject({
      status: 404,
    });
    expect(store.setActiveMonitor).not.toHaveBeenCalled();

    store.getMonitor.mockResolvedValueOnce(null);
    await expect(handleMonitors(8, request({ action: "remove", id: "m-1" }), fakeRes() as never)).rejects.toMatchObject({ status: 404 });
    expect(store.removeMonitor).not.toHaveBeenCalled();
  });

  it("pausing clears the schedule and does not queue a job", async () => {
    const res = fakeRes();
    await handleMonitors(7, request({ action: "setActive", id: "m-1", active: false }), res as never);
    expect(store.setActiveMonitor).toHaveBeenCalledWith(7, "m-1", false, null);
    expect(jobs.enqueueJob).not.toHaveBeenCalled();
    expect(res.body).toEqual({ ok: true, id: "m-1", active: false });
  });

  it("resuming clears the pause and re-arms the chain", async () => {
    await handleMonitors(7, request({ action: "setActive", id: "m-1", active: true }), fakeRes() as never);
    expect(store.setActiveMonitor).toHaveBeenCalledWith(7, "m-1", true, expect.any(Date));
    expect(jobs.enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("remove passes the caller's id to the delete", async () => {
    await handleMonitors(7, request({ action: "remove", id: "m-1" }), fakeRes() as never);
    expect(store.removeMonitor).toHaveBeenCalledWith(7, "m-1");
  });
});

describe("the monitor job handler", () => {
  it("runs only the slot the monitor is actually armed for", async () => {
    registerMonitorJobs();
    const handler = jobs.registerJob.mock.calls[0][1] as (data: Record<string, unknown>) => Promise<void>;

    await handler({ monitorId: "m-1", userId: 7, scheduledFor: owned.nextRunAt.getTime() + 60_000 });
    expect(engine.kemmaExecute).not.toHaveBeenCalled();

    await handler({ monitorId: "m-1", userId: 7, scheduledFor: owned.nextRunAt.getTime() });
    expect(engine.kemmaExecute).toHaveBeenCalledTimes(1);
    expect(store.insertMonitorRun).toHaveBeenCalledWith(
      expect.objectContaining({ monitorId: "m-1", userId: 7, report: expect.any(String), sources: expect.any(Array) })
    );
    expect(store.markMonitorRun).toHaveBeenCalledWith(7, "m-1", expect.any(Date), expect.any(Date));
  });

  it("does nothing for a paused or foreign monitor", async () => {
    registerMonitorJobs();
    const handler = jobs.registerJob.mock.calls[0][1] as (data: Record<string, unknown>) => Promise<void>;

    store.getMonitor.mockResolvedValueOnce({ ...owned, active: false });
    await handler({ monitorId: "m-1", userId: 7, scheduledFor: owned.nextRunAt.getTime() });

    store.getMonitor.mockResolvedValueOnce(null);
    await handler({ monitorId: "m-1", userId: 8, scheduledFor: owned.nextRunAt.getTime() });

    expect(engine.kemmaExecute).not.toHaveBeenCalled();
    await handler({ monitorId: "", userId: 0 });
    expect(store.getMonitor).not.toHaveBeenCalledWith("", 0);
  });

  it("clears the schedule when a run fails", async () => {
    registerMonitorJobs();
    const handler = jobs.registerJob.mock.calls[0][1] as (data: Record<string, unknown>) => Promise<void>;
    engine.kemmaExecute.mockRejectedValueOnce(new Error("boom"));

    await handler({ monitorId: "m-1", userId: 7, scheduledFor: owned.nextRunAt.getTime() });
    expect(store.clearMonitorSchedule).toHaveBeenCalledWith(7, "m-1");
    expect(store.insertMonitorRun).not.toHaveBeenCalled();
  });
});

describe("researchTopic", () => {
  it("keeps cited sources and caps both the report and the list", async () => {
    engine.kemmaExecute.mockResolvedValueOnce({
      response: "x".repeat(30000),
      sources: Array.from({ length: 40 }, (_unused, i) => ({ id: i, url: `https://example.com/${i}`, title: `S${i}` })),
    });
    const out = await researchTopic(7, "Nickel export policy");
    expect(out.report).toHaveLength(20000);
    expect(out.sources).toHaveLength(15);
    expect(out.sources[0]).toEqual({ title: "S0", url: "https://example.com/0" });
  });

  it("fails rather than filing an empty briefing", async () => {
    engine.kemmaExecute.mockResolvedValueOnce({ response: "   ", sources: [] });
    await expect(researchTopic(7, "Nickel export policy")).rejects.toThrow("The briefing came back empty.");
  });

  it("runs the engine with web tools only, on the caller's tier", async () => {
    await researchTopic(7, "Nickel export policy");
    expect(engine.kemmaExecute).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, tier: "pro", allowedTools: ["web_search", "browse"] }));
  });

  it("names the topic in the prompt", () => {
    expect(buildResearchPrompt("Nickel export policy")).toContain("Nickel export policy");
  });
});
