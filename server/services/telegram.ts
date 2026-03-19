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

  // Create a new Telegram-linked user
  const result = await db.insert(users).values({
    email: `telegram_${telegramUserId}@sutaeru.local`,
    passwordHash: "telegram_oauth",
    isEmailVerified: true,
    role: "user",
  }).returning({ id: users.id });

  return result[0].id;
}

/**
 * Verify Telegram webhook signature
 */
export function verifyTelegramSignature(telegramToken: string, data: string, hash: string): boolean {
  import("crypto").then((crypto) => {
    const hmac = crypto.createHmac("sha256", telegramToken);
    hmac.update(data);
    const calculatedHash = hmac.digest("hex");
    return calculatedHash === hash;
  });
  return false;
}
