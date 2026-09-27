import { createHmac, timingSafeEqual } from "crypto";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export interface TelegramUser {
  sutaeruUserId: number;
  telegramUserId: number;
  telegramUsername?: string;
}

/**
 * Get or create a Sutaeru user linked to a Telegram user
 */
export async function getOrCreateTelegramUser(telegramUserId: number, telegramUsername?: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // For now, just use a fixed user ID or create a bot user
  // In production, you'd want proper user management per Telegram user

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, `telegram_${telegramUserId}@sutaeru.local`))
    .limit(1);

  if (existingUser.length > 0) {
    return existingUser[0].id;
  }

  // Create a new Telegram-linked user. No passwordHash: these accounts can't use password login.
  const result = await db.insert(users).values({
    openId: `telegram_${telegramUserId}`,
    name: telegramUsername ?? null,
    email: `telegram_${telegramUserId}@sutaeru.local`,
    loginMethod: "telegram",
    emailVerified: true,
    role: "user",
  }).returning({ id: users.id });

  return result[0].id;
}

/**
 * Verify Telegram webhook signature
 */
export function verifyTelegramSignature(telegramToken: string, data: string, hash: string): boolean {
  const calculated = Buffer.from(createHmac("sha256", telegramToken).update(data).digest("hex"));
  const received = Buffer.from(hash);
  return calculated.length === received.length && timingSafeEqual(calculated, received);
}
