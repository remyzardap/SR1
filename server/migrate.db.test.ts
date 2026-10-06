/**
 * 0025_phase1_core.sql against a real Postgres: it must apply twice without error (additive and
 * idempotent) and leave the columns, tables and indexes that drizzle/schema.ts maps.
 *
 * Needs TEST_DATABASE_URL pointing at a scratch database that already has the earlier migrations
 * (`DATABASE_URL=$TEST_DATABASE_URL npm run migrate`, as the CI db-tests job does). Skips without it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(ROOT, "drizzle", "migrations", "0025_phase1_core.sql");

function statements(): string[] {
  return readFileSync(MIGRATION, "utf-8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  character_maximum_length: number | null;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("0025_phase1_core migration (Postgres)", () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function applyOnce() {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const statement of statements()) await client.query(statement);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async function columns(table: string): Promise<Map<string, ColumnInfo>> {
    const { rows } = await pool.query<ColumnInfo>(
      `SELECT table_name, column_name, data_type, is_nullable, column_default, character_maximum_length
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return new Map(rows.map((r) => [r.column_name, r]));
  }

  it("splits into the six statements of the spec", () => {
    expect(statements()).toHaveLength(6);
  });

  it("applies twice in a row without error", async () => {
    await expect(applyOnce()).resolves.toBeUndefined();
    await expect(applyOnce()).resolves.toBeUndefined();
  });

  it("adds chat_messages.metadata (jsonb, not null, default {}) and chat_sessions.context_cache (jsonb, nullable)", async () => {
    const messages = await columns("chat_messages");
    expect(messages.get("metadata")).toMatchObject({ data_type: "jsonb", is_nullable: "NO" });
    expect(messages.get("metadata")?.column_default).toContain("'{}'::jsonb");

    const sessions = await columns("chat_sessions");
    expect(sessions.get("context_cache")).toMatchObject({ data_type: "jsonb", is_nullable: "YES" });
  });

  it("creates kv_cache with a (namespace, key) primary key and an expiry index", async () => {
    const cols = await columns("kv_cache");
    expect([...cols.keys()].sort()).toEqual(["created_at", "expires_at", "key", "namespace", "value"]);
    expect(cols.get("namespace")).toMatchObject({ character_maximum_length: 32, is_nullable: "NO" });
    expect(cols.get("key")).toMatchObject({ character_maximum_length: 128, is_nullable: "NO" });
    expect(cols.get("value")).toMatchObject({ data_type: "jsonb", is_nullable: "NO" });

    const { rows: pk } = await pool.query(
      `SELECT a.attname FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'kv_cache'::regclass AND i.indisprimary
        ORDER BY a.attname`,
    );
    expect(pk.map((r) => r.attname)).toEqual(["key", "namespace"]);

    const { rows: idx } = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'kv_cache'`);
    expect(idx.map((r) => r.indexname)).toContain("kv_cache_expires_idx");
  });

  it("creates approvals with the binding columns, a users foreign key and a (user_id, status) index", async () => {
    const cols = await columns("approvals");
    expect([...cols.keys()].sort()).toEqual(
      [
        "args",
        "args_hash",
        "created_at",
        "decided_args",
        "decided_at",
        "executed_at",
        "expires_at",
        "id",
        "preview",
        "result",
        "risk",
        "run_id",
        "session_id",
        "status",
        "target_ref",
        "target_revision",
        "tool",
        "user_id",
      ].sort(),
    );
    expect(cols.get("args_hash")).toMatchObject({ data_type: "character", character_maximum_length: 64, is_nullable: "NO" });
    expect(cols.get("status")?.column_default).toContain("'pending'");
    expect(cols.get("tool")).toMatchObject({ character_maximum_length: 160, is_nullable: "NO" });

    const { rows: fk } = await pool.query(
      `SELECT confrelid::regclass::text AS target FROM pg_constraint
        WHERE conrelid = 'approvals'::regclass AND contype = 'f'`,
    );
    expect(fk.map((r) => r.target)).toEqual(["users"]);

    const { rows: idx } = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'approvals'`);
    expect(idx.map((r) => r.indexname)).toContain("approvals_user_status_idx");
  });
});
