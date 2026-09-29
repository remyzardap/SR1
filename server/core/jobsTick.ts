import { timingSafeEqual } from "crypto";
import type { Express } from "express";
import { startJobRunner } from "./jobs";

function secretMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Secret-gated wake-up for hosts that scale to zero (Cloud Run + Cloud Scheduler). Disabled unless JOBS_TICK_SECRET is set. */
export function registerJobsTick(app: Express) {
  app.post("/api/jobs/tick", async (req, res) => {
    const secret = process.env.JOBS_TICK_SECRET;
    if (!secret) return res.status(404).json({ error: "Not found" });
    if (!secretMatches(req.header("x-jobs-secret"), secret)) return res.status(401).json({ error: "Unauthorized" });

    const boss = await startJobRunner();
    if (!boss) return res.status(503).json({ error: "Job runner unavailable" });

    // Hold the request open so the instance stays up while workers poll and run due jobs.
    const waitSeconds = Math.min(Math.max(Number(req.query.wait) || 20, 0), 55);
    await new Promise((r) => setTimeout(r, waitSeconds * 1000));
    res.json({ ok: true, waitedSeconds: waitSeconds });
  });
}
