/**
 * deploy.audit.test.ts - static audit of config docs, drizzle migrations, the
 * schema-vs-bootstrap contract, and the Docker/deploy wiring.
 *
 * Reads files from the repo only: no DB, no network, no env mutation.
 * Written by audit area 8 (config, migrations, deploy sanity).
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(path.join(ROOT, rel));

function walkTs(dir: string, acc: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!statSync(abs).isDirectory()) return acc;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTs(p, acc);
    else if (/\.ts$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Migration journal vs files
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Known journal gaps. drizzle/migrations/ holds these two files but the journal
 * does not list them, so the drizzle migrator never applies them:
 *  - 0013_add_beta_invite_codes.sql: MySQL dialect (backticks, `datetime`,
 *    `ON UPDATE CURRENT_TIMESTAMP`); it would ERROR on Postgres anyway. The
 *    beta_invite_codes table comes from bootstrap.sql instead (verified below).
 *  - 0014_add_blocks.sql: Postgres dialect, but its block_source enum uses the
 *    legacy value "her" while schema.ts/bootstrap use "kemma". Skipped; the
 *    blocks table comes from bootstrap.sql instead (verified below).
 * If these files are deleted or added to the journal, update this allowlist.
 */
const JOURNAL_GAPS = new Set(["0013_add_beta_invite_codes", "0014_add_blocks"]);

