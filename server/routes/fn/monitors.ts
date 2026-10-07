/**
 * monitors function (POST /api/fn/monitors).
 *
 * Actions, from client/src/pages/Monitors.tsx:
 *   { action: "list" }                      -> { monitors: [SerializedMonitor] }
 *   { action: "runs" }                      -> { runs: [SerializedMonitorRun] }
 *   { action: "create", topic, frequency }  -> { ok: true, monitor }
 *   { action: "setActive", id, active }     -> { ok: true, id, active }
 *   { action: "remove", id }                -> { ok: true, id }
 *
 * A monitor re-researches its topic on a schedule through the existing pg-boss
 * queue and files one cited briefing per run, stored for the signed-in user
 * only. Nothing is sent, shared or posted anywhere.
 */

import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { monitorFrequencyEnum } from "../../../drizzle/schema";
import { kemmaExecute, type KemmaMessage } from "../../kemma/engine";
import { getQuotaSummary } from "../../core/quotaCheck";
import { enqueueJob, registerJob } from "../../core/jobs";
import { FnError } from "../../lib/fnErrors";
import {
  clearMonitorSchedule,
  countMonitors,
  createMonitor,
  getMonitor,
  insertMonitorRun,
  listMonitorRuns,
  listMonitors,
  markMonitorRun,
  removeMonitor,
  setActiveMonitor,
  type SerializedMonitor,
} from "../../lib/fnStore";
import {
  actionOf,
  asRecord,
  requireBoolean,
  requireOneOf,
  requireStringId,
  requireText,
  unknownAction,
} from "./shared";

export const MONITOR_JOB = "monitor-run";
export const MAX_MONITORS_PER_USER = 20;
export const MAX_RUNS_RETURNED = 50;
export const MAX_TOPIC_CHARS = 200;
export const MAX_REPORT_CHARS = 20000;
export const MAX_SOURCES = 15;
export const FIRST_RUN_DELAY_SECONDS = 60;

/** The only cadences Monitors.tsx offers. */
export const FREQUENCIES = monitorFrequencyEnum.enumValues;
export type MonitorFrequency = (typeof FREQUENCIES)[number];

const INTERVAL_SECONDS: Record<MonitorFrequency, number> = {
  daily: 24 * 60 * 60,
  weekly: 7 * 24 * 60 * 60,
};

export function intervalSeconds(frequency: MonitorFrequency): number {
  return INTERVAL_SECONDS[frequency];
}

export function nextRunTime(from: Date, frequency: MonitorFrequency): Date {
  return new Date(from.getTime() + intervalSeconds(frequency) * 1000);
}

/** Whole seconds until a slot comes due, never less than one. */
export function delaySecondsUntil(at: Date, now: Date = new Date()): number {
  return Math.max(1, Math.round((at.getTime() - now.getTime()) / 1000));
}

export async function handleMonitors(userId: number, req: Request, res: Response): Promise<void> {
  const body = asRecord(req.body);
  const action = actionOf(body);

  switch (action) {
    case "list":
      res.json({ monitors: await listMonitors(userId) });
      return;
    case "runs":
      res.json({ runs: await listMonitorRuns(userId, MAX_RUNS_RETURNED) });
      return;
    case "create":
      res.json(await create(userId, body));
      return;
    case "setActive":
      res.json(await setActive(userId, body));
      return;
    case "remove": {
      const id = requireStringId(body, "id");
      await requireOwned(userId, id);
      await removeMonitor(userId, id);
      res.json({ ok: true, id });
      return;
    }
    default:
      unknownAction(action);
  }
}

async function setActive(userId: number, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = requireStringId(body, "id");
  const active = requireBoolean(body, "active");
  const monitor = await requireOwned(userId, id);

  if (!active) {
    await setActiveMonitor(userId, id, false, null);
    return { ok: true, id, active: false };
  }

  const next = nextRunTime(new Date(), monitor.frequency);
  await setActiveMonitor(userId, id, true, next);
  await scheduleRun(userId, id, next);
  return { ok: true, id, active: true, next_run_at: next.toISOString() };
}

