import { getDb } from "../db";
import { userQuotas } from "../../drizzle/schema";
import { eq, lt, and } from "drizzle-orm";
import { QUOTA_LIMITS, type Tier } from "./kemmaRouter";

export type QuotaAction = "message" | "agentic_task" | "think" | "voice_minute" | "token";

export interface QuotaResult {
  allowed: boolean; remaining: number; limit: number; resetAt: Date; reason?: string;
}

export async function checkQuota(userId: number, action: QuotaAction, amount = 1): Promise<QuotaResult> {
  const db = await getDb();
  if (!db) return { allowed: true, remaining: 999, limit: 999, resetAt: new Date() };
  let quota = await getOrCreateQuota(userId);
  if (quota.tier === "trial" && quota.trialEndsAt && quota.trialEndsAt < new Date()) {
    await db.update(userQuotas).set({ tier: "free" }).where(eq(userQuotas.userId, userId));
    quota = { ...quota, tier: "free" };
  }
  quota = await resetDailyIfNeeded(userId, quota);
  quota = await resetMonthlyIfNeeded(userId, quota);
  const tier = quota.tier as Tier;
  const limits = QUOTA_LIMITS[tier];
  const tomorrow = getNextMidnightUTC();
  const nextMonth = getNextMonthReset();
  switch (action) {
    case "message": {
      const remaining = limits.msgsPerDay - (quota.messagesToday ?? 0);
      return { allowed: remaining >= amount, remaining: Math.max(0, remaining), limit: limits.msgsPerDay, resetAt: tomorrow, reason: remaining < amount ? `Daily message limit reached (${limits.msgsPerDay}/day on ${tier})` : undefined };
    }
    case "agentic_task": {
      const used = quota.agenticTasksThisMonth ?? 0;
      const bonus = quota.byosBonusTasks ?? 0;
      const effectiveLimit = limits.tasksPerMonth + bonus;
      const remaining = effectiveLimit - used;
      return { allowed: remaining >= amount, remaining: Math.max(0, remaining), limit: effectiveLimit, resetAt: nextMonth, reason: remaining < amount ? `Monthly task limit reached` : undefined };
    }
    case "think": {
      if (limits.thinkPerDay === 0) return { allowed: false, remaining: 0, limit: 0, resetAt: tomorrow, reason: "Think (Opus) requires Pro or Max tier" };
      const remaining = limits.thinkPerDay - (quota.thinkPressesToday ?? 0);
      return { allowed: remaining >= amount, remaining: Math.max(0, remaining), limit: limits.thinkPerDay, resetAt: tomorrow, reason: remaining < amount ? `Daily Think limit reached` : undefined };
    }
    case "voice_minute": {
      const remaining = limits.voiceMinsPerMonth - (quota.voiceMinutesThisMonth ?? 0);
      return { allowed: remaining >= amount, remaining: Math.max(0, remaining), limit: limits.voiceMinsPerMonth, resetAt: nextMonth };
    }
    case "token": {
      const remaining = limits.tokensPerDay - (quota.tokensToday ?? 0);
      return { allowed: remaining >= amount, remaining: Math.max(0, remaining), limit: limits.tokensPerDay, resetAt: tomorrow };
    }
    default:
      return { allowed: true, remaining: 999, limit: 999, resetAt: new Date() };
  }
}

export async function incrementQuota(userId: number, action: QuotaAction, amount = 1): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const quota = await getOrCreateQuota(userId);
  switch (action) {
    case "message": await db.update(userQuotas).set({ messagesToday: (quota.messagesToday ?? 0) + amount }).where(eq(userQuotas.userId, userId)); break;
    case "agentic_task": await db.update(userQuotas).set({ agenticTasksThisMonth: (quota.agenticTasksThisMonth ?? 0) + amount }).where(eq(userQuotas.userId, userId)); break;
    case "think": await db.update(userQuotas).set({ thinkPressesToday: (quota.thinkPressesToday ?? 0) + amount }).where(eq(userQuotas.userId, userId)); break;
    case "voice_minute": await db.update(userQuotas).set({ voiceMinutesThisMonth: (quota.voiceMinutesThisMonth ?? 0) + amount }).where(eq(userQuotas.userId, userId)); break;
    case "token": await db.update(userQuotas).set({ tokensToday: (quota.tokensToday ?? 0) + amount }).where(eq(userQuotas.userId, userId)); break;
  }
}

