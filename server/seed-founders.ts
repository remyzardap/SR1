/**
 * Founder seed script: creates exclusive founder and owner accounts.
 * These accounts use handle-based login (no email required).
 * Run once after deploying: pnpm seed:founders
 *
 * ─── Security ────────────────────────────────────────────────────────────────
 * Passwords are read from environment variables, NOT hardcoded in source.
 * Set the following env vars before running this script (Railway Variables or
 * a local .env file that is NOT committed to version control):
 *
 *   FOUNDER_PASSWORD_REMY=<strong-password>
 *   FOUNDER_PASSWORD_DONALD=<strong-password>
 *   FOUNDER_PASSWORD_WILLIAM=<strong-password>
 *   FOUNDER_PASSWORD_BASH=<strong-password>
 *   FOUNDER_PASSWORD_MAMA_IDA=<strong-password>
 *   FOUNDER_PASSWORD_ANGEL=<strong-password>
 *   OWNER_PASSWORD_IOWNTHIS=<strong-password>
 *
 * Generate strong passwords with:
 *   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import { identities, users } from "../drizzle/schema";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    console.error(`\n❌  Missing required environment variable: ${key}`);
    console.error(`   Set it before running this script.\n`);
    process.exit(1);
  }
  return value.trim();
}

const FOUNDERS = [
  {
    name: "Remy",
    handle: "remy",
    passwordEnvKey: "FOUNDER_PASSWORD_REMY",
    bio: "Co-founder of Sutaeru.",
    role: "admin" as const,
  },
  {
    name: "Donald",
    handle: "donald",
    passwordEnvKey: "FOUNDER_PASSWORD_DONALD",
    bio: "Co-founder of Sutaeru.",
    role: "admin" as const,
  },
  {
    name: "William",
    handle: "william",
    passwordEnvKey: "FOUNDER_PASSWORD_WILLIAM",
    bio: "Co-founder of Sutaeru.",
    role: "admin" as const,
  },
  {
    name: "Bash",
    handle: "bash",
    passwordEnvKey: "FOUNDER_PASSWORD_BASH",
    bio: "Co-founder of Sutaeru.",
    role: "admin" as const,
  },
  {
    name: "Mama Ida",
    handle: "mama_ida",
    passwordEnvKey: "FOUNDER_PASSWORD_MAMA_IDA",
    bio: "Co-founder of Sutaeru.",
    role: "admin" as const,
  },
  {
    name: "Angel",
    handle: "angel",
    passwordEnvKey: "FOUNDER_PASSWORD_ANGEL",
    bio: "Co-founder of Sutaeru.",
    role: "admin" as const,
  },
  {
    name: "Owner",
    handle: "iownthis",
    passwordEnvKey: "OWNER_PASSWORD_IOWNTHIS",
    bio: "Platform owner.",
    role: "admin" as const,
  },
];

async function main() {
  // Validate all passwords are present before touching the DB
  const founderData = FOUNDERS.map((f) => ({
    ...f,
    password: requireEnv(f.passwordEnvKey),
  }));

  const pool = new pg.Pool({ connectionString: requireEnv("DATABASE_URL") });
  const db = drizzle(pool);

  console.log("\n🚀 Seeding founder & owner accounts...\n");

  for (const founder of founderData) {
    // Check if handle already exists
    const existing = await db
      .select()
      .from(identities)
      .where(eq(identities.handle, founder.handle))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  ⚠️  @${founder.handle} already exists — skipping.`);
      continue;
    }

    // Create user with founder: openId prefix (no email)
    const openId = `founder:${nanoid(21)}`;
    const passwordHash = await bcrypt.hash(founder.password, 12);

    const [user] = await db.insert(users).values({
      openId,
      name: founder.name,
      email: null,
      loginMethod: "founder",
      role: founder.role,
      passwordHash,
      onboarded: true,
      lastSignedIn: new Date(),
    }).returning({ id: users.id });

    // Create identity with handle
    await db.insert(identities).values({
      userId: user.id,
      handle: founder.handle,
      displayName: founder.name,
      bio: founder.bio,
      primaryLanguage: "en",
    });

    console.log(`  ✓ Created @${founder.handle} (${founder.name}) — role: ${founder.role}`);
  }

  console.log("\n✅ All accounts ready.\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  HANDLES CREATED");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const f of FOUNDERS) {
    console.log(`  @${f.handle.padEnd(12)} — password from env: ${f.passwordEnvKey}`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ⚠️  Passwords are NOT printed here for security.");
  console.log("  ⚠️  Store PASSWORD_* vars securely in Railway.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Founder seed failed:", err);
  process.exit(1);
});
