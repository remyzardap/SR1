/**
 * Data access for the /api/fn cloud-function replacements: the per-user settings
 * blob and the research monitors tables. Every function takes the signed-in user
 * id and filters on it, so no query can cross accounts.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { monitors, monitorRuns, userSettings, type MonitorRow, type MonitorRunRow } from "../../drizzle/schema";
import { getDb } from "../db";

export class StoreUnavailableError extends Error {
  constructor(message = "Storage is unavailable.") {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

async function db() {
  const database = await getDb();
  if (!database) throw new StoreUnavailableError();
  return database;
}

// ─── Per-user settings ────────────────────────────────────────────────────────

export const LIVING_MEMORY_KEY = "livingMemoryEnabled";

/** Reads one key from the user's settings blob; `undefined` when unset. */
export async function getUserSetting(userId: number, key: string): Promise<unknown> {
  const database = await db();
  const [row] = await database
    .select({ settings: userSettings.settings })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row?.settings?.[key];
}

/** Merges one key into the user's settings blob (insert on first write). */
export async function setUserSetting(userId: number, key: string, value: unknown): Promise<void> {
  const database = await db();
  const [row] = await database
    .select({ settings: userSettings.settings })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!row) {
    await database.insert(userSettings).values({ userId, settings: { [key]: value } });
    return;
  }
  await database
    .update(userSettings)
    .set({ settings: { ...(row.settings ?? {}), [key]: value }, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
}

// ─── Monitors ─────────────────────────────────────────────────────────────────

export interface SerializedMonitor {
  id: string;
  topic: string;
  frequency: "daily" | "weekly";
  active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface SerializedMonitorRun {
  id: string;
  monitor_id: string;
  report: string;
  sources: Array<{ title: string; url: string }>;
  created_at: string;
}

/** The shape client/src/pages/Monitors.tsx reads: snake_case ids and ISO dates. */
export function serializeMonitor(row: MonitorRow): SerializedMonitor {
  return {
    id: row.id,
    topic: row.topic,
    frequency: row.frequency,
    active: row.active,
    last_run_at: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    next_run_at: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  };
}

export function serializeMonitorRun(row: MonitorRunRow): SerializedMonitorRun {
  return {
    id: row.id,
    monitor_id: row.monitorId,
    report: row.report,
    sources: Array.isArray(row.sources) ? row.sources : [],
    created_at: row.createdAt.toISOString(),
  };
}

export async function listMonitors(userId: number): Promise<SerializedMonitor[]> {
  const database = await db();
  const rows = await database
    .select()
    .from(monitors)
    .where(eq(monitors.userId, userId))
    .orderBy(desc(monitors.createdAt));
  return rows.map(serializeMonitor);
}

export async function countMonitors(userId: number): Promise<number> {
  const database = await db();
  const [row] = await database
    .select({ n: sql<number>`count(*)` })
    .from(monitors)
    .where(eq(monitors.userId, userId));
  return Number(row?.n ?? 0);
}

export async function createMonitor(input: {
  id: string;
  userId: number;
  topic: string;
  frequency: "daily" | "weekly";
  nextRunAt: Date;
}): Promise<SerializedMonitor> {
  const database = await db();
  await database.insert(monitors).values({
    id: input.id,
    userId: input.userId,
    topic: input.topic,
    frequency: input.frequency,
    active: true,
    nextRunAt: input.nextRunAt,
  });
  const row = await getMonitor(input.userId, input.id);
  if (!row) throw new StoreUnavailableError("The monitor could not be read back.");
  return serializeMonitor(row);
}

/** One row, but only if it belongs to this user. */
export async function getMonitor(userId: number, id: string): Promise<MonitorRow | null> {
  const database = await db();
  const [row] = await database
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function setActiveMonitor(userId: number, id: string, active: boolean, nextRunAt: Date | null): Promise<void> {
  const database = await db();
  await database
    .update(monitors)
    .set({ active, nextRunAt, updatedAt: new Date() })
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)));
}

/** Drops the monitor and the briefings it filed. Both filters are per user. */
export async function removeMonitor(userId: number, id: string): Promise<void> {
  const database = await db();
  await database
    .delete(monitorRuns)
    .where(and(eq(monitorRuns.monitorId, id), eq(monitorRuns.userId, userId)));
  await database.delete(monitors).where(and(eq(monitors.id, id), eq(monitors.userId, userId)));
}

export async function markMonitorRun(userId: number, id: string, ranAt: Date, nextRunAt: Date): Promise<void> {
  const database = await db();
  await database
    .update(monitors)
    .set({ lastRunAt: ranAt, nextRunAt, updatedAt: ranAt })
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)));
}

/** Clears the schedule of a monitor whose chain was interrupted (failure or pause). */
export async function clearMonitorSchedule(userId: number, id: string): Promise<void> {
  const database = await db();
  await database
    .update(monitors)
    .set({ nextRunAt: null, updatedAt: new Date() })
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)));
}

export async function listMonitorRuns(userId: number, limit: number): Promise<SerializedMonitorRun[]> {
  const database = await db();
  const rows = await database
    .select()
    .from(monitorRuns)
    .where(eq(monitorRuns.userId, userId))
    .orderBy(desc(monitorRuns.createdAt))
    .limit(limit);
  return rows.map(serializeMonitorRun);
}

export async function insertMonitorRun(input: {
  id: string;
  monitorId: string;
  userId: number;
  report: string;
  sources: Array<{ title: string; url: string }>;
}): Promise<void> {
  const database = await db();
  await database.insert(monitorRuns).values({
    id: input.id,
    monitorId: input.monitorId,
    userId: input.userId,
    report: input.report,
    sources: input.sources,
  });
}