async function create(userId: number, body: Record<string, unknown>): Promise<{ ok: true; monitor: SerializedMonitor }> {
  const topic = requireText(body, "topic", MAX_TOPIC_CHARS, 5);
  const frequency = requireOneOf(body.frequency, FREQUENCIES, "frequency");

  if ((await countMonitors(userId)) >= MAX_MONITORS_PER_USER) {
    throw new FnError(429, `You can monitor up to ${MAX_MONITORS_PER_USER} topics.`);
  }

  const id = randomUUID();
  const firstRun = new Date(Date.now() + FIRST_RUN_DELAY_SECONDS * 1000);
  const monitor = await createMonitor({ id, userId, topic, frequency, nextRunAt: firstRun });
  await scheduleRun(userId, id, firstRun);
  return { ok: true, monitor };
}

async function requireOwned(userId: number, id: string) {
  const monitor = await getMonitor(userId, id);
  if (!monitor) throw new FnError(404, "Monitor not found.");
  return monitor;
}

/**
 * Queues one briefing, tagged with the slot it belongs to. A job from a paused
 * or re-armed chain finds a different next_run_at when it fires and drops out,
 * so a monitor never runs two chains at once.
 */
export async function scheduleRun(userId: number, monitorId: string, forTime: Date): Promise<void> {
  await enqueueJob(
    MONITOR_JOB,
    { monitorId, userId, scheduledFor: forTime.getTime() },
    { startAfterSeconds: delaySecondsUntil(forTime) }
  );
}

export function registerMonitorJobs(): void {
  registerJob(MONITOR_JOB, async (data) => {
    const monitorId = typeof data.monitorId === "string" ? data.monitorId : "";
    const userId = typeof data.userId === "number" ? data.userId : 0;
    const scheduledFor = typeof data.scheduledFor === "number" ? data.scheduledFor : 0;
    if (!monitorId || !userId) return;

    const monitor = await getMonitor(userId, monitorId);
    if (!monitor || !monitor.active) return;

    // Stale slot: the monitor was paused or re-armed since this job was queued.
    const dueAt = monitor.nextRunAt ? monitor.nextRunAt.getTime() : 0;
    if (scheduledFor && dueAt && scheduledFor !== dueAt) return;

    try {
      const { report, sources } = await researchTopic(userId, monitor.topic);
      const ranAt = new Date();
      const next = nextRunTime(ranAt, monitor.frequency);
      await insertMonitorRun({ id: randomUUID(), monitorId, userId, report, sources });
      await markMonitorRun(userId, monitorId, ranAt, next);
      await scheduleRun(userId, monitorId, next);
    } catch (err) {
      // The chain stops here; resuming the monitor in the app re-arms it.
      console.error(`[monitors] run failed for monitor ${monitorId}:`, String(err));
      try {
        await clearMonitorSchedule(userId, monitorId);
      } catch (clearErr) {
        console.error(`[monitors] could not clear the schedule for ${monitorId}:`, String(clearErr));
      }
    }
  });
}

/** One research pass over the topic, on the Kemma engine with its web tools. */
export async function researchTopic(
  userId: number,
  topic: string
): Promise<{ report: string; sources: Array<{ title: string; url: string }> }> {
  const quota = await getQuotaSummary(userId);
  const messages: KemmaMessage[] = [{ role: "user", content: buildResearchPrompt(topic) }];

  const output = await kemmaExecute({
    userId,
    messages,
    tier: quota.tier,
    isThinking: false,
    allowedTools: ["web_search", "browse"],
    toolBudget: 6,
  });

  const report = (output.response || "").trim().slice(0, MAX_REPORT_CHARS);
  if (!report) throw new Error("The briefing came back empty.");

  const sources = output.sources
    .filter((s) => !!s.url)
    .slice(0, MAX_SOURCES)
    .map((s) => ({ title: (s.title || s.url).slice(0, 200), url: s.url.slice(0, 500) }));

  return { report, sources };
}

export function buildResearchPrompt(topic: string): string {
  return [
    `Prepare a briefing on this monitored topic: ${topic}`,
    "",
    "Search the web for the most recent developments, then write a short markdown briefing:",
    "- What changed since the last look, with dates.",
    "- Why it matters, in two or three sentences.",
    "- What to watch next.",
    "Cite the sources you used with [n] markers. Do not invent facts.",
  ].join("\n");
}

registerMonitorJobs();
