import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";

const dbh = vi.hoisted(() => ({
  listSpaces: vi.fn(),
  getSpace: vi.fn(),
  createSpace: vi.fn(),
  updateSpace: vi.fn(),
  deleteSpace: vi.fn(),
  listChatSessions: vi.fn(),
  updateChatSessionSpace: vi.fn(),
  getFilesByUser: vi.fn(),
  moveFileToSpace: vi.fn(),
}));
vi.mock("../db", () => dbh);

import { spacesRouter } from "./spaces";

const SPACE_ID = "6f0dd000-0000-4000-8000-000000000001";

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

const caller = (userId: number) => spacesRouter.createCaller(ctxFor(userId));

function spaceRow(over: Record<string, unknown> = {}) {
  return { id: SPACE_ID, userId: 1, name: "Ops", description: null, settings: {}, createdAt: new Date(), updatedAt: new Date(), ...over };
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
});

describe("spaces router: ownership checks via db helpers", () => {
  it("list only sees the caller's spaces", async () => {
    dbh.listSpaces.mockResolvedValue([spaceRow()]);
    await caller(9).list();
    expect(dbh.listSpaces).toHaveBeenCalledWith(9);
  });

  it("get/update/delete/chats/files return NOT_FOUND when the space is not the caller's", async () => {
    dbh.getSpace.mockResolvedValue(undefined);
    await expectCode(() => caller(9).get({ id: SPACE_ID }), "NOT_FOUND");
    await expectCode(() => caller(9).update({ id: SPACE_ID, name: "x" }), "NOT_FOUND");
    await expectCode(() => caller(9).delete({ id: SPACE_ID }), "NOT_FOUND");
    await expectCode(() => caller(9).chats({ spaceId: SPACE_ID }), "NOT_FOUND");
    await expectCode(() => caller(9).files({ spaceId: SPACE_ID }), "NOT_FOUND");
    // the ownership lookup itself must pass the caller's id
    expect(dbh.getSpace).toHaveBeenCalledWith(SPACE_ID, 9);
    expect(dbh.deleteSpace).not.toHaveBeenCalled();
    expect(dbh.updateSpace).not.toHaveBeenCalled();
  });

  it("moveChat refuses to move into a space the caller does not own", async () => {
    dbh.getSpace.mockResolvedValue(undefined);
    await expectCode(
      () => caller(9).moveChat({ sessionId: "6f0dd000-0000-4000-8000-000000000002", spaceId: SPACE_ID }),
      "NOT_FOUND",
    );
    expect(dbh.updateChatSessionSpace).not.toHaveBeenCalled();
  });

  it("moveChat passes the caller's user id so only owned sessions move", async () => {
    dbh.getSpace.mockResolvedValue(spaceRow({ userId: 9 }));
    const session = "6f0dd000-0000-4000-8000-000000000002";
    await caller(9).moveChat({ sessionId: session, spaceId: SPACE_ID });
    expect(dbh.updateChatSessionSpace).toHaveBeenCalledWith(session, 9, SPACE_ID);
  });

  it("moveFile scopes by userId and rejects foreign target spaces", async () => {
    dbh.getSpace.mockResolvedValue(undefined);
    await expectCode(() => caller(9).moveFile({ fileId: 3, spaceId: SPACE_ID }), "NOT_FOUND");
    dbh.getSpace.mockResolvedValue(spaceRow({ userId: 9 }));
    await caller(9).moveFile({ fileId: 3, spaceId: SPACE_ID });
    expect(dbh.moveFileToSpace).toHaveBeenCalledWith(3, 9, SPACE_ID);
  });
});

describe("spaces router: spaceId filtering of chat sessions and files", () => {
  it("chats filters the session list by the requested space and user", async () => {
    dbh.getSpace.mockResolvedValue(spaceRow());
    dbh.listChatSessions.mockResolvedValue([{ id: "s1", spaceId: SPACE_ID }]);
    const result = await caller(1).chats({ spaceId: SPACE_ID });
    expect(dbh.listChatSessions).toHaveBeenCalledWith(1, SPACE_ID);
    expect(result).toHaveLength(1);
  });

  it("files returns only rows in this space and excludes trashed files", async () => {
    dbh.getSpace.mockResolvedValue(spaceRow());
    dbh.getFilesByUser.mockResolvedValue([
      { id: 1, userId: 1, spaceId: SPACE_ID, trashed: false, name: "in" },
      { id: 2, userId: 1, spaceId: SPACE_ID, trashed: true, name: "trash" },
      { id: 3, userId: 1, spaceId: null, trashed: false, name: "unassigned" },
      { id: 4, userId: 1, spaceId: "6f0dd000-0000-4000-8000-000000000009", trashed: false, name: "other" },
    ]);
    const result = await caller(1).files({ spaceId: SPACE_ID });
    expect(result.map((f) => f.id)).toEqual([1]);
  });
});

describe("spaces router: input validation (clean trpc errors, not 500s)", () => {
  it("create rejects empty and whitespace-only names with BAD_REQUEST", async () => {
    await expectCode(() => caller(1).create({ name: "" }), "BAD_REQUEST");
    await expectCode(() => caller(1).create({ name: "   " }), "BAD_REQUEST");
    expect(dbh.createSpace).not.toHaveBeenCalled();
  });

  it("create trims the stored name", async () => {
    dbh.createSpace.mockResolvedValue(SPACE_ID);
    await caller(1).create({ name: "  Ops  " });
    expect(dbh.createSpace).toHaveBeenCalledWith(1, "Ops", undefined);
  });

  it("update rejects a whitespace-only name and keeps valid names trimmed", async () => {
    dbh.getSpace.mockResolvedValue(spaceRow());
    await expectCode(() => caller(1).update({ id: SPACE_ID, name: "   " }), "BAD_REQUEST");
    await caller(1).update({ id: SPACE_ID, name: " New " });
    expect(dbh.updateSpace).toHaveBeenCalledWith(SPACE_ID, 1, { name: "New", description: undefined });
  });

  it("non-uuid space ids are rejected before touching the db", async () => {
    await expectCode(() => caller(1).get({ id: "not-a-uuid" }), "BAD_REQUEST");
    await expectCode(() => caller(1).chats({ spaceId: "1" }), "BAD_REQUEST");
    expect(dbh.getSpace).not.toHaveBeenCalled();
  });

  it("moveFile rejects non-integer and negative file ids", async () => {
    await expectCode(() => caller(1).moveFile({ fileId: 2.5, spaceId: null }), "BAD_REQUEST");
    await expectCode(() => caller(1).moveFile({ fileId: -4, spaceId: null }), "BAD_REQUEST");
    expect(dbh.moveFileToSpace).not.toHaveBeenCalled();
  });

  it("moveChat to null (unassign) does not require an owned space", async () => {
    const session = "6f0dd000-0000-4000-8000-000000000002";
    await caller(9).moveChat({ sessionId: session, spaceId: null });
    expect(dbh.updateChatSessionSpace).toHaveBeenCalledWith(session, 9, null);
    expect(dbh.getSpace).not.toHaveBeenCalled();
  });
});

describe("spaces router: default space behavior", () => {
  it("a user with no spaces gets an empty array, not an error (nothing auto-creates a default)", async () => {
    dbh.listSpaces.mockResolvedValue([]);
    const result = await caller(1).list();
    expect(result).toEqual([]);
  });
});
