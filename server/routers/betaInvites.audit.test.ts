import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";

const inv = vi.hoisted(() => ({
  generateBetaInviteCode: vi.fn(),
  getAllBetaInviteCodes: vi.fn(),
  deactivateBetaInviteCode: vi.fn(),
}));
vi.mock("../db/betaInvites", () => inv);

import { betaInvitesRouter } from "./betaInvites";

function ctxFor(role: "user" | "admin"): TrpcContext {
  return {
    user: {
      id: role === "admin" ? 1 : 2,
      openId: `${role}-user`,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("betaInvites router: admin-only surface (mounted under admin.betaInvites)", () => {
  it("regular users cannot generate, list, or deactivate codes", async () => {
    const caller = betaInvitesRouter.createCaller(ctxFor("user"));
    await expectCode(() => caller.generateCode({}), "FORBIDDEN");
    await expectCode(() => caller.listCodes(), "FORBIDDEN");
    await expectCode(() => caller.deactivateCode({ id: "c1" }), "FORBIDDEN");
    expect(inv.generateBetaInviteCode).not.toHaveBeenCalled();
    expect(inv.getAllBetaInviteCodes).not.toHaveBeenCalled();
    expect(inv.deactivateBetaInviteCode).not.toHaveBeenCalled();
  });

  it("unauthenticated callers are rejected before the role check", async () => {
    const ctx = { ...ctxFor("admin"), user: null };
    const caller = betaInvitesRouter.createCaller(ctx);
    await expectCode(() => caller.listCodes(), "UNAUTHORIZED");
  });

  it("admin generateCode forwards maxUses and converts expiresInDays to an expiresAt Date", async () => {
    inv.generateBetaInviteCode.mockResolvedValue("ABC123XYZABC");
    const caller = betaInvitesRouter.createCaller(ctxFor("admin"));
    const before = Date.now();
    const result = await caller.generateCode({ maxUses: 3, expiresInDays: 7 });
    expect(result).toEqual({ code: "ABC123XYZABC" });
    const [createdBy, options] = inv.generateBetaInviteCode.mock.calls[0];
    expect(createdBy).toBe(1);
    expect(options.maxUses).toBe(3);
    expect(options.expiresAt).toBeInstanceOf(Date);
    expect(options.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 7 * 86400000 - 1000);
    expect(options.expiresAt!.getTime()).toBeLessThanOrEqual(before + 7 * 86400000 + 5000);
  });

  it("input rejects non-positive or fractional maxUses / expiresInDays", async () => {
    const caller = betaInvitesRouter.createCaller(ctxFor("admin"));
    await expectCode(() => caller.generateCode({ maxUses: 0 }), "BAD_REQUEST");
    await expectCode(() => caller.generateCode({ maxUses: -2 }), "BAD_REQUEST");
    await expectCode(() => caller.generateCode({ maxUses: 1.5 }), "BAD_REQUEST");
    await expectCode(() => caller.generateCode({ expiresInDays: 0 }), "BAD_REQUEST");
    expect(inv.generateBetaInviteCode).not.toHaveBeenCalled();
  });

  it("admin listCodes returns the array straight from the db helper (output is an array)", async () => {
    inv.getAllBetaInviteCodes.mockResolvedValue([{ id: "c1", code: "AAA", usageCount: 0 }]);
    const caller = betaInvitesRouter.createCaller(ctxFor("admin"));
    const result = await caller.listCodes();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].code).toBe("AAA");
  });

  it("admin deactivateCode passes the id through", async () => {
    inv.deactivateBetaInviteCode.mockResolvedValue(undefined);
    const caller = betaInvitesRouter.createCaller(ctxFor("admin"));
    await expect(caller.deactivateCode({ id: "c1" })).resolves.toEqual({ success: true });
    expect(inv.deactivateBetaInviteCode).toHaveBeenCalledWith("c1");
  });
});