export async function getQuotaSummary(userId: number) {
  const quota = await getOrCreateQuota(userId);
  const tier = quota.tier as Tier;
  const limits = QUOTA_LIMITS[tier];
  return {
    tier,
    trial: quota.tier === "trial" ? { endsAt: quota.trialEndsAt, daysLeft: quota.trialEndsAt ? Math.max(0, Math.ceil((quota.trialEndsAt.getTime() - Date.now()) / 86400000)) : 0 } : null,
    messages: { used: quota.messagesToday ?? 0, limit: limits.msgsPerDay, remaining: limits.msgsPerDay - (quota.messagesToday ?? 0), resetAt: getNextMidnightUTC() },
    tasks: { used: quota.agenticTasksThisMonth ?? 0, limit: limits.tasksPerMonth + (quota.byosBonusTasks ?? 0), remaining: limits.tasksPerMonth + (quota.byosBonusTasks ?? 0) - (quota.agenticTasksThisMonth ?? 0), resetAt: getNextMonthReset() },
    think: { used: quota.thinkPressesToday ?? 0, limit: limits.thinkPerDay, remaining: limits.thinkPerDay - (quota.thinkPressesToday ?? 0), resetAt: getNextMidnightUTC() },
    voice: { used: quota.voiceMinutesThisMonth ?? 0, limit: limits.voiceMinsPerMonth, remaining: limits.voiceMinsPerMonth - (quota.voiceMinutesThisMonth ?? 0), resetAt: getNextMonthReset() },
    byos: { enabled: quota.hasByos ?? false, bonusTasks: quota.byosBonusTasks ?? 0 },
  };
}

export async function activateTrial(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const existing = await db.select().from(userQuotas).where(eq(userQuotas.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(userQuotas).set({ tier: "trial", trialStartedAt: now, trialEndsAt: trialEnd }).where(eq(userQuotas.userId, userId));
  } else {
    await db.insert(userQuotas).values({ userId, tier: "trial", trialStartedAt: now, trialEndsAt: trialEnd });
  }
}

export async function setUserTier(userId: number, tier: Tier): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(userQuotas).set({ tier }).where(eq(userQuotas.userId, userId));
}

async function getOrCreateQuota(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(userQuotas).where(eq(userQuotas.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];
  await db.insert(userQuotas).values({ userId, tier: "free" });
  const created = await db.select().from(userQuotas).where(eq(userQuotas.userId, userId)).limit(1);
  return created[0];
}

async function resetDailyIfNeeded(userId: number, quota: any) {
  const db = await getDb();
  if (!db) return quota;
  const lastReset = quota.dailyResetAt ?? new Date(0);
  const midnight = getLastMidnightUTC();
  if (lastReset < midnight) {
    await db.update(userQuotas).set({ messagesToday: 0, thinkPressesToday: 0, tokensToday: 0, dailyResetAt: new Date() }).where(eq(userQuotas.userId, userId));
    return { ...quota, messagesToday: 0, thinkPressesToday: 0, tokensToday: 0 };
  }
  return quota;
}

async function resetMonthlyIfNeeded(userId: number, quota: any) {
  const db = await getDb();
  if (!db) return quota;
  const lastReset = quota.monthlyResetAt ?? new Date(0);
  const firstOfMonth = getFirstOfMonthUTC();
  if (lastReset < firstOfMonth) {
    await db.update(userQuotas).set({ agenticTasksThisMonth: 0, voiceMinutesThisMonth: 0, monthlyResetAt: new Date() }).where(eq(userQuotas.userId, userId));
    return { ...quota, agenticTasksThisMonth: 0, voiceMinutesThisMonth: 0 };
  }
  return quota;
}

function getNextMidnightUTC(): Date { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d; }
function getLastMidnightUTC(): Date { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; }
function getFirstOfMonthUTC(): Date { const d = new Date(); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); return d; }
function getNextMonthReset(): Date { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1, 1); d.setUTCHours(0, 0, 0, 0); return d; }
