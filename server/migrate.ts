/**
 * Standalone migration runner for PostgreSQL.
 *
 * 1. drizzle/bootstrap.sql: idempotent base schema (creates only what is missing).
 * 2. drizzle/migrations/: journaled drizzle migrations, applied on top.
 * 3. drizzle/optional/pgvector.sql: vector columns and hnsw indexes, applied only when the
 *    database offers the vector extension - plain Postgres images and managed providers without
 *    it (decision D4) must still migrate cleanly. Retrieval code asks
 *    server/core/dbCapabilities.ts#hasPgvector() rather than assuming these columns exist.
 *
 * Any failure in steps 1-2 exits non-zero so a broken schema fails the deploy instead of shipping.
 * Step 3 only warns: nothing reads the vector columns yet, and CREATE EXTENSION needs privileges
 * a managed database may not grant.
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

function splitStatements(sqlText: string): string[] {
  return sqlText.split(STATEMENT_BREAKPOINT).map((statement) => statement.trim()).filter(Boolean);
}

/** Applies an idempotent .sql file in one transaction, so a half-applied file never sticks. */
async function applySqlFile(pool: pg.Pool, relativePath: string[], label: string): Promise<void> {
  const sqlText = await readFile(path.join(process.cwd(), ...relativePath), "utf-8");
  const statements = splitStatements(sqlText);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) await client.query(statement);
    await client.query("COMMIT");
    console.log(`${label} (${statements.length} statements).`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function applyBootstrap(pool: pg.Pool) {
  await applySqlFile(pool, ["drizzle", "bootstrap.sql"], "Bootstrap schema ensured");
}

/**
 * Step 3: the pgvector schema, when the extension can be installed here. Re-run this runner after
 * adding the extension (see ops/postgres/README.md) to get the columns on an already-migrated
 * database; the file is idempotent so repeating it costs nothing.
 */
async function applyOptionalPgvector(pool: pg.Pool) {
  const available = await pool.query(
    "SELECT 1 FROM pg_available_extensions WHERE name = 'vector'"
  );
  if (available.rows.length === 0) {
    console.warn(
      "[migrate] The vector extension is not available in this database, so drizzle/optional/pgvector.sql was skipped. " +
        "Keyword search and JSON embeddings keep working; install pgvector (ops/postgres/README.md) and re-run migrations for vector search."
    );
    return;
  }

  try {
    await applySqlFile(pool, ["drizzle", "optional", "pgvector.sql"], "Optional pgvector schema ensured");
  } catch (err) {
    console.warn(
      "[migrate] Optional pgvector statements failed; continuing without vector columns:",
      err instanceof Error ? err.message : err
    );
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
    await applyOptionalPgvector(pool);
    console.log("Migrations complete.");
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
