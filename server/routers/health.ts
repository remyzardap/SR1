/**
 * System Health Dashboard Router (Task 12)
 * Provides admin-only system metrics: uptime, memory, DB status, and app-level KPIs.
 */
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, files, receipts, tasks, procurementRequests } from "../../drizzle/schema";
import { sql } from "drizzle-orm";
import os from "os";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const healthRouter = router({
  /**
   * Full system health snapshot — admin only.
   */
  status: adminProcedure.query(async () => {
    // ── System metrics ──────────────────────────────────────────────────────
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPct = Math.round((usedMem / totalMem) * 100);

    const cpus = os.cpus();
    // Calculate average CPU load from the 1-min load average (normalized per core)
    const loadAvg = os.loadavg();
    const cpuLoadPct = Math.min(100, Math.round((loadAvg[0] / cpus.length) * 100));

    const processUptime = process.uptime();
    const systemUptime = os.uptime();

    // ── Database health ─────────────────────────────────────────────────────
    let dbStatus: "ok" | "error" = "ok";
    let dbLatencyMs = 0;
    let dbCounts = {
      users: 0,
      files: 0,
      receipts: 0,
      tasks: 0,
      procurements: 0,
    };

    try {
      const db = await getDb();
      if (!db) {
        dbStatus = "error";
      } else {
        const start = Date.now();
        const [uCount, fCount, rCount, tCount, pCount] = await Promise.all([
          db.select({ count: sql<number>`count(*)` }).from(users),
          db.select({ count: sql<number>`count(*)` }).from(files),
          db.select({ count: sql<number>`count(*)` }).from(receipts),
          db.select({ count: sql<number>`count(*)` }).from(tasks),
          db.select({ count: sql<number>`count(*)` }).from(procurementRequests),
        ]);
        dbLatencyMs = Date.now() - start;
        dbCounts = {
          users: Number(uCount[0]?.count ?? 0),
          files: Number(fCount[0]?.count ?? 0),
          receipts: Number(rCount[0]?.count ?? 0),
          tasks: Number(tCount[0]?.count ?? 0),
          procurements: Number(pCount[0]?.count ?? 0),
        };
      }
    } catch {
      dbStatus = "error";
    }

    // ── Node.js process metrics ─────────────────────────────────────────────
    const memUsage = process.memoryUsage();

    return {
      // System
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpuCount: cpus.length,
        cpuModel: cpus[0]?.model ?? "Unknown",
        cpuLoadPct,
        loadAvg1m: loadAvg[0].toFixed(2),
        loadAvg5m: loadAvg[1].toFixed(2),
        loadAvg15m: loadAvg[2].toFixed(2),
        totalMemory: formatBytes(totalMem),
        usedMemory: formatBytes(usedMem),
        freeMemory: formatBytes(freeMem),
        memoryUsagePct: memPct,
        systemUptime: formatUptime(systemUptime),
        processUptime: formatUptime(processUptime),
      },
      // Node.js heap
      process: {
        heapUsed: formatBytes(memUsage.heapUsed),
        heapTotal: formatBytes(memUsage.heapTotal),
        rss: formatBytes(memUsage.rss),
        external: formatBytes(memUsage.external),
        heapUsagePct: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      // Database
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        counts: dbCounts,
      },
      // Timestamp
      timestamp: new Date().toISOString(),
    };
  }),
});
