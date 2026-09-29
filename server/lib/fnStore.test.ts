import { describe, it, expect } from "vitest";
import { serializeMonitor, serializeMonitorRun, type SerializedMonitor } from "./fnStore";

const monitorRow = {
  id: "0f6f0b6e-1b7b-4d0c-9b1a-6c2b0f0a1b23",
  userId: 7,
  topic: "Indonesian nickel export policy",
  frequency: "weekly" as const,
  active: true,
  lastRunAt: new Date("2026-09-25T02:00:00.000Z"),
  nextRunAt: null,
  createdAt: new Date("2026-09-20T09:30:00.000Z"),
  updatedAt: new Date("2026-09-25T02:00:00.000Z"),
};

describe("monitor row serialization", () => {
  it("matches the snake_case shape Monitors.tsx reads", () => {
    const out = serializeMonitor(monitorRow);
    expect(out).toEqual({
      id: monitorRow.id,
      topic: "Indonesian nickel export policy",
      frequency: "weekly",
      active: true,
      last_run_at: "2026-09-25T02:00:00.000Z",
      next_run_at: null,
      created_at: "2026-09-20T09:30:00.000Z",
    });
  });

  it("keeps every field Monitors.tsx touches present", () => {
    const required: (keyof SerializedMonitor)[] = ["id", "topic", "frequency", "active", "last_run_at", "next_run_at", "created_at"];
    const out = serializeMonitor(monitorRow) as unknown as Record<string, unknown>;
    for (const key of required) expect(out).toHaveProperty(key);
  });

  it("drops a malformed sources list instead of throwing", () => {
    const row = {
      id: "run-1",
      monitorId: monitorRow.id,
      userId: 7,
      report: "brief",
      sources: null as unknown as Array<{ title: string; url: string }>,
      createdAt: new Date("2026-09-25T02:00:00.000Z"),
    };
    expect(serializeMonitorRun(row)).toEqual({
      id: "run-1",
      monitor_id: monitorRow.id,
      report: "brief",
      sources: [],
      created_at: "2026-09-25T02:00:00.000Z",
    });
  });
});
