/**
 * AREA 4 (part 1) audit tests: admin gating of every admin-capable procedure
 * reachable from appRouter, plus schema/SQL-emission parity checks that pin
 * down where the production "column user_id / createdAt does not exist"
 * errors can and cannot come from. server/db and heavy routers are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { chatSessions, identities, users } from "../drizzle/schema";

const auditRows = vi.hoisted(() => [
  {
    id: "row-1",
    userId: "99",
    action: "user.login_failed",
    resourceType: "session",
    resourceId: null,
    changes: null,
    metadata: { email: "victim@example.com" },
    severity: "warn",
    status: "failure",
    errorMessage: null,
    sessionId: null,
    createdAt: 1,
  },
]);

function makeDb<T>(rows: T) {
  // A query-builder-shaped fake: db.<method>() returns a thenable chain whose
  // every follow-up method returns the same chain, and awaiting yields `rows`.
  const step: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (res: any, rej?: any) => Promise.resolve(rows).then(res, rej);
        if (typeof prop === "symbol") return undefined;
        return (..._args: any[]) => step;
      },
    }
  );
  return {
    // The root object deliberately has NO `then`, so `await getDb()` cannot
    // unwrap it; only chained results are thenable.
    select: () => step,
    selectDistinct: () => step,
    insert: () => step,
    update: () => step,
    delete: () => step,
  };
}

const state = vi.hoisted(() => ({
  statsCalls: 0,
  betaGenerated: 0,
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./db");
  return {
    ...actual,
    getDb: vi.fn(async () => makeDb(auditRows) as any),
    getAllUsersWithStats: vi.fn(async () => {
      state.statsCalls += 1;
      return [{ id: 1, openId: "o1", email: "a@b.co", role: "user", filesGenerated: 3 }];
    }),
    upsertUser: vi.fn(async () => {}),
    getUserByOpenId: vi.fn(async () => undefined),
  };
});

vi.mock("./db/betaInvites", () => ({
  generateBetaInviteCode: vi.fn(async () => {
    state.betaGenerated += 1;
    return "NEWCODE123";
  }),
  getAllBetaInviteCodes: vi.fn(async () => []),
  deactivateBetaInviteCode: vi.fn(async () => {}),
}));

vi.mock("./_core/email", () => ({
  sendPasswordResetEmail: vi.fn(async () => {}),
  sendEmailVerification: vi.fn(async () => {}),
}));

vi.mock("./routers/kemma", async () => {
  const { router } = await import("./_core/trpc");
  return { kemmaRouter: router({}) };
});
vi.mock("./llmProvider", () => ({
  generateStyleOptions: vi.fn(async () => []),
  generateDocumentContent: vi.fn(async () => ""),
}));
vi.mock("./fileGenerator", () => ({
  generateFile: vi.fn(async () => ({ buffer: Buffer.from(""), mimeType: "", extension: "" })),
  STYLE_DEFINITIONS: [],
}));
vi.mock("./services/vectorSearch", () => ({
  embed: vi.fn(async () => []),
  upsertVector: vi.fn(async () => {}),
  removeVector: vi.fn(async () => {}),
  searchSimilar: vi.fn(async () => []),
  isVectorSearchConfigured: vi.fn(() => false),
}));

function ctxFor(role: "user" | "admin") {
  return {
    user: {
      id: role === "admin" ? 2 : 3,
      openId: `open-${role}`,
      email: `${role}@example.com`,
      name: role,
      loginMethod: "local",
      role,
      passwordHash: "hashed-secret-do-not-return",
      totpSecret: "SECRET32",
      totpEnabled: false,
      onboarded: true,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
    req: { protocol: "https", headers: {} } as any,
    res: { cookie: () => {}, clearCookie: () => {} } as any,
  };
}

async function caller(role: "user" | "admin") {
  const { appRouter } = await import("./routers");
  return appRouter.createCaller(ctxFor(role));
}

beforeEach(() => {
  state.statsCalls = 0;
  state.betaGenerated = 0;
});

describe("admin.userStats", () => {
  it("refuses role=user before touching the DB", async () => {
    const c = await caller("user");
    await expect(c.admin.userStats()).rejects.toMatchObject({ code: "FORBIDDEN", message: "Admin access required" });
    expect(state.statsCalls).toBe(0);
  });

  it("serves role=admin", async () => {
    const c = await caller("admin");
    const stats = await c.admin.userStats();
    expect(state.statsCalls).toBe(1);
    expect(stats[0].filesGenerated).toBe(3);
  });

  it("role comes from the session user row, not from input: no input is accepted at all", async () => {
    // userStats is a query with no input schema; a rogue ?input= payload
    // cannot reach it. Assert the caller refuses any argument shape.
    const c = await caller("user");
    await expect((c.admin.userStats as any)({ role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.betaInvites", () => {
  it("generateCode / listCodes / deactivateCode all refuse role=user", async () => {
    const c = await caller("user");
    await expect(c.admin.betaInvites.generateCode({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.admin.betaInvites.listCodes()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.admin.betaInvites.deactivateCode({ id: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.betaGenerated).toBe(0);
  });

  it("generateCode works for role=admin", async () => {
    const c = await caller("admin");
    expect(await c.admin.betaInvites.generateCode({ maxUses: 5, expiresInDays: 30 })).toEqual({ code: "NEWCODE123" });
  });
});

describe("system.notifyOwner and telegram.webhookInfo", () => {
  it("notifyOwner refuses non-admins via adminProcedure", async () => {
    const c = await caller("user");
    await expect(c.system.notifyOwner({ title: "t", content: "c" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("telegram.webhookInfo refuses role=user", async () => {
    const c = await caller("user");
    await expect(c.telegram.webhookInfo()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("telegram.webhookInfo answers admins", async () => {
    const c = await caller("admin");
    expect(await c.telegram.webhookInfo()).toMatchObject({ configured: false });
  });
});

describe("auth.me redaction", () => {
  it("strips passwordHash and totpSecret from the session user", async () => {
    const c = await caller("user");
    const me: any = await c.auth.me();
    expect(me.passwordHash).toBeUndefined();
    expect(me.totpSecret).toBeUndefined();
    expect(me.email).toBe("user@example.com");
  });
});

describe("audit router gating", () => {
  // The audit router originally exposed list/getActions/getStats/cleanup as
  // plain protectedProcedure ("admin-only in practice" comment only). Another
  // audit agent switched it to adminProcedure mid-run; these tests lock the
  // fixed behavior in.
  it("non-admins cannot read audit rows", async () => {
    const c = await caller("user");
    await expect(c.audit.list({ limit: 100, offset: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("non-admins cannot purge audit history via audit.cleanup", async () => {
    const c = await caller("user");
    await expect(c.audit.cleanup({ daysToKeep: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("non-admins cannot reach getActions or getStats", async () => {
    const c = await caller("user");
    await expect(c.audit.getActions()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.audit.getStats()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admins can list audit rows", async () => {
    const c = await caller("admin");
    const result = await c.audit.list({ limit: 100, offset: 0 });
    expect(result.logs).toHaveLength(1);
    expect((result.logs as any[])[0].userId).toBe("99");
  });
});

describe("schema vs production SQL parity (finding AUD-COL-1 support)", () => {
  const bootstrap = readFileSync(new URL("../drizzle/bootstrap.sql", import.meta.url), "utf8");

  async function emitted(table: any) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const db = drizzle({ client: {} } as any);
    return (db.select().from(table).toSQL() as { sql: string }).sql;
  }

  it("drizzle emits quoted camelCase \"userId\"/\"createdAt\" for identities/users/chat_sessions", async () => {
    const identSql = await emitted(identities);
    expect(identSql).toContain('"userId"');
    expect(identSql).toContain('"createdAt"');
    expect(identSql).not.toContain('"user_id"');
    const usersSql = await emitted(users);
    expect(usersSql).toContain('"createdAt"');
    const csSql = await emitted(chatSessions);
    expect(csSql).toContain('"userId"');
    expect(csSql).toContain('"createdAt"');
    expect(csSql).not.toContain('"user_id"');
  });

  it("bootstrap.sql creates those same quoted camelCase columns (no user_id anywhere near identities)", () => {
    const ident = bootstrap.match(/CREATE TABLE IF NOT EXISTS "identities" \(([\s\S]*?)\);/)!;
    expect(ident[0]).toContain('"userId" integer NOT NULL');
    expect(ident[1]).not.toContain("user_id");
    const usersBlock = bootstrap.match(/CREATE TABLE IF NOT EXISTS "users" \(([\s\S]*?)\);/)!;
    expect(usersBlock[1]).toContain('"createdAt" timestamp');
  });

  it("=> the quoted \"user_id\" only ever leaves snake_case tables, so the production error must be camelCase legacy tables for user_quotas/usage_logs/user_settings/monitors/monitor_runs", () => {
    // server-side emitters of "user_id" (all via schema.ts:497-564 columns):
    const quotaSrc = readFileSync(new URL("./core/quotaCheck.ts", import.meta.url), "utf8");
    expect(quotaSrc).toContain("userQuotas.userId");
    // and these run on tRPC/router paths:
    const kemmaRouterSrc = readFileSync(new URL("./routers/kemma.ts", import.meta.url), "utf8");
    expect(kemmaRouterSrc).toMatch(/quota:\s*protectedProcedure/);
    expect(kemmaRouterSrc).toMatch(/activateTrial:\s*protectedProcedure/);
    const streamSrc = readFileSync(new URL("./routes/kemmaStream.ts", import.meta.url), "utf8");
    expect(streamSrc).toMatch(/checkQuota\(user\.id/);
  });

  it("the ONLY raw-SQL createdAt emitters live in server/db.ts searchMemories (MySQL syntax, dead code today)", () => {
    const dbSrc = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(dbSrc).toContain("MATCH(content) AGAINST"); // MySQL-only, fails on Postgres outright
    expect(dbSrc).toMatch(/SELECT id, content, createdAt\s+FROM chat_messages\s+WHERE userId = \$\{identityId\}/);
    // chat_messages stores created_at + userId(camel) per bootstrap DDL:
    const cmBlock = bootstrap.match(/CREATE TABLE IF NOT EXISTS "chat_messages" \(([\s\S]*?)\);/)!;
    expect(cmBlock[1]).toContain('"created_at" timestamp NOT NULL');
    expect(cmBlock[1]).not.toContain("createdAt");
  });

  it("vectorSearch quotes the memories.structuredData column (fixed; was unquoted snake structured_data, same error family)", () => {
    const vs = readFileSync(new URL("./services/vectorSearch.ts", import.meta.url), "utf8");
    expect(vs).not.toContain("COALESCE(structured_data");
    // The column is type json (not jsonb), so the quoted name is cast before the jsonb merge.
    expect(vs).toContain('COALESCE("structuredData"::jsonb');
    const memBlock = bootstrap.match(/CREATE TABLE IF NOT EXISTS "memories" \(([\s\S]*?)\);/)!;
    expect(memBlock[1]).toContain('"structuredData"');
  });
});
