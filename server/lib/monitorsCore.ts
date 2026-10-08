/**
 * The monitor constants and scheduling that both the /api/fn/monitors route and the chat
 * `create_monitor` tool need. They live here, away from the route, because the route imports the
 * engine and the engine registers the built-in tools: a tool importing the route closes that loop
 * and leaves these values undefined at registration time (P1-12).
 */
import { monitorFrequencyEnum } from "../../drizzle/schema";
import { enqueueJob } from "../core/jobs";

export const MONITOR_JOB = "monitor-run";
export const MAX_MONITORS_PER_USER = 20;
export const MAX_TOPIC_CHARS = 200;

/** The only cadences Monitors.tsx offers. */
export const FREQUENCIES = monitorFrequencyEnum.enumValues;
export type MonitorFrequency = (typeof FREQUENCIES)[number];

/** Whole seconds until a slot comes due, never less than one. */
export function delaySecondsUntil(at: Date, now: Date = new Date()): number {
  return Math.max(1, Math.round((at.getTime() - now.getTime()) / 1000));
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