describe("drizzle migration journal", () => {
  const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")) as {
    dialect: string;
    entries: { idx: number; tag: string }[];
  };
  const sqlFiles = readdirSync(path.join(ROOT, "drizzle/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""));

  it("uses the postgresql dialect", () => {
    expect(journal.dialect).toBe("postgresql");
  });

  it("has contiguous idx values starting at 0 in tag order", () => {
    journal.entries.forEach((e, i) => {
      expect(e.idx).toBe(i);
    });
    const tags = journal.entries.map((e) => e.tag);
    expect(tags).toEqual([...tags].sort());
  });

  it("maps every journal entry to an existing, non-empty .sql file", () => {
    for (const e of journal.entries) {
      const file = path.join(ROOT, "drizzle/migrations", `${e.tag}.sql`);
      expect(exists(`drizzle/migrations/${e.tag}.sql`), `missing file for journal entry ${e.tag}`).toBe(true);
      expect(readFileSync(file, "utf-8").trim().length, `empty file for ${e.tag}`).toBeGreaterThan(0);
    }
  });

  it("covers every migration file, except the two documented gaps", () => {
    const tagged = new Set(journal.entries.map((e) => e.tag));
    const uncovered = sqlFiles.filter((t) => !tagged.has(t) && !JOURNAL_GAPS.has(t));
    expect(uncovered, `migration files not in the journal: ${uncovered.join(", ")}`).toEqual([]);
    // The two gaps must still be present and still unjournaled, or this test's
    // comments need updating (see JOURNAL_GAPS above).
    for (const gap of JOURNAL_GAPS) {
      expect(sqlFiles, `allowlisted gap file ${gap}.sql disappeared; prune the allowlist`).toContain(gap);
      expect(tagged.has(gap), `${gap} is now journaled; prune the allowlist`).toBe(false);
    }
  });

  it("keeps MySQL-dialect files out of the journaled Postgres chain", () => {
    // A backtick in a journaled file means MySQL output wired into a Postgres
    // run; the migrator would fail on the database.
    for (const e of journal.entries) {
      expect(read(`drizzle/migrations/${e.tag}.sql`), `MySQL backticks in ${e.tag}.sql`).not.toContain("`");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. bootstrap.sql vs drizzle/schema.ts coverage
// ═══════════════════════════════════════════════════════════════════════════════

/** table name -> set of SQL column names, parsed from drizzle/schema.ts pgTable calls. */
function schemaTables(): Map<string, Set<string>> {
  const src = read("drizzle/schema.ts");
  const out = new Map<string, Set<string>>();
  const chunks = src.split(/\n(?=export const )/);
  for (const chunk of chunks) {
    const m = chunk.match(/pgTable\(\s*"([a-z0-9_]+)"/);
    if (!m) continue;
    const cols = new Set<string>();
    for (const c of chunk.matchAll(/\w+:\s*(?:[A-Za-z]*Enum|[a-z]+)\("([^"]+)"/g)) cols.add(c[1]);
    out.set(m[1], cols);
  }
  return out;
}

function bootstrapTables(): Map<string, Set<string>> {
  const src = read("drizzle/bootstrap.sql");
  const out = new Map<string, Set<string>>();
  for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS "([a-z0-9_]+)" \(([\s\S]*?)\n\);/g)) {
    const cols = new Set<string>();
    for (const c of m[2].matchAll(/^\t"([a-zA-Z_][a-zA-Z0-9_]*)" /gm)) cols.add(c[1]);
    out.set(m[1], cols);
  }
  return out;
}

describe("schema vs bootstrap coverage", () => {
  const schema = schemaTables();
  const boot = bootstrapTables();
  const journaledSql = JSON.parse(read("drizzle/migrations/meta/_journal.json"))
    .entries.map((e: { tag: string }) => read(`drizzle/migrations/${e.tag}.sql`))
    .join("\n");

  it("parses the expected number of schema tables", () => {
    // 31 pgTable(...) definitions today; a drop here means the parser broke.
    expect(schema.size).toBeGreaterThanOrEqual(31);
    expect(boot.size).toBeGreaterThanOrEqual(28);
  });

  it("creates every schema.ts table in bootstrap.sql or a journaled migration", () => {
    for (const table of [...schema.keys()].sort()) {
      const inBoot = boot.has(table);
      const inJournal = new RegExp(`CREATE TABLE IF NOT EXISTS "?${table}"? \\(`).test(journaledSql);
      expect(inBoot || inJournal, `table "${table}" is mapped in schema.ts but created by neither bootstrap.sql nor a journaled migration`).toBe(true);
    }
  });

  it("keeps bootstrap columns identical to the schema.ts mappings", () => {
    for (const [table, bootCols] of boot) {
      const schemaCols = schema.get(table);
      expect(schemaCols, `bootstrap creates "${table}" which schema.ts does not map`).toBeTruthy();
      const missing = [...(schemaCols as Set<string>)].filter((c) => !bootCols.has(c));
      const extra = [...bootCols].filter((c) => !schemaCols!.has(c));
      expect(missing, `bootstrap "${table}" lacks schema columns: ${missing.join(", ")}`).toEqual([]);
      expect(extra, `bootstrap "${table}" has columns absent from schema.ts: ${extra.join(", ")}`).toEqual([]);
    }
  });

  it("documents which tables live only in journaled migrations", () => {
    // These four are intentionally NOT in bootstrap.sql: each is created by a
    // journaled migration (skill_reviews by 0022, user_settings/monitors/
    // monitor_runs by 0023). If bootstrap gains or loses one, update this list.
    const onlyInMigrations = [...schema.keys()].filter((t) => !boot.has(t)).sort();
    expect(onlyInMigrations).toEqual(["monitor_runs", "monitors", "skill_reviews", "user_settings"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. bootstrap.sql idempotent shape (safe to re-run: migrate.ts runs it on every start)
// ═══════════════════════════════════════════════════════════════════════════════

describe("bootstrap.sql idempotent shape", () => {
  const statements = read("drizzle/bootstrap.sql")
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);

  it("has no bare CREATE TABLE (every one guarded with IF NOT EXISTS)", () => {
    for (const stmt of statements) {
      if (/^CREATE TABLE/i.test(stmt)) {
        expect(stmt, `bare CREATE TABLE would fail on re-run: ${stmt.slice(0, 60)}...`).toMatch(/CREATE TABLE IF NOT EXISTS/i);
      }
    }
  });

  it("has no bare CREATE INDEX (guarded or wrapped in DO blocks)", () => {
    for (const stmt of statements) {
      if (/^CREATE (UNIQUE )?INDEX/i.test(stmt)) {
        expect(stmt, `bare CREATE INDEX would fail on re-run: ${stmt.slice(0, 60)}...`).toMatch(/CREATE (UNIQUE )?INDEX IF NOT EXISTS/i);
      }
    }
  });

  it("creates types and constraints only through guarded DO blocks", () => {
    for (const stmt of statements) {
      if (/^CREATE TYPE/i.test(stmt)) {
        expect(stmt, "top-level CREATE TYPE is not idempotent; wrap in DO $$ IF NOT EXISTS").toMatch(/^DO /i);
      }
      if (/^ALTER TABLE/i.test(stmt) && /ADD CONSTRAINT/i.test(stmt)) {
        expect(stmt, "top-level ADD CONSTRAINT is not idempotent; wrap in DO $$").toMatch(/^DO /i);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Legacy drizzle/ directory is inert
// ═══════════════════════════════════════════════════════════════════════════════

describe("legacy top-level drizzle/ migrations are inert", () => {
  it("drizzle.config.ts outputs to drizzle/migrations, not drizzle/", () => {
    const cfg = read("drizzle.config.ts");
    expect(cfg).toContain('out: "./drizzle/migrations"');
    expect(cfg).toContain("dialect: \"postgresql\"");
  });

  it("server/migrate.ts applies only bootstrap.sql and drizzle/migrations", () => {
    const m = read("server/migrate.ts");
    expect(m).toContain('path.join(process.cwd(), "drizzle", "migrations")');
    expect(m).not.toMatch(/"drizzle", ""|migrationsFolder: path\.join\(process\.cwd\(\), "drizzle"\)/);
  });

  it("the legacy drizzle/meta/_journal.json is MySQL, its first entry has no file, and the legacy .sql set mixes dialects", () => {
    const legacy = JSON.parse(read("drizzle/meta/_journal.json")) as { dialect: string; entries: { tag: string }[] };
    expect(legacy.dialect).toBe("mysql");
    // Nothing points at this folder (config + migrate.ts use drizzle/migrations),
    // and its first entry's file was moved to _archive: if any tool ever ran it
    // against Postgres it would fail on the missing file or on MySQL syntax.
    expect(exists(`drizzle/${legacy.entries[0].tag}.sql`)).toBe(false);
    const legacyFiles = readdirSync(path.join(ROOT, "drizzle")).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
    const mysqlish = legacyFiles.filter((f) => {
      const body = read(`drizzle/${f}`);
      return body.includes("`") || /\bAUTO_INCREMENT\b|\bdatetime\b|ON UPDATE CURRENT_TIMESTAMP/.test(body);
    });
    // The early legacy files (0000_rainy_pandemic onward) are Postgres, the
    // later ones (0008+ and the orphan 0013) are MySQL output. Mixed dialects
    // in one unjournaled folder is exactly why re-applying it would be unsafe.
    expect(mysqlish.length).toBeGreaterThan(0);
    expect(mysqlish.length).toBeLessThan(legacyFiles.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Environment variable documentation drift (static text checks)
// ═══════════════════════════════════════════════════════════════════════════════

describe("env var docs vs code", () => {
  const codeFiles = [...walkTs("server"), ...walkTs("shared")].filter((f) => !/\.test\.ts$/.test(f));
  const codeBlob = codeFiles.map(read).join("\n");

  const readByCode = new Set<string>();
  for (const m of codeBlob.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) readByCode.add(m[1]);
  // Indirect reads: the kemmaRouter slot table, the fnImage engine slots, and the secretManager pull list.
  for (const m of read("server/core/kemmaRouter.ts").matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)) readByCode.add(m[1]);
  for (const m of read("server/lib/fnImage.ts").matchAll(/env: "([A-Z][A-Z0-9_]+)"/g)) readByCode.add(m[1]);
  for (const m of read("server/_core/secretManager.ts").matchAll(/"([A-Z][A-Z0-9_]+)",\n/g)) readByCode.add(m[1]);

  const doc = read("ENVIRONMENT_VARIABLES.md");
  const example = read(".env.example");
  const documented = (name: string) =>
    new RegExp(`\\b${name}\\b`).test(doc) || new RegExp(`^${name}=`, "m").test(example);

  /**
   * Variables the code reads that appear in NEITHER ENVIRONMENT_VARIABLES.md
   * NOR .env.example. Each is a documentation gap from the audit report:
   *  - Google/GCP runtime: GOOGLE_CLOUD_PROJECT (secretManager defaults the
   *    project id when unset), GOOGLE_REDIRECT_URI, SKIP_SECRET_MANAGER,
   *    JWT_SECRET (mentioned only inline in the SESSION_SECRET row),
   *    SONAR_PERPLEXITY / SONAR_PERPLEXITY_API_KEY / PERPLEXITY_API_KEY /
   *    GEMINI (legacy key aliases).
   *  - Platform leftovers: REPLIT_DEV_DOMAIN, REPLIT_DOMAINS,
   *    RAILWAY_PUBLIC_DOMAIN.
   *  - Feature flags / tools: BETA_MODE, OPENCLAW_WEBHOOK_URL, WHATSAPP_* (3),
   *    E2B_* (2), BROWSER_USE_API_KEY, BUILT_IN_FORGE_* (2).
   *  - Seed helpers: HANDLE, DISPLAY_NAME, TEST_PASSWORD (note: docs and
   *    .env.example name it SEED_TEST_PASSWORD, the code reads TEST_PASSWORD).
   */
  const UNDOCUMENTED_ALLOWLIST = new Set([
    "BETA_MODE", "BROWSER_USE_API_KEY", "BUILT_IN_FORGE_API_KEY", "BUILT_IN_FORGE_API_URL",
    "E2B_API_KEY", "E2B_SANDBOX_TEMPLATE", "GEMINI", "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_REDIRECT_URI", "JWT_SECRET", "OPENCLAW_WEBHOOK_URL", "PERPLEXITY_API_KEY",
    "RAILWAY_PUBLIC_DOMAIN", "REPLIT_DEV_DOMAIN", "REPLIT_DOMAINS", "SKIP_SECRET_MANAGER",
    "SONAR_PERPLEXITY", "SONAR_PERPLEXITY_API_KEY",
    "WHATSAPP_API_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN",
  ]);

  it("every var read by server code is documented or allowlisted as a gap", () => {
    const orphans = [...readByCode].filter((n) => !documented(n) && !UNDOCUMENTED_ALLOWLIST.has(n)).sort();
    expect(orphans, `new undocumented env reads: ${orphans.join(", ")}`).toEqual([]);
    // Keep the allowlist honest: everything in it must still be read by code.
    for (const n of UNDOCUMENTED_ALLOWLIST) {
      expect(readByCode.has(n), `allowlisted gap ${n} is no longer read; prune the allowlist`).toBe(true);
    }
  });

  /**
   * Documented/example vars that no server or shared code reads.
   *  - STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET: the stripe npm package is a
   *    dependency but nothing constructs a client or verifies a webhook;
   *    server/stripeProducts.ts is a static price list. Billing is not wired.
   *  - AWS_*: @aws-sdk/client-s3 is a dependency but no code reads the vars;
   *    the S3 storage driver was never implemented.
   *  - SEED_TEST_PASSWORD: scripts/check-env.sh checks it, but the seed script
   *    reads TEST_PASSWORD instead (server/seed-test-account.ts:17) - a real
   *    name mismatch, not just docs drift.
   *  - OWNER_OPEN_ID / VITE_APP_ID etc. are covered above because this check
   *    looks at docs+example keys, not only tables.
   * The EVAL_* vars are read by evals/research/run.ts (outside server/), so
   * they are NOT dead; they are verified live by the eval test below.
   */
  const DEAD_DOC_ALLOWLIST = new Set([
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_S3_BUCKET",
    "SEED_TEST_PASSWORD", "DB_PASSWORD",
  ]);

  it("documented vars are read by code or allowlisted as dead", () => {
    const docVars = new Set<string>();
    for (const m of doc.matchAll(/^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|/gm)) docVars.add(m[1]);
    for (const m of doc.matchAll(/^([A-Z][A-Z0-9_]+)=[^\n]*$/gm)) docVars.add(m[1]);
    for (const m of example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)) docVars.add(m[1]);
    const evalBlob = walkTs("evals").map(read).join("\n");
    const dead = [...docVars].filter((n) => !codeBlob.includes(n) && !evalBlob.includes(n) && !DEAD_DOC_ALLOWLIST.has(n)).sort();
    expect(dead, `documented but unreferenced vars (prune the allowlist if intentional): ${dead.join(", ")}`).toEqual([]);
  });

  it("the eval vars in .env.example are actually read by the eval harness", () => {
    const evalBlob = walkTs("evals").map(read).join("\n");
    for (const n of ["EVAL_USER_ID", "EVAL_DB_HOST", "EVAL_JUDGE_MODEL"]) {
      expect(evalBlob.includes(n), `${n} documented but the eval harness does not read it`).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Raw-SQL identifier class guard ("column X does not exist" bugs)
// ═══════════════════════════════════════════════════════════════════════════════

describe("raw SQL identifier mismatches (42703 class)", () => {
  /**
   * server/ has exactly one file with hand-written SQL identifiers that do not
   * match drizzle/schema.ts's quoted column names:
   *  - server/db.ts: searchMemories() writes unquoted createdAt / userId /
   *    identityId (folded to createdat/userid/identityid by Postgres, while
   *    the tables hold quoted camelCase) AND uses MySQL-only
   *    MATCH(...) AGAINST(...). Currently has no callers (dead code).
   * server/services/vectorSearch.ts used to belong to this class (upsertVector
   * COALESCEd structured_data against the quoted "structuredData" column); the
   * audit fixed it by interpolating the drizzle column, pinned in
   * server/services/vectorSearch.upsert.audit.test.ts.
   * If a file joins this class again, the audit finding stands: a new 42703.
   */
  const RAW_SQL_ALLOWLIST = ["server/db.ts"];

  it("only the allowlisted files carry camelCase/snake_case raw-SQL identifiers", () => {
    const offenders: string[] = [];
    for (const rel of [...walkTs("server"), ...walkTs("shared")]) {
      if (/\.test\.ts$/.test(rel)) continue;
      const src = read(rel);
      const templates = [...src.matchAll(/sql`([\s\S]*?)`/g)].map((m) => m[1]);
      const risky = templates.some((t) =>
        /MATCH\(|structured_data|\bSELECT\b[^;]*?\b(createdAt|updatedAt|userId|identityId)\b/i.test(t)
      );
      if (risky) offenders.push(rel);
    }
    expect(offenders.sort()).toEqual(RAW_SQL_ALLOWLIST);
  });

  it("no server code references a bare user_id column in SQL", () => {
    // The production error column "user_id" does not exist cannot be produced
    // by this repo's code: the snake_case user_id only ever appears as a
    // schema.ts mapping (which quotes it) or in SQL files, never in server TS.
    for (const rel of [...new Set([...walkTs("server"), ...walkTs("shared")])]) {
      if (/\.test\.ts$/.test(rel)) continue;
      expect(read(rel), `server code must not hardcode a user_id column: ${rel}`).not.toMatch(/\buser_id\b/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Docker / deploy wiring (read-only contract checks)
// ═══════════════════════════════════════════════════════════════════════════════

describe("deploy wiring", () => {
  it("Dockerfile builds dist before running node dist/index.js, migrations first", () => {
    const docker = read("Dockerfile");
    expect(docker).toContain("RUN npm run build");
    const cmdIdx = docker.lastIndexOf('CMD ["sh"');
    expect(cmdIdx).toBeGreaterThan(-1);
    const cmd = docker.slice(cmdIdx);
    expect(cmd).toContain("server/migrate.ts");
    expect(cmd).toContain("node dist/index.js");
    expect(cmd.indexOf("migrate.ts")).toBeLessThan(cmd.indexOf("node dist/index.js"));
  });

  it("package.json build emits dist/index.js and start migrates before boot", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string>; type?: string };
    expect(pkg.type).toBe("module");
    expect(pkg.scripts.build).toMatch(/esbuild server\/_core\/index\.ts[\s\S]*--outdir=dist/);
    expect(pkg.scripts.start).toMatch(/migrate\.ts && node dist\/index\.js/);
  });

  it("production refuses to boot without a session secret, and migrate refuses without DATABASE_URL", () => {
    expect(read("server/_core/index.ts")).toMatch(/isProduction[\s\S]*cookieSecret[\s\S]*process\.exit\(1\)/);
    expect(read("server/migrate.ts")).toMatch(/DATABASE_URL is not set - refusing/);
  });

  it("the CORS allowlist is strict in production and falls back to ALLOWED_ORIGINS then APP_URL", () => {
    const src = read("server/_core/index.ts");
    expect(src).toContain("process.env.ALLOWED_ORIGINS || process.env.APP_URL");
    expect(src).toMatch(/NODE_ENV === "production"[\s\S]{0,220}allowedOrigins\.includes\(origin\)/);
  });

  it("VPS deploy rsyncs source only (no node_modules/dist/.env/secrets) so the image rebuilds everything", () => {
    const wf = read(".github/workflows/deploy.yml");
    for (const ex of ["--exclude=node_modules", "--exclude=dist", "--exclude=.env", "--exclude=secrets"]) {
      expect(wf, `deploy workflow must exclude ${ex}`).toContain(ex);
    }
    expect(wf).toContain("docker compose build");
  });

  it("notes: the compose healthcheck probes /health while the server only exposes /api/health", () => {
    // Not an assertion we want flipped when someone fixes it: assert the fact
    // as-is with an explicit string compare so the fix is a deliberate edit.
    const compose = read("docker-compose.yml");
    const docker = read("Dockerfile");
    const routes = read("server/_core/index.ts");
    expect(routes).toContain("'/api/health'");
    const healthPath = compose.match(/http:\/\/127\.0\.0\.1:5000(\/[a-z/]+)/i)?.[1];
    if (healthPath !== "/api/health" || docker.includes("http://127.0.0.1:${PORT}/health")) {
      // Known mismatch: docker-compose.yml probes ${healthPath} which returns
      // 404, so the container is reported unhealthy even when it serves fine.
      // Recorded in the audit; do not silently "fix" this test - fix the
      // compose file and then both branches become no-ops.
      expect(healthPath).toBe("/health");
    }
  });
});
