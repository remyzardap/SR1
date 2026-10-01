import { describe, it, expect, vi, beforeEach } from "vitest";

const dbh = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
vi.mock("../db", () => dbh);

import { getAgentContextForSession } from "./agent-context";

function makeFakeDb() {
  const state = { results: [] as unknown[][] };
  function chain(kind: string): any {
    const api: any = {
      from: () => api,
      innerJoin: () => api,
      where: () => api,
      limit: () => api,
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
        const rows = state.results.length > 0 ? state.results.shift() : [];
        return Promise.resolve(rows).then(onF, onR);
      },
    };
    return api;
  }
  return { state, select: () => chain("select") };
}

let fake: ReturnType<typeof makeFakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeDb();
  dbh.getDb.mockResolvedValue(fake);
});

describe("agent-context: session agent resolution ladder", () => {
  it("returns the active agent for the session", async () => {
    fake.state.results = [[{ agentId: "agent_writer", name: "Writer", systemPrompt: "p", color: "#fff" }]];
    const ctx = await getAgentContextForSession("s1");
    expect(ctx.agentId).toBe("agent_writer");
  });

  it("falls back to the seeded general agent when no active session row exists", async () => {
    fake.state.results = [[], [{ agentId: "agent_general", name: "General Assistant", systemPrompt: "g", color: "#6366f1" }]];
    const ctx = await getAgentContextForSession("s1");
    expect(ctx.agentId).toBe("agent_general");
    expect(ctx.systemPrompt).toBe("g");
  });

  it("returns a hard-coded default when even the general agent row is missing", async () => {
    fake.state.results = [[], []];
    const ctx = await getAgentContextForSession("s1");
    expect(ctx).toEqual({
      agentId: "agent_general",
      name: "General Assistant",
      systemPrompt: "You are a helpful assistant.",
      color: "#6366f1",
    });
  });

  it("returns the hard-coded default without a database", async () => {
    dbh.getDb.mockResolvedValue(null);
    const ctx = await getAgentContextForSession("s1");
    expect(ctx.agentId).toBe("agent_general");
  });

  it("propagates a query failure (callers must catch: there is no built-in fallback here)", async () => {
    fake.state.results = [];
    (fake as any).select = () => {
      throw new Error("column createdAt does not exist");
    };
    await expect(getAgentContextForSession("s1")).rejects.toThrow(/createdAt/);
  });
});
