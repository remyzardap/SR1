/**
 * T-84: 0026_admin_user_accounts.sql against a real Postgres. It must apply twice without error
 * (additive, idempotent) and leave exactly the two columns drizzle/schema.ts maps for the
 * admin-managed accounts: a forced password change and a switch-off timestamp.
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
const MIGRATION = path.join(ROOT, "drizzle", "migrations", "0026_admin_user_accounts.sql");

function statements(): string[] {
  return readFileSync(MIGRATION, "utf-8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("0026_admin_user_accounts migration (Postgres)", () => {
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
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return new Map(rows.map((r) => [r.column_name, r]));
  }

  it("splits into the two ALTER statements of the spec", () => {
    expect(statements()).toHaveLength(2);
  });

  it("applies twice in a row without error", async () => {
    await expect(applyOnce()).resolves.toBeUndefined();
    await expect(applyOnce()).resolves.toBeUndefined();
  });

  it("adds mustChangePassword as a not-null boolean that defaults to false", async () => {
    const cols = await columns("users");
    expect(cols.get("mustChangePassword")).toMatchObject({
      data_type: "boolean",
      is_nullable: "NO",
    });
    expect(cols.get("mustChangePassword")?.column_default).toContain("false");
  });

  it("adds disabledAt as a nullable timestamp so existing accounts stay switched on", async () => {
    const cols = await columns("users");
    expect(cols.get("disabledAt")).toMatchObject({ is_nullable: "YES" });
    expect(cols.get("disabledAt")?.data_type).toBe("timestamp without time zone");
    expect(cols.get("disabledAt")?.column_default).toBeNull();
  });

  it("leaves the columns that already existed alone", async () => {
    const cols = await columns("users");
    for (const existing of ["openId", "email", "role", "passwordHash", "totpSecret", "updatedAt"]) {
      expect(cols.has(existing), `${existing} should still be there`).toBe(true);
    }
    expect(cols.get("passwordHash")?.is_nullable).toBe("YES");
  });
});
