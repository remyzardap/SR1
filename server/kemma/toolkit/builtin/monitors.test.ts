/**
 * P1-12 part 2: the monitor tool's contract.
 *
 * `create_monitor` creates a scheduled research monitor backed by the same store
 * and job queue as /api/fn/monitors, with the same limits and audit logging.
 *
 * The store and job queue are mocked so no database is needed.
 * The rate limit (MAX_MONITORS_PER_USER) is checked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fnStore = vi.hoisted(() => ({
  countMonitors: vi.fn(),
  createMonitor: vi.fn(),
}));

vi.mock("../../../lib/fnStore", () => fnStore);

const fnMonitors = vi.hoisted(() => ({
  FREQUENCIES: ["daily", "weekly"],
  MAX_MONITORS_PER_USER: 20,
  MAX_TOPIC_CHARS: 200,
  scheduleRun: vi.fn(),
}));

vi.mock("../../../routes/fn/monitors", () => fnMonitors);

const audit = vi.hoisted(() => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("../../../middleware/audit-logging", () => audit);

import { registerMonitorTools } from "./monitors";
import { getToolSpec, runTool, toolsFor, __resetRegistryForTests } from "../registry";
import type { ToolContext } from "../types";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 7,
    runId: "r-monitor",
    sessionId: "session-123",
    tier: "trial",
    signal: new AbortController().signal,
    emit: vi.fn(),
    ...overrides,
  };
}

const CREATE_ARGS = {
  topic: "AI regulation in the EU",
  frequency: "daily" as const,
};

beforeEach(() => {
  __resetRegistryForTests();
  vi.resetAllMocks();
  fnStore.countMonitors.mockResolvedValue(0);
  fnStore.createMonitor.mockResolvedValue({
    id: "mon-1",
    topic: CREATE_ARGS.topic,
    frequency: CREATE_ARGS.frequency,
    active: true,
    last_run_at: null,
    next_run_at: new Date(Date.now() + 60_000).toISOString(),
    created_at: new Date().toISOString(),
  });
  fnMonitors.scheduleRun.mockResolvedValue(undefined);
  audit.logAuditEvent.mockResolvedValue(undefined);

  registerMonitorTools();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("create_monitor", () => {
  it("creates a monitor with the given topic and frequency", async () => {
    const outcome = await runTool("create_monitor", CREATE_ARGS, ctx());

    expect(fnStore.countMonitors).toHaveBeenCalledWith(7);
    expect(fnStore.createMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        userId: 7,
        topic: CREATE_ARGS.topic,
        frequency: CREATE_ARGS.frequency,
        nextRunAt: expect.any(Date),
      })
    );
    expect(fnMonitors.scheduleRun).toHaveBeenCalledWith(
      7,
      expect.any(String),
      expect.any(Date)
    );
    expect(outcome).toEqual({
      ok: true,
      data: {
        success: true,
        data: {
          id: "mon-1",
          topic: CREATE_ARGS.topic,
          frequency: CREATE_ARGS.frequency,
          active: true,
          last_run_at: null,
          next_run_at: expect.any(String),
          created_at: expect.any(String),
        },
      },
    });
  });

  it("defaults frequency to daily when omitted", async () => {
    await runTool("create_monitor", { topic: "Test topic" }, ctx());

    expect(fnStore.createMonitor).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: "daily" })
    );
  });

  it("logs an audit event with the topic and frequency", async () => {
    await runTool("create_monitor", CREATE_ARGS, ctx());

    expect(audit.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "7",
        action: "monitor.create",
        resourceType: "monitor",
        resourceId: expect.any(String),
        metadata: { topic: CREATE_ARGS.topic, frequency: CREATE_ARGS.frequency },
        sessionId: "session-123",
        severity: "info",
        status: "success",
      })
    );
  });

  it("refuses when the user has reached the monitor limit", async () => {
    fnStore.countMonitors.mockResolvedValue(20);

    const outcome = await runTool("create_monitor", CREATE_ARGS, ctx());

    expect(fnStore.createMonitor).not.toHaveBeenCalled();
    expect(fnMonitors.scheduleRun).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "LIMIT_EXCEEDED" } });
  });

  it("validates topic minimum length", async () => {
    const outcome = await runTool("create_monitor", { topic: "AI" }, ctx());

    expect(fnStore.createMonitor).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("validates topic maximum length", async () => {
    const outcome = await runTool("create_monitor", { topic: "x".repeat(201) }, ctx());

    expect(fnStore.createMonitor).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("validates frequency enum", async () => {
    const outcome = await runTool("create_monitor", { topic: "Test topic", frequency: "monthly" }, ctx());

    expect(fnStore.createMonitor).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("validates required topic", async () => {
    const outcome = await runTool("create_monitor", {}, ctx());

    expect(fnStore.createMonitor).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });
});