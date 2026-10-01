import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TrpcContext } from "../_core/context";

const dbh = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
vi.mock("../db", () => dbh);

import { blocksRouter } from "./blocks";

type CapturedCall = {
  kind: string;
  where?: unknown;
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
  limit?: number;
  offset?: number;
};

function makeFakeDb() {
  const captured: CapturedCall[] = [];
  const state = { results: [] as unknown[][], rows: [] as unknown[] };
  function chain(kind: string): any {
    const api: any = {
      from: () => api,
      where: (c?: unknown) => {
        captured.push({ kind, where: c });
        return api;
      },
      orderBy: () => api,
      limit: (n: number) => {
        captured.push({ kind, limit: n });
        return api;
      },
      offset: (n: number) => {
        captured.push({ kind, offset: n });
        return api;
      },
      values: (v: Record<string, unknown>) => {
        captured.push({ kind, values: v });
        return api;
      },
      set: (v: Record<string, unknown>) => {
        captured.push({ kind, set: v });
        return api;
      },
      returning: () => api,
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
        const rows = kind === "select"
          ? (state.results.length > 0 ? state.results.shift() : state.rows)
          : state.rows;
        return Promise.resolve(rows ?? []).then(onF, onR);
      },
    };
    return api;
  }
  return {
    captured,
    state,
    select: () => chain("select"),
    update: () => chain("update"),
    insert: () => chain("insert"),
    delete: () => chain("delete"),
  };
}

let fake: ReturnType<typeof makeFakeDb>;
const dialect = new PgDialect();

function ctxFor(userId: number): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `u${userId}`,
      role: "user",
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

const caller = (userId: number | null) =>
  blocksRouter.createCaller({ ...ctxFor(userId ?? 1), user: userId === null ? null : ctxFor(userId).user });

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

function blockRow(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    userId: 1,
    type: "note",
    source: "user",
    parentId: null,
    sessionId: null,
    title: "t",
    content: { text: "hello" },
    agentId: null,
    pinned: false,
    locked: false,
    archived: false,
    tags: [],
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeDb();
  dbh.getDb.mockResolvedValue(fake);
});

describe("blocks router: auth and tenancy", () => {
  it("rejects unauthenticated callers", async () => {
    await expectCode(() => caller(null).list({}), "UNAUTHORIZED");
    await expectCode(() => caller(null).create({ type: "note", content: {} }), "UNAUTHORIZED");
  });

  it("list always scopes by the caller's user id with quoted camelCase SQL", async () => {
    await caller(7).list({});
    const where = fake.captured.find((c) => c.where !== undefined);
    const rendered = dialect.sqlToQuery(where!.where as never);
    expect(rendered.sql).toContain('"blocks"."userId"');
    expect(rendered.params).toContain(7);
  });

  it("get/update/delete/togglePin scope by both id and userId", async () => {
    const cases: Array<() => Promise<unknown>> = [
      () => caller(7).get({ id: "b1" }),
      () => caller(7).update({ id: "b1", title: "x" }),
      () => caller(7).delete({ id: "b1" }),
      () => caller(7).togglePin({ id: "b1", pinned: true }),
    ];
    for (const run of cases) {
      fake.captured.length = 0;
      fake.state.results = [[blockRow()]];
      await run();
      const rendered = dialect.sqlToQuery(fake.captured.find((c) => c.where !== undefined)!.where as never);
      expect(rendered.sql).toContain('"blocks"."userId"');
      expect(rendered.sql).toContain('"blocks"."id"');
      expect(rendered.params).toContain("b1");
      expect(rendered.params).toContain(7);
    }
  });

  it("create stamps the caller as owner", async () => {
    fake.state.results = [[blockRow()]];
    await caller(7).create({ type: "note", content: { text: "hi" } });
    const insert = fake.captured.find((c) => c.values !== undefined);
    expect(insert!.values).toMatchObject({ userId: 7, type: "note", source: "user" });
  });
});

describe("blocks router: input validation (clean trpc errors, not 500s)", () => {
  it("list rejects a negative offset instead of sending OFFSET -1 to Postgres", async () => {
    await expectCode(() => caller(1).list({ offset: -1 }), "BAD_REQUEST");
  });

  it("list rejects out-of-range limit and fractional values", async () => {
    await expectCode(() => caller(1).list({ limit: 0 }), "BAD_REQUEST");
    await expectCode(() => caller(1).list({ limit: 101 }), "BAD_REQUEST");
    await expectCode(() => caller(1).list({ limit: 10.5 }), "BAD_REQUEST");
  });

  it("list rejects unknown block types/sources with BAD_REQUEST", async () => {
    await expectCode(() => caller(1).list({ type: "not-a-type" as never }), "BAD_REQUEST");
    await expectCode(
      () => caller(1).create({ type: "chat", source: "evil" as never, content: {} }),
      "BAD_REQUEST",
    );
  });

  it("fork reports a missing block as NOT_FOUND, not a raw 500", async () => {
    fake.state.results = [[]];
    const err = await expectCode(() => caller(1).fork({ id: "missing" }), "NOT_FOUND");
    expect(err.message).toMatch(/not found/i);
  });

  it("fork clones an owned block with source user and parent link", async () => {
    fake.state.results = [[blockRow({ id: "orig", title: "Src" })]];
    fake.state.rows = [blockRow({ id: "fork1", parentId: "orig", title: "Fork of Src", source: "user" })];
    const forked = await caller(1).fork({ id: "orig" });
    expect(forked.parentId).toBe("orig");
    expect(forked.source).toBe("user");
    expect(forked.title).toBe("Fork of Src");
    const insert = fake.captured.find((c) => c.values !== undefined);
    expect(insert!.values).toMatchObject({ parentId: "orig", source: "user", userId: 1 });
  });

  it("reorder caps the number of items per call", async () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ id: `b${i}`, position: i }));
    await expectCode(() => caller(1).reorder({ items }), "BAD_REQUEST");
  });
});
