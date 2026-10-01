/**
 * Batch 2 audit test, item 10 (db side): ensureChatSession creates the row for the
 * caller's own client-generated id exactly once, never touches another user's row,
 * and re-checks after a lost insert race instead of assuming ownership.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

const state = vi.hoisted(() => ({ sessions: [] as any[], inserts: 0 }));

const fakeDb = {
  select: (_cols?: unknown) => ({
    from: () => ({
      where: () => ({
        limit: async (n: number) => state.sessions.slice(0, n).map((s) => ({ userId: s.userId })),
      }),
    }),
  }),
  insert: () => ({
    values: (v: any) => ({
      onConflictDoNothing: async () => {
        state.inserts += 1;
        if (!state.sessions.some((s) => s.id === v.id)) state.sessions.push(v);
      },
    }),
  }),
};

vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => fakeDb }));

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://fake:fake@127.0.0.1:5432/fake";
});

import { ensureChatSession } from "./db";

function reset() {
  state.sessions = [];
  state.inserts = 0;
}

describe("ensureChatSession", () => {
  it("creates the missing row with the caller's id and a 60-char title", async () => {
    reset();
    const res = await ensureChatSession("sess-1", 7, "x".repeat(100));
    expect(res).toBe("owned");
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]).toMatchObject({ id: "sess-1", userId: 7 });
    expect(state.sessions[0].title).toHaveLength(60);
  });

  it("is idempotent for an existing own row (no second insert)", async () => {
    reset();
    state.sessions = [{ id: "sess-1", userId: 7 }];
    expect(await ensureChatSession("sess-1", 7, "again")).toBe("owned");
    expect(state.inserts).toBe(0);
  });

  it("refuses a row owned by someone else without writing", async () => {
    reset();
    state.sessions = [{ id: "sess-1", userId: 8 }];
    expect(await ensureChatSession("sess-1", 7, "mine now")).toBe("foreign");
    expect(state.inserts).toBe(0);
    expect(state.sessions[0].userId).toBe(8);
  });

  it("a lost insert race ends as foreign, not as a phantom own session", async () => {
    reset();
    // The row appears between our first read and the conflict-ignoring insert.
    const origInsert = fakeDb.insert;
    (fakeDb as any).insert = () => ({
      values: (v: any) => ({
        onConflictDoNothing: async () => {
          state.inserts += 1;
          state.sessions.push({ id: v.id, userId: 9 }); // the other writer wins
        },
      }),
    });
    const res = await ensureChatSession("sess-race", 7, "hi");
    (fakeDb as any).insert = origInsert;
    expect(res).toBe("foreign");
  });
});
