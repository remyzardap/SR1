/**
 * Standalone migration runner for PostgreSQL.
 *
 * 1. drizzle/bootstrap.sql: idempotent base schema (creates only what is missing).
 * 2. drizzle/migrations/: journaled drizzle migrations, applied on top.
 *
 * Any failure exits non-zero so a broken schema fails the deploy instead of shipping.
 *
 * Usage:
 *   tsx server/migrate.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { readFile } from "fs/promises";

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

async function applyBootstrap(pool: pg.Pool) {
  const sql = await readFile(path.join(process.cwd(), "drizzle", "bootstrap.sql"), "utf-8");
  const statements = sql.split(STATEMENT_BREAKPOINT).map((s) => s.trim()).filter(Boolean);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) await client.query(statement);
    await client.query("COMMIT");
    console.log(`Bootstrap schema ensured (${statements.length} statements).`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    if (process.env.NODE_ENV === "production") {
      console.error("DATABASE_URL is not set - refusing to start without a database.");
      process.exit(1);
    }
    console.error("DATABASE_URL is not set. Skipping migrations.");
    return;
  }

  const pool = new pg.Pool({ connectionString: dbUrl });
  const db = drizzle(pool);

  try {
    console.log("Running migrations...");
    await applyBootstrap(pool);
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle", "migrations") });
    console.log("Migrations complete.");
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
