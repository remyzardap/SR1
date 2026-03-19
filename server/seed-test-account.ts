/**
 * Quick seed script for a single test/founder account.
 * Usage:
 *   HANDLE=myhandle TEST_PASSWORD=mypass tsx server/seed-test-account.ts
 *
 * If HANDLE/TEST_PASSWORD are not set, defaults are used and printed.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { identities, users } from "../drizzle/schema";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { getDb } from "./db";

async function main() {
  const handle = (process.env.HANDLE || "testuser").toLowerCase().trim();
  const password = process.env.TEST_PASSWORD || "test1234";
  const name = process.env.DISPLAY_NAME || handle;

  const db = await getDb();
  if (!db) {
    console.error("❌  Could not connect to database. Is DATABASE_URL set?");
    process.exit(1);
  }

  const existing = await db
    .select()
    .from(identities)
    .where(eq(identities.handle, handle))
    .limit(1);

  if (existing.length > 0) {
    console.log(`\n⚠️  @${handle} already exists — skipping creation.`);
    console.log(`   If you need to reset the password, delete the account first.\n`);
    process.exit(0);
  }

  const openId = `founder:${nanoid(21)}`;
  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(users).values({
    openId,
    name,
    email: null,
    loginMethod: "founder",
    role: "admin",
    passwordHash,
    onboarded: true,
    lastSignedIn: new Date(),
  });

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  await db.insert(identities).values({
    userId: user.id,
    handle,
    displayName: name,
    bio: "Test account.",
    primaryLanguage: "en",
  });

  console.log(`\n✅ Test account created successfully!\n`);
  console.log(`   Handle  : @${handle}`);
  console.log(`   Password: ${password}`);
  console.log(`\n   Log in using the "Founder" tab on the login page.\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
