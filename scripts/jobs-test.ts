/**
 * H8 milestone check: schedule a job 2 minutes ahead, wait, and confirm it wrote an audit row.
 * Run on the VPS host: EVAL_DB_HOST=<postgres container ip> npm run jobs:test
 */
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { auditLogs } from "../drizzle/schema";
import { enqueueJob, startJobRunner, stopJobRunner } from "../server/core/jobs";

(async () => {
  if (process.env.EVAL_DB_HOST && process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    u.hostname = process.env.EVAL_DB_HOST;
    process.env.DATABASE_URL = u.toString();
  }
  const marker = randomUUID();
  await startJobRunner();
  const scheduledFor = new Date(Date.now() + 120_000).toISOString();
  const id = await enqueueJob("audit-test", { marker, scheduledFor }, { startAfterSeconds: 120 });
  console.log(`scheduled job ${id} for ${scheduledFor}`);

  const db = await getDb();
  if (!db) throw new Error("no db");
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, marker));
    if (rows.length) {
      const late = (Date.now() - Date.parse(scheduledFor)) / 1000;
      console.log(`PASS: audit row written ${late.toFixed(1)}s after the scheduled time`);
      await db.delete(auditLogs).where(eq(auditLogs.resourceId, marker));
      await stopJobRunner();
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("FAIL: no audit row within 180s");
  await stopJobRunner();
  process.exit(1);
})();
