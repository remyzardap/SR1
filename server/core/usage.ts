/**
 * Usage logging and monthly spend-cap checks for Kemma.
 *
 * Costs are rough estimates only; they are not billing-grade numbers.
 */

import { and, eq, gte } from "drizzle-orm";
import { getDb } from "../db";
import { usageLogs, type InsertUsageLog } from "../../drizzle/schema";
import {
  type ModelProvider,
  estimateCostUsd,
  monthlySpendCapUsd,
} from "./kemmaRouter";

export interface UsageRecord {
  userId: number;
  sessionId?: string;
  reportId?: string;
  provider: ModelProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Prompt tokens served from the provider's cache; billed at a discount. A subset of inputTokens. */
  cachedInputTokens?: number;
  purpose?: string;
}

export async function logUsage(record: UsageRecord): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const total = record.inputTokens + record.outputTokens;
  const cached = Math.min(Math.max(record.cachedInputTokens ?? 0, 0), record.inputTokens);
  const estimatedCost = estimateCostUsd(record.model, record.inputTokens, record.outputTokens, cached);

  const values: InsertUsageLog = {
    userId: record.userId,
    sessionId: record.sessionId ?? null,
    reportId: record.reportId ?? null,
    provider: record.provider,
    model: record.model,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: total,
    cachedInputTokens: cached,
    estimatedCostUsd: String(estimatedCost),
    purpose: record.purpose ?? null,
  };

  try {
    await db.insert(usageLogs).values(values);
  } catch (err) {
    // Never fail the user request because of a logging hiccup.
    console.warn("[usage] failed to log usage:", err);
  }
}

export async function checkSpendCap(provider: ModelProvider): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const cap = monthlySpendCapUsd(provider);
  if (cap <= 0) return { allowed: true };

  const db = await getDb();
  if (!db) return { allowed: true };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const rows = await db
      .select()
      .from(usageLogs)
      .where(and(eq(usageLogs.provider, provider), gte(usageLogs.createdAt, startOfMonth)));

    const spent = rows.reduce((sum, r) => sum + Number(r.estimatedCostUsd || 0), 0);
    if (spent >= cap) {
      return {
        allowed: false,
        reason: `Monthly spend cap reached ($${spent.toFixed(2)} / $${cap}). Set the KEMMA_CAP_* limits to raise it.`,
      };
    }
  } catch (err) {
    console.warn("[usage] failed to check spend cap:", err);
  }

  return { allowed: true };
}

export async function monthlySpendSummary(provider: ModelProvider): Promise<{ spent: number; cap: number }> {
  const cap = monthlySpendCapUsd(provider);
  const db = await getDb();
  if (!db) return { spent: 0, cap };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const rows = await db
      .select()
      .from(usageLogs)
      .where(and(eq(usageLogs.provider, provider), gte(usageLogs.createdAt, startOfMonth)));
    const spent = rows.reduce((sum, r) => sum + Number(r.estimatedCostUsd || 0), 0);
    return { spent, cap };
  } catch {
    return { spent: 0, cap };
  }
}
