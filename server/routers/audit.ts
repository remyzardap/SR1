import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { auditLogs } from "../../drizzle/schema";
import { desc, eq, gte, lte, and, like } from "drizzle-orm";
import { cleanupOldAuditLogs } from "../middleware/audit-logging";

export const auditRouter = router({
  /**
   * List audit logs with optional filtering.
   * Admin-only in practice — callers should verify role before exposing in UI.
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
        userId: z.string().optional(),
        action: z.string().optional(),
        severity: z.enum(["info", "warn", "error", "critical"]).optional(),
        status: z.enum(["success", "failure"]).optional(),
        fromTs: z.number().optional(),
        toTs: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { logs: [], total: 0 };

      const conditions = [];
      if (input.userId) conditions.push(eq(auditLogs.userId, input.userId));
      if (input.action) conditions.push(like(auditLogs.action, `%${input.action}%`));
      if (input.severity) conditions.push(eq(auditLogs.severity, input.severity));
      if (input.status) conditions.push(eq(auditLogs.status, input.status));
      if (input.fromTs) conditions.push(gte(auditLogs.createdAt, input.fromTs));
      if (input.toTs) conditions.push(lte(auditLogs.createdAt, input.toTs));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [logs, countResult] = await Promise.all([
        db
          .select()
          .from(auditLogs)
          .where(where)
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: auditLogs.id }).from(auditLogs).where(where),
      ]);

      return { logs, total: countResult.length };
    }),

  /**
   * Get a list of distinct action types for filter dropdowns.
   */
  getActions: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ action: auditLogs.action })
      .from(auditLogs)
      .orderBy(auditLogs.action);
    return rows.map((r) => r.action);
  }),

  /**
   * Get aggregate stats for the admin dashboard.
   */
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, failures: 0, critical: 0, last24h: 0 };

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const [total, failures, critical, last24h] = await Promise.all([
      db.select({ count: auditLogs.id }).from(auditLogs),
      db.select({ count: auditLogs.id }).from(auditLogs).where(eq(auditLogs.status, "failure")),
      db.select({ count: auditLogs.id }).from(auditLogs).where(eq(auditLogs.severity, "critical")),
      db.select({ count: auditLogs.id }).from(auditLogs).where(gte(auditLogs.createdAt, oneDayAgo)),
    ]);

    return {
      total: total.length,
      failures: failures.length,
      critical: critical.length,
      last24h: last24h.length,
    };
  }),

  /**
   * Delete audit logs older than the specified number of days.
   */
  cleanup: protectedProcedure
    .input(z.object({ daysToKeep: z.number().min(7).max(365).default(90) }))
    .mutation(async ({ input }) => {
      const deleted = await cleanupOldAuditLogs(input.daysToKeep);
      return { deleted };
    }),
});
