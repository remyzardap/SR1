import { randomUUID } from "crypto";
import PgBoss from "pg-boss";
import { getDb } from "../db";
import { auditLogs } from "../../drizzle/schema";
import { KV_SWEEP_CRON, KV_SWEEP_JOB, sweepExpiredKv } from "./kvCache";

/**
 * Postgres-backed job runner (pg-boss). Runs in process on the VPS.
 * On Cloud Run the instance must stay warm: set min-instances 1, or have Cloud Scheduler call
 * POST /api/jobs/tick with the JOBS_TICK_SECRET header so a cold instance wakes and works the queue.
 */

export type JobHandler = (data: Record<string, unknown>) => Promise<void>;

export interface JobOptions {
  /** Recurring schedule as a pg-boss cron expression (UTC). The runner (re)applies it on start. */
  cron?: string;
}

const handlers = new Map<string, JobHandler>();
const schedules = new Map<string, string>();
let boss: PgBoss | null = null;
let starting: Promise<PgBoss | null> | null = null;

export function registerJob(name: string, handler: JobHandler, opts: JobOptions = {}) {
  handlers.set(name, handler);
  if (opts.cron) schedules.set(name, opts.cron);
  else schedules.delete(name);
}

registerJob("audit-test", async (data) => {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(auditLogs).values({
    id: randomUUID(),
    userId: "system",
    action: "job.audit-test",
    resourceType: "job",
    resourceId: typeof data.marker === "string" ? data.marker : null,
    metadata: { ranAt: new Date().toISOString(), scheduledFor: data.scheduledFor ?? null },
    severity: "info",
    status: "success",
    createdAt: Date.now(),
  });
});

// Daily: delete expired kv_cache rows (reads already ignore them).
registerJob(KV_SWEEP_JOB, async () => {
  await sweepExpiredKv();
}, { cron: KV_SWEEP_CRON });

export function startJobRunner(): Promise<PgBoss | null> {
  if (process.env.JOBS_ENABLED === "false" || !process.env.DATABASE_URL) return Promise.resolve(null);
  starting ??= (async () => {
    try {
      const b = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss", max: 3 });
      b.on("error", (err) => console.warn("[jobs] pg-boss error:", err.message));
      await b.start();
      for (const [name, handler] of handlers) {
        await b.createQueue(name);
        await b.work(name, { pollingIntervalSeconds: 2 }, async (jobs) => {
          for (const job of jobs) await handler((job.data ?? {}) as Record<string, unknown>);
        });
        const cron = schedules.get(name);
        if (cron) {
          // A schedule that can't be saved costs that job its runs, never the whole runner.
          await b.schedule(name, cron).catch((err: Error) => console.warn(`[jobs] schedule for ${name} not set:`, err.message));
        }
      }
      boss = b;
      console.log(`[jobs] runner started (${handlers.size} queues)`);
      return b;
    } catch (err) {
      console.warn("[jobs] runner not started:", (err as Error).message);
      starting = null;
      return null;
    }
  })();
  return starting;
}

export async function enqueueJob(name: string, data: Record<string, unknown> = {}, opts: { startAfterSeconds?: number } = {}): Promise<string | null> {
  const b = boss ?? (await startJobRunner());
  if (!b) return null;
  return b.send(name, data, opts.startAfterSeconds ? { startAfter: opts.startAfterSeconds } : {});
}

export async function stopJobRunner() {
  if (boss) await boss.stop({ graceful: true, timeout: 10_000 });
  boss = null;
  starting = null;
}
