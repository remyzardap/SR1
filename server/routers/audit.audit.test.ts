import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TrpcContext } from "../_core/context";

const dbh = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const auditMw = vi.hoisted(() => ({
  cleanupOldAuditLogs: vi.fn(),
}));
vi.mock("../db", () => dbh);
vi.mock("../middleware/audit-logging", () => auditMw);

import { auditRouter } from "./audit";

type CapturedCall = { kind: string; where?: unknown };

function makeFakeDb() {
  const captured: CapturedCall[] = [];
  const state = { results: [] as unknown[][], rows: [] as unknown[] };
  function chain(kind: string): any {
    const api: any = {
      from: () => api,
      where: (c?: unknown) => {
        if (c !== undefined) captured.push({ kind, where: c });
        return api;
      },
      orderBy: () => api,
      limit: () => api,
      offset: () => api,
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
        const rows = state.results.length > 0 ? state.results.shift() : state.rows;
        return Promise.resolve(rows ?? []).then(onF, onR);
      },
    };
    return api;
  }
  return {
    captured,
    state,
    select: () => chain("select"),
    selectDistinct: () => chain("selectDistinct"),
    delete: () => chain("delete"),
  };
}

let fake: ReturnType<typeof makeFakeDb>;
const dialect = new PgDialect();

function ctxFor(role: "user" | "admin"): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "auditor",
      role,
      name: null,
      email: null,
      loginMethod: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as unknown as NonNullable<TrpcContext["user"]>,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

async function expectCode(fn: () => Promise<unknown>, code: TRPCError["code"]): Promise<TRPCError> {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(TRPCError);
    expect((e as TRPCError).code).toBe(code);
    return e as TRPCError;
  }
  throw new Error(`expected TRPCError ${code}, call succeeded`);
}

const LOG_ROW = {
  id: "l1",
  userId: "7",
  action: "user.login",
  resourceType: "session",
  resourceId: null,
  changes: null,
  metadata: null,
  severity: "info",
  status: "success",
  errorMessage: null,
  sessionId: null,
  createdAt: 1730000000000,
};

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeDb();
  dbh.getDb.mockResolvedValue(fake);
  auditMw.cleanupOldAuditLogs.mockResolvedValue(3);
});

describe("audit router: who may read audit logs", () => {
  it("non-admin callers are forbidden from every procedure", async () => {
    const caller = auditRouter.createCaller(ctxFor("user"));
    await expectCode(() => caller.list({}), "FORBIDDEN");
    await expectCode(() => caller.getActions(), "FORBIDDEN");
    await expectCode(() => caller.getStats(), "FORBIDDEN");
    await expectCode(() => caller.cleanup({ daysToKeep: 90 }), "FORBIDDEN");
    // no db traffic at all for a forbidden caller
    expect(fake.captured).toHaveLength(0);
    expect(auditMw.cleanupOldAuditLogs).not.toHaveBeenCalled();
  });

  it("unauthenticated callers are rejected (adminProcedure reports FORBIDDEN without a user)", async () => {
    const ctx = { ...ctxFor("admin"), user: null };
    const caller = auditRouter.createCaller(ctx);
    await expectCode(() => caller.list({}), "FORBIDDEN");
  });

  it("admin callers are allowed through", async () => {
    const caller = auditRouter.createCaller(ctxFor("admin"));
    fake.state.results = [[LOG_ROW], [LOG_ROW]];
    const result = await caller.list({ limit: 50 });
    expect(result.logs).toHaveLength(1);
  });
});

describe("audit router: output shape (AuditLogs.tsx contract)", () => {
  it("list returns { logs: array, total: number } with camelCase rows", async () => {
    const caller = auditRouter.createCaller(ctxFor("admin"));
    fake.state.results = [[LOG_ROW], [LOG_ROW, LOG_ROW]];
    const result = await caller.list({});
    expect(Array.isArray(result.logs)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(result.total).toBe(2);
    expect(result.logs[0]).toMatchObject({ resourceType: "session", createdAt: 1730000000000 });
  });

  it("getStats returns numeric totals for the dashboard cards", async () => {
    const caller = auditRouter.createCaller(ctxFor("admin"));
    fake.state.results = [
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [{ id: "b" }],
      [{ id: "c" }],
      [{ id: "a" }, { id: "c" }],
    ];
    const stats = await caller.getStats();
    expect(stats).toEqual({ total: 3, failures: 1, critical: 1, last24h: 2 });
  });

  it("getActions returns a flat string array", async () => {
    const caller = auditRouter.createCaller(ctxFor("admin"));
    fake.state.results = [[{ action: "user.login" }, { action: "file.upload" }]];
    const actions = await caller.getActions();
    expect(actions).toEqual(["user.login", "file.upload"]);
  });

  it("db unavailable degrades to empty results, not a crash", async () => {
    dbh.getDb.mockResolvedValue(null);
    const caller = auditRouter.createCaller(ctxFor("admin"));
    expect(await caller.list({})).toEqual({ logs: [], total: 0 });
    expect(await caller.getStats()).toEqual({ total: 0, failures: 0, critical: 0, last24h: 0 });
    expect(await caller.getActions()).toEqual([]);
  });
});

describe("audit router: filters are parameterized, never interpolated", () => {
  it("action and userId filters reach Postgres as bound params", async () => {
    const caller = auditRouter.createCaller(ctxFor("admin"));
    fake.state.results = [[], []];
    await caller.list({ action: "login%", userId: "7", fromTs: 1, toTs: 2 });
    const where = fake.captured.find((c) => c.kind === "select" && c.where);
    expect(where).toBeTruthy();
    const rendered = dialect.sqlToQuery(where!.where as never);
    // the user-supplied strings appear only in params, never inside the SQL text
    expect(rendered.sql).not.toContain("login%");
    expect(rendered.sql).not.toContain("'7'");
    expect(rendered.params).toContain("%login%%");
    expect(rendered.params).toContain("7");
    expect(rendered.params).toContain(1);
    expect(rendered.params).toContain(2);
  });

  it("cleanup enforces the 7..365 day retention floor and returns the deleted count", async () => {
    const caller = auditRouter.createCaller(ctxFor("admin"));
    await expectCode(() => caller.cleanup({ daysToKeep: 1 }), "BAD_REQUEST");
    expect(auditMw.cleanupOldAuditLogs).not.toHaveBeenCalled();
    expect(await caller.cleanup({ daysToKeep: 30 })).toEqual({ deleted: 3 });
    expect(auditMw.cleanupOldAuditLogs).toHaveBeenCalledWith(30);
  });
});
