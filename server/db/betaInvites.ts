import { getDb } from "../db";
import { betaInviteCodes } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import crypto from "crypto";

/**
 * Generate a unique beta invite code
 */
export async function generateBetaInviteCode(
  createdBy: number,
  options?: {
    maxUses?: number;
    expiresAt?: Date;
  }
): Promise<string> {
  const db = await getDb();
  const code = nanoid(12).toUpperCase();

  await db!.insert(betaInviteCodes).values({
    id: crypto.randomUUID(),
    code,
    createdBy,
    maxUses: options?.maxUses ?? null,
    expiresAt: options?.expiresAt ?? null,
    isActive: true,
    usageCount: 0,
  });

  return code;
}

/**
 * Validate and use a beta invite code
 */
export async function useBetaInviteCode(
  code: string,
  userId: number
): Promise<{ valid: boolean; reason?: string }> {
  const db = await getDb();

  if (!db) return { valid: true }; // DB not available — open access

  // Find the code
  const record = await db
    .select()
    .from(betaInviteCodes)
    .where(eq(betaInviteCodes.code, code.toUpperCase()))
    .limit(1);

  if (!record || record.length === 0) {
    return { valid: false, reason: "Invalid invite code" };
  }

  const invite = record[0];

  // Check if active
  if (!invite.isActive) {
    return { valid: false, reason: "Invite code is no longer active" };
  }

  // Check expiration
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return { valid: false, reason: "Invite code has expired" };
  }

  // Check usage limit
  if (invite.maxUses && invite.usageCount >= invite.maxUses) {
    return { valid: false, reason: "Invite code has reached its usage limit" };
  }

  // Mark as used
  await db
    .update(betaInviteCodes)
    .set({
      usedBy: userId,
      usageCount: (invite.usageCount ?? 0) + 1,
    })
    .where(eq(betaInviteCodes.id, invite.id));

  return { valid: true };
}

/**
 * Get all beta invite codes (admin only)
 */
export async function getAllBetaInviteCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(betaInviteCodes).orderBy(betaInviteCodes.createdAt);
}

/**
 * Deactivate a beta invite code
 */
export async function deactivateBetaInviteCode(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(betaInviteCodes).set({ isActive: false }).where(eq(betaInviteCodes.id, id));
}

/**
 * Check if registration requires an invite code (beta mode)
 */
export async function isBetaMode(): Promise<boolean> {
  return process.env.BETA_MODE === "true";
}
