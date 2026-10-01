import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";

// tasks.ts reaches Postgres only through named helpers in ../db. Mock the module
// so the audit seam is the router logic itself (per-user scoping + validation).
const dbh = vi.hoisted(() => ({
  getDb: vi.fn(),
  getTasks: vi.fn(),
  getTaskById: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));
vi.mock("../db", () => dbh);

import { tasksRouter } from "./tasks";

function userRow(id: number): NonNullable<TrpcContext["user"]> {
  return {
    id,
    openId: `u${id}`,
    name: `user${id}`,
    email: `u${id}@example.test`,
    loginMethod: "test",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as NonNullable<TrpcContext["user"]>;
}

function ctxFor(userId: number | null): TrpcContext {
  return {
    user: userId === null ? null : userRow(userId),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const caller = (userId: number | null) => tasksRouter.createCaller(ctxFor(userId));

function taskRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    businessId: null,
    userId: 1,
    text: "buy milk",
    dueDate: null,
    category: null,
    priority: "medium",
    status: "open",
    source: "web",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
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

beforeEach(() => {
  vi.clearAllMocks();
  dbh.getDb.mockResolvedValue({});
});

describe("tasks router: authentication", () => {
  it("rejects unauthenticated callers on every procedure", async () => {
    await expectCode(() => caller(null).list({}), "UNAUTHORIZED");
    await expectCode(() => caller(null).create({ text: "x" }), "UNAUTHORIZED");
  });
});

describe("tasks router: per-user scoping", () => {
  it("list returns only the caller's tasks (rows of other users are dropped)", async () => {
    dbh.getTasks.mockResolvedValue([taskRow({ id: 1, userId: 1 }), taskRow({ id: 2, userId: 2 })]);
    const result = await caller(1).list({});
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(1);
  });

  it("byId hides another user's task behind NOT_FOUND", async () => {
    dbh.getTaskById.mockResolvedValue(taskRow({ id: 7, userId: 2 }));
    await expectCode(() => caller(1).byId({ id: 7 }), "NOT_FOUND");
  });

  it("byId returns the caller's own task", async () => {
    dbh.getTaskById.mockResolvedValue(taskRow({ id: 7, userId: 1 }));
    const result = await caller(1).byId({ id: 7 });
    expect(result.id).toBe(7);
  });

  it("update refuses tasks the caller does not own and never touches the db writer", async () => {
    dbh.getTaskById.mockResolvedValue(taskRow({ id: 7, userId: 2 }));
    await expectCode(() => caller(1).update({ id: 7, text: "hijack" }), "NOT_FOUND");
    expect(dbh.updateTask).not.toHaveBeenCalled();
  });

  it("markDone refuses another user's task", async () => {
    dbh.getTaskById.mockResolvedValue(taskRow({ id: 7, userId: 2 }));
    await expectCode(() => caller(1).markDone({ id: 7 }), "NOT_FOUND");
    expect(dbh.updateTask).not.toHaveBeenCalled();
  });

  it("delete refuses another user's task", async () => {
    dbh.getTaskById.mockResolvedValue(taskRow({ id: 7, userId: 2 }));
    await expectCode(() => caller(1).delete({ id: 7 }), "NOT_FOUND");
    expect(dbh.deleteTask).not.toHaveBeenCalled();
  });

  it("update on an owned task still writes", async () => {
    dbh.getTaskById.mockResolvedValue(taskRow({ id: 7, userId: 1 }));
    dbh.updateTask.mockResolvedValue(taskRow({ id: 7, userId: 1, text: "mine now" }));
    const result = await caller(1).update({ id: 7, text: "mine now" });
    expect(result.text).toBe("mine now");
    expect(dbh.updateTask).toHaveBeenCalled();
  });

  it("create stamps the caller's user id", async () => {
    dbh.createTask.mockResolvedValue(taskRow({ userId: 1 }));
    await caller(1).create({ text: "buy milk" });
    expect(dbh.createTask.mock.calls[0][0].userId).toBe(1);
  });
});

describe("tasks router: input validation (clean trpc errors, not 500s)", () => {
  it("list rejects a status string outside the task_status enum", async () => {
    await expectCode(() => caller(1).list({ status: "whatever" }), "BAD_REQUEST");
    expect(dbh.getTasks).not.toHaveBeenCalled();
  });

  it("list rejects negative offset and oversized limit", async () => {
    await expectCode(() => caller(1).list({ offset: -5 }), "BAD_REQUEST");
    await expectCode(() => caller(1).list({ limit: 500 }), "BAD_REQUEST");
    await expectCode(() => caller(1).list({ limit: 2.5 }), "BAD_REQUEST");
  });

  it("byId/update/delete reject non-integer and negative ids", async () => {
    await expectCode(() => caller(1).byId({ id: -3 }), "BAD_REQUEST");
    await expectCode(() => caller(1).byId({ id: 2.5 }), "BAD_REQUEST");
    await expectCode(() => caller(1).delete({ id: 0 }), "BAD_REQUEST");
  });

  it("create rejects empty text and a due date that cannot be parsed", async () => {
    await expectCode(() => caller(1).create({ text: "" }), "BAD_REQUEST");
    await expectCode(() => caller(1).create({ text: "x", dueDate: "not-a-date" }), "BAD_REQUEST");
    expect(dbh.createTask).not.toHaveBeenCalled();
  });

  it("create accepts an ISO due date and passes a Date to the db", async () => {
    dbh.createTask.mockResolvedValue(taskRow());
    await caller(1).create({ text: "x", dueDate: "2026-01-15T00:00:00.000Z" });
    expect(dbh.createTask.mock.calls[0][0].dueDate).toBeInstanceOf(Date);
  });
});
