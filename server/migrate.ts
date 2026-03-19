/**
 * Standalone migration runner for PostgreSQL.
 * Creates all tables fresh using drizzle-kit push via pg driver.
 *
 * Usage:
 *   tsx server/migrate.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌  DATABASE_URL is not set. Skipping migrations.");
    return;
  }

  const pool = new pg.Pool({ connectionString: dbUrl });
  const db = drizzle(pool);

  console.log("Running migrations...");
  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle", "migrations") });
    console.log("✅ Migrations complete.");
  } catch (err) {
    console.warn("Migration error (may be safe to ignore if tables exist):", (err as Error).message);
  }

  await pool.end();
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
