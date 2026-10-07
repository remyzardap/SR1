/**
 * dbCapabilities.ts - cached probes for optional database features.
 *
 * Phase 2 code must not assume the pgvector extension is present: a managed provider may not
 * offer it (decision D4) and plain Postgres images do not ship it, so server/migrate.ts applies
 * drizzle/optional/pgvector.sql only when the extension is available. Retrieval callers ask
 * hasPgvector() instead and degrade to the keyword path.
 *
 * A probe runs at most once per process and never throws - an unreachable database answers
 * "not available" rather than failing the request that asked.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";

let pgvectorProbe: Promise<boolean> | null = null;

async function probePgvector(): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const result = await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
    return ((result as unknown as { rows?: unknown[] }).rows?.length ?? 0) > 0;
  } catch (error) {
    console.warn(
      "[dbCapabilities] pgvector probe failed, treating the extension as absent:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

/**
 * True when the vector extension is installed in the connected database.
 * The answer is memoised for the life of the process: enabling pgvector means running the
 * optional migration and restarting the app anyway, see ops/postgres/README.md.
 */
export function hasPgvector(): Promise<boolean> {
  if (!pgvectorProbe) pgvectorProbe = probePgvector();
  return pgvectorProbe;
}

/** Drops the memo so the next call re-probes; used by tests only. */
export function resetDbCapabilitiesCacheForTests(): void {
  pgvectorProbe = null;
}
