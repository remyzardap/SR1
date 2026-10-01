import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";

const dbh = vi.hoisted(() => ({
  getBusinessesByUser: vi.fn(),
  getBusinessById: vi.fn(),
  createBusiness: vi.fn(),
  updateBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
}));
vi.mock("../db", () => dbh);

import { businessesRouter } from "./businesses";

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

const caller = (userId: number) => businessesRouter.createCaller(ctxFor(userId));

function bizRow(over: Record<string, unknown> = {}) {
  return { id: 5, ownerId: 1, name: "Warung", currency: "IDR", createdAt: new Date(), updatedAt: new Date(), ...over };
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

describe("businesses router: ownership", () => {
  it("list scopes to the caller via getBusinessesByUser", async () => {
    dbh.getBusinessesByUser.mockResolvedValue([bizRow()]);
    await caller(9).list();
    expect(dbh.getBusinessesByUser).toHaveBeenCalledWith(9);
  });

  it("byId/update/delete pass the caller id into the ownership lookup", async () => {
    dbh.getBusinessById.mockResolvedValue(bizRow({ ownerId: 9 }));
    dbh.updateBusiness.mockResolvedValue(bizRow({ ownerId: 9, name: "New" }));
    dbh.deleteBusiness.mockResolvedValue(undefined);
    await caller(9).byId({ id: 5 });
    expect(dbh.getBusinessById).toHaveBeenCalledWith(5, 9);
    await caller(9).update({ id: 5, name: "New" });
    expect(dbh.getBusinessById).toHaveBeenCalledWith(5, 9);
    expect(dbh.updateBusiness).toHaveBeenCalledWith(5, 9, { name: "New" });
    await caller(9).delete({ id: 5 });
    expect(dbh.deleteBusiness).toHaveBeenCalledWith(5, 9);
  });

  it("foreign business is NOT_FOUND and no write happens", async () => {
    dbh.getBusinessById.mockResolvedValue(null);
    await expectCode(() => caller(9).byId({ id: 5 }), "NOT_FOUND");
    await expectCode(() => caller(9).update({ id: 5, name: "stolen" }), "NOT_FOUND");
    await expectCode(() => caller(9).delete({ id: 5 }), "NOT_FOUND");
    expect(dbh.updateBusiness).not.toHaveBeenCalled();
    expect(dbh.deleteBusiness).not.toHaveBeenCalled();
  });
});

describe("businesses router: input validation", () => {
  it("create rejects empty and whitespace-only names", async () => {
    await expectCode(() => caller(1).create({ name: "" }), "BAD_REQUEST");
    await expectCode(() => caller(1).create({ name: "   " }), "BAD_REQUEST");
    expect(dbh.createBusiness).not.toHaveBeenCalled();
  });

  it("create stores the trimmed name and ownerId from the session", async () => {
    dbh.createBusiness.mockResolvedValue(bizRow({ ownerId: 9 }));
    await caller(9).create({ name: "  Warung  " });
    expect(dbh.createBusiness).toHaveBeenCalledWith({ ownerId: 9, name: "Warung", currency: "IDR" });
  });

  it("update rejects a whitespace-only name", async () => {
    dbh.getBusinessById.mockResolvedValue(bizRow());
    await expectCode(() => caller(1).update({ id: 5, name: "  " }), "BAD_REQUEST");
    expect(dbh.updateBusiness).not.toHaveBeenCalled();
  });

  it("create rejects currencies outside the fixed list", async () => {
    await expectCode(() => caller(1).create({ name: "ok", currency: "IDR2" as never }), "BAD_REQUEST");
  });

  it("id must be a positive integer (no fractional ids reaching Postgres)", async () => {
    await expectCode(() => caller(1).byId({ id: 1.5 }), "BAD_REQUEST");
    await expectCode(() => caller(1).byId({ id: -2 }), "BAD_REQUEST");
    expect(dbh.getBusinessById).not.toHaveBeenCalled();
  });
});
