/**
 * Monitor tool for the Kemma agent (P1-12, second half).
 *
 * `create_monitor` creates a scheduled research monitor that re-researches a
 * topic on a cadence (daily/weekly) and files briefings. Backed by the same
 * store and job queue as /api/fn/monitors, with the same limits and audit logging.
 *
 * Registered in builtin/index.ts behind flag("ACTION_TOOLS").
 * Does not require approval (it only schedules internal work and writes briefings
 * to the user's own storage).
 */
import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolContext } from "../types";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";
import {
  FREQUENCIES,
  MAX_MONITORS_PER_USER,
  MAX_TOPIC_CHARS,
  scheduleRun,
} from "../../../routes/fn/monitors";
import { countMonitors, createMonitor } from "../../../lib/fnStore";
import { logAuditEvent } from "../../../middleware/audit-logging";
import { randomUUID } from "crypto";

const CreateMonitorArgs = z.object({
  topic: z
    .string()
    .trim()
    .min(5)
    .max(MAX_TOPIC_CHARS)
    .describe("What to monitor. Be specific: 'AI regulation in the EU' not just 'AI'."),
  frequency: z
    .enum(FREQUENCIES)
    .default("daily")
    .describe("How often to research: 'daily' or 'weekly'."),
});

async function executeCreateMonitor(
  args: z.infer<typeof CreateMonitorArgs>,
  ctx: ToolContext
): Promise<LegacyToolResult> {
  if ((await countMonitors(ctx.userId)) >= MAX_MONITORS_PER_USER) {
    return createErrorResult(
      `You can monitor up to ${MAX_MONITORS_PER_USER} topics.`,
      "LIMIT_EXCEEDED"
    );
  }

  const id = randomUUID();
  const firstRun = new Date(Date.now() + 60 * 1000);
  const monitor = await createMonitor({ id, userId: ctx.userId, topic: args.topic, frequency: args.frequency, nextRunAt: firstRun });
  await scheduleRun(ctx.userId, id, firstRun);

  await logAuditEvent({
    userId: String(ctx.userId),
    action: "monitor.create",
    resourceType: "monitor",
    resourceId: id,
    metadata: { topic: args.topic, frequency: args.frequency },
    sessionId: ctx.sessionId,
    severity: "info",
    status: "success",
  });

  return createSuccessResult(monitor);
}

export function registerMonitorTools(): void {
  registerTool({
    name: "create_monitor",
    description:
      "Create a research monitor that re-investigates a topic on a schedule (daily or weekly) and saves briefings. Use for topics you want to keep track of over time.",
    args: CreateMonitorArgs,
    risk: "write",
    requiresApproval: false,
    parallelSafe: false,
    timeoutMs: 20_000,
    maxModelChars: 2_000,
    available: () => true,
    execute: executeCreateMonitor,
  });
}