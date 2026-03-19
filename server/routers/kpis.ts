/**
 * Business KPIs Dashboard Router (Task 3)
 * Provides revenue, growth rate, churn, and other key business metrics.
 */
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  users,
  receipts,
  payments,
  procurementRequests,
  tasks,
  files,
} from "../../drizzle/schema";
import { sql, gte, lte, and, eq, desc } from "drizzle-orm";

function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  return { start, end };
}

export const kpisRouter = router({
  /**
   * High-level KPI snapshot for admin dashboard.
   * Returns MRR, user growth, activity metrics, and trends.
   */
  overview: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        users: { total: 0, newThisMonth: 0, growthPct: 0 },
        revenue: { mrrUsd: 0, totalPayments: 0, avgRevenuePerUser: 0 },
        activity: { receiptsThisMonth: 0, tasksCompleted: 0, filesGenerated: 0, procurementsApproved: 0 },
        trends: [],
      };
    }

    const now = new Date();
    const thisMonth = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const lastMonth = getMonthRange(
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
      now.getMonth() === 0 ? 12 : now.getMonth()
    );

    const [
      totalUsers,
      newUsersThisMonth,
      newUsersLastMonth,
      totalPayments,
      receiptsThisMonth,
      tasksCompleted,
      filesGenerated,
      procurementsApproved,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(users),
      db.select({ count: sql<number>`count(*)` }).from(users).where(
        and(gte(users.createdAt, thisMonth.start), lte(users.createdAt, thisMonth.end))
      ),
      db.select({ count: sql<number>`count(*)` }).from(users).where(
        and(gte(users.createdAt, lastMonth.start), lte(users.createdAt, lastMonth.end))
      ),
      db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments),
      db.select({ count: sql<number>`count(*)` }).from(receipts).where(
        and(gte(receipts.createdAt, thisMonth.start), lte(receipts.createdAt, thisMonth.end))
      ),
      db.select({ count: sql<number>`count(*)` }).from(tasks).where(eq(tasks.status, "done")),
      db.select({ count: sql<number>`count(*)` }).from(files),
      db.select({ count: sql<number>`count(*)` }).from(procurementRequests).where(
        eq(procurementRequests.status, "approved")
      ),
    ]);

    const totalUsersCount = Number(totalUsers[0]?.count ?? 0);
    const newThisMonth = Number(newUsersThisMonth[0]?.count ?? 0);
    const newLastMonth = Number(newUsersLastMonth[0]?.count ?? 0);
    const growthPct = newLastMonth > 0
      ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100)
      : newThisMonth > 0 ? 100 : 0;

    const totalPaymentsAmount = Number(totalPayments[0]?.total ?? 0);
    const avgRevenuePerUser = totalUsersCount > 0
      ? Math.round((totalPaymentsAmount / totalUsersCount) * 100) / 100
      : 0;

    // Approximate MRR: sum of payments in the last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [recentPayments] = await db
      .select({ total: sql<number>`coalesce(sum(amount), 0)` })
      .from(payments)
      .where(gte(payments.createdAt, thirtyDaysAgo));
    const mrrUsd = Number(recentPayments?.total ?? 0);

    // Monthly trends (last 6 months)
    const trends = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const range = getMonthRange(d.getFullYear(), d.getMonth() + 1);
      const [monthUsers, monthReceipts, monthPayments] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users).where(
          and(gte(users.createdAt, range.start), lte(users.createdAt, range.end))
        ),
        db.select({ count: sql<number>`count(*)` }).from(receipts).where(
          and(gte(receipts.createdAt, range.start), lte(receipts.createdAt, range.end))
        ),
        db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments).where(
          and(gte(payments.createdAt, range.start), lte(payments.createdAt, range.end))
        ),
      ]);
      trends.push({
        label: d.toLocaleString("default", { month: "short", year: "2-digit" }),
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        newUsers: Number(monthUsers[0]?.count ?? 0),
        receipts: Number(monthReceipts[0]?.count ?? 0),
        revenue: Number(monthPayments[0]?.total ?? 0),
      });
    }

    return {
      users: {
        total: totalUsersCount,
        newThisMonth,
        growthPct,
      },
      revenue: {
        mrrUsd,
        totalPayments: totalPaymentsAmount,
        avgRevenuePerUser,
      },
      activity: {
        receiptsThisMonth: Number(receiptsThisMonth[0]?.count ?? 0),
        tasksCompleted: Number(tasksCompleted[0]?.count ?? 0),
        filesGenerated: Number(filesGenerated[0]?.count ?? 0),
        procurementsApproved: Number(procurementsApproved[0]?.count ?? 0),
      },
      trends,
    };
  }),

  /**
   * Monthly breakdown for a specific period — admin only.
   */
  monthly: adminProcedure
    .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { newUsers: 0, receipts: 0, revenue: 0, tasks: 0 };

      const range = getMonthRange(input.year, input.month);
      const [monthUsers, monthReceipts, monthPayments, monthTasks] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users).where(
          and(gte(users.createdAt, range.start), lte(users.createdAt, range.end))
        ),
        db.select({ count: sql<number>`count(*)` }).from(receipts).where(
          and(gte(receipts.createdAt, range.start), lte(receipts.createdAt, range.end))
        ),
        db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments).where(
          and(gte(payments.createdAt, range.start), lte(payments.createdAt, range.end))
        ),
        db.select({ count: sql<number>`count(*)` }).from(tasks).where(
          and(
            gte(tasks.createdAt, range.start),
            lte(tasks.createdAt, range.end),
            eq(tasks.status, "done")
          )
        ),
      ]);

      return {
        newUsers: Number(monthUsers[0]?.count ?? 0),
        receipts: Number(monthReceipts[0]?.count ?? 0),
        revenue: Number(monthPayments[0]?.total ?? 0),
        tasks: Number(monthTasks[0]?.count ?? 0),
      };
    }),
});
