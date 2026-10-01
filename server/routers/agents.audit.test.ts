import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TrpcContext } from "../_core/context";

// agents.ts talks to Postgres through ../db (getDb + session ownership helpers).
// The fake below records every where/values/set argument so tests can render the
// real SQL (quoted identifiers, bound params) and assert on it.
const dbh = vi.hoisted(() => ({
  getDb: vi.fn(),
  getChatSessionForUser: vi.fn(),
}));
vi.mock("../db", () => dbh);

import { agentsRouter } from "./agents";

type CapturedCall = { kind: string; where?: unknown; values?: Record<string, unknown>; set?: Record<string, unknown> };

function makeFakeDb() {
  const captured: CapturedCall[] = [];
  // results[i] is returned by the i-th awaited statement; [] when exhausted.
  const state = { results: [] as unknown[][], rows: [] as unknown[] };
  function chain(kind: string): any {
    const api: any = {
      from: () => api,
      innerJoin: () => api,
      where: (c?: unknown) => {
        captured.push({ kind, where: c });
        return api;
      },
      orderBy: () => api,
      limit: () => api,
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

function userCtx(id: number): TrpcContext {
  return {
    user: { id, openId: `u${id}`, role: "user", name: null, email: null, loginMethod: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as unknown as NonNullable<TrpcContext["user"]>,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const caller = (id: number | null) =>
  agentsRouter.createCaller({ ...userCtx(id ?? 1), user: id === null ? null : userCtx(id).user });

const dialect = new PgDialect();

function whereSql(index: number): { sql: string; params: unknown[] } {
  const call = fake.captured.filter((c) => c.where !== undefined)[index];
  return dialect.sqlToQuery(call.where as never);
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

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeDb();
  dbh.getDb.mockResolvedValue(fake);
});

describe("agents router: authentication", () => {
  it("all procedures require a session", async () => {
    await expectCode(() => caller(null).listAgents(), "UNAUTHORIZED");
    await expectCode(() => caller(null).getActiveAgent({ sessionId: "s1" }), "UNAUTHORIZED");
    await expectCode(() => caller(null).switchAgent({ sessionId: "s1", newAgentId: "a" }), "UNAUTHORIZED");
  });
});

describe("agents router: chat-session ownership", () => {
  const AGENT_ROW = {
    agentSessionId: "as1",
    agentId: "agent_general",
    startedAt: 1,
    messageCount: 0,
    name: "General",
    slug: "general",
    description: "d",
    systemPrompt: "secret prompt",
    color: "#000",
    avatarUrl: null,
  };

  it("getActiveAgent returns nothing for sessions the caller does not own", async () => {
    dbh.getChatSessionForUser.mockResolvedValue(undefined);
    fake.state.results = [[AGENT_ROW]];
    await expectCode(() => caller(1).getActiveAgent({ sessionId: "victim-session" }), "NOT_FOUND");
    // the ownership lookup must be scoped to the caller, not the raw sessionId
    expect(dbh.getChatSessionForUser).toHaveBeenCalledWith("victim-session", 1);
  });

  it("getActiveAgent returns the row for an owned session", async () => {
    dbh.getChatSessionForUser.mockResolvedValue({ id: "s1", userId: 1 });
    fake.state.results = [[AGENT_ROW]];
    const result = await caller(1).getActiveAgent({ sessionId: "s1" });
    expect(result?.agentSessionId).toBe("as1");
  });

  it("getAgentHistory refuses foreign sessions", async () => {
    dbh.getChatSessionForUser.mockResolvedValue(undefined);
    await expectCode(() => caller(1).getAgentHistory({ sessionId: "s2" }), "NOT_FOUND");
  });

  it("switchAgent refuses foreign sessions and inserts nothing", async () => {
    dbh.getChatSessionForUser.mockResolvedValue(undefined);
    await expectCode(() => caller(1).switchAgent({ sessionId: "s2", newAgentId: "agent_general" }), "NOT_FOUND");
    expect(fake.captured.some((c) => c.kind === "insert")).toBe(false);
  });

  it("switchAgent rejects an agent id that is not in the agents table", async () => {
    dbh.getChatSessionForUser.mockResolvedValue({ id: "s1", userId: 1 });
    // ownership check, then agent-exists lookup comes back empty, so no insert lands
    fake.state.results = [[], []];
    await expectCode(() => caller(1).switchAgent({ sessionId: "s1", newAgentId: "nope" }), "BAD_REQUEST");
    expect(fake.captured.some((c) => c.kind === "insert")).toBe(false);
  });

  it("switchAgent on an owned session ends the old one and starts the new agent", async () => {
    dbh.getChatSessionForUser.mockResolvedValue({ id: "s1", userId: 1 });
    fake.state.results = [[{ id: "agent_general" }]];
    const result = await caller(1).switchAgent({ sessionId: "s1", newAgentId: "agent_general" });
    expect(result.agentSessionId).toBeTruthy();
    const inserts = fake.captured.filter((c) => c.kind === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({ sessionId: "s1", agentId: "agent_general", messageCount: 0 });
    const updates = fake.captured.filter((c) => c.kind === "update");
    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(updates[0].set).toMatchObject({ endedAt: expect.any(Number) });
  });

  it("initAgentForSession refuses foreign sessions", async () => {
    dbh.getChatSessionForUser.mockResolvedValue(undefined);
    await expectCode(() => caller(1).initAgentForSession({ sessionId: "s2" }), "NOT_FOUND");
  });

  it("initAgentForSession defaults to agent_general on an owned session", async () => {
    dbh.getChatSessionForUser.mockResolvedValue({ id: "s1", userId: 1 });
    fake.state.results = [[{ id: "agent_general" }]];
    await caller(1).initAgentForSession({ sessionId: "s1" });
    const inserts = fake.captured.filter((c) => c.kind === "insert");
    expect(inserts[0].values).toMatchObject({ sessionId: "s1", agentId: "agent_general" });
  });

  it("incrementMessageCount refuses foreign sessions", async () => {
    dbh.getChatSessionForUser.mockResolvedValue(undefined);
    await expectCode(() => caller(1).incrementMessageCount({ sessionId: "s2" }), "NOT_FOUND");
  });

  it("incrementMessageCount bumps the active agent session for owned sessions", async () => {
    dbh.getChatSessionForUser.mockResolvedValue({ id: "s1", userId: 1 });
    fake.state.results = [[{ id: "as1", messageCount: 4 }]];
    await caller(1).incrementMessageCount({ sessionId: "s1" });
    const updates = fake.captured.filter((c) => c.kind === "update");
    expect(updates[0].set).toEqual({ messageCount: 5 });
  });
});

describe("agents router: db shape", () => {
  it("renders camelCase identifiers quoted (no bare createdAt/userId) in session queries", async () => {
    dbh.getChatSessionForUser.mockResolvedValue({ id: "s1", userId: 1 });
    fake.state.results = [[]];
    await caller(1).getAgentHistory({ sessionId: "s1" });
    const rendered = whereSql(0);
    expect(rendered.sql).toContain('"agent_sessions"."sessionId"');
    expect(rendered.params).toEqual(["s1"]);
  });
});

describe("agents router: listAgents", () => {
  it("returns active agents for authenticated users", async () => {
    fake.state.results = [[{ id: "agent_general", slug: "general", isActive: true }]];
    const result = await caller(1).listAgents();
    expect(result).toHaveLength(1);
  });
});
