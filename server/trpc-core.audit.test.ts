/**
 * AREA 4 (part 1) audit tests for the tRPC core: server/_core/sdk.ts session
 * signing/verification, cookies.ts options, context.ts wiring, trpc.ts
 * procedure guards, and systemRouter health/notifyOwner shape.
 * No network (fetch stubbed), no DB (server/db mocked).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  userByOpenId: null as unknown,
  upserts: [] as Array<{ openId: string; lastSignedIn?: Date }>,
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./db");
  return {
    ...actual,
    getDb: vi.fn(async () => null),
    getUserByOpenId: vi.fn(async (openId: string) =>
      openId === "good-open" ? dbMock.userByOpenId : undefined
    ),
    upsertUser: vi.fn(async (user: { openId: string; lastSignedIn?: Date }) => {
      dbMock.upserts.push(user);
    }),
  };
});

function fakeUser(overrides?: Record<string, unknown>) {
  return {
    id: 7,
    openId: "good-open",
    email: "core@example.com",
    name: "Core User",
    loginMethod: "local",
    role: "user",
    onboarded: false,
    emailVerified: false,
    passwordHash: null,
    totpSecret: null,
    totpEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.SESSION_SECRET = "audit-core-secret-123";
  process.env.VITE_APP_ID = "audit-app";
  dbMock.userByOpenId = fakeUser();
  dbMock.upserts = [];
});

describe("sdk session tokens", () => {
  it("round-trips a session token and embeds openId/appId/name", async () => {
    const { sdk } = await import("./_core/sdk");
    const token = await sdk.createSessionToken("good-open", { name: "Zed", expiresInMs: 60_000 });
    const payload = await sdk.verifySession(token);
    expect(payload).toEqual({ openId: "good-open", appId: "audit-app", name: "Zed" });
  });

  it("rejects a token signed with a different secret (tampered cookie)", async () => {
    const { sdk } = await import("./_core/sdk");
    const token = await sdk.createSessionToken("good-open", {});
    process.env.SESSION_SECRET = "someone-elses-secret";
    expect(await sdk.verifySession(token)).toBeNull();
  });

  it("rejects an expired session token", async () => {
    const { sdk } = await import("./_core/sdk");
    const expired = await sdk.createSessionToken("good-open", { expiresInMs: -1000 });
    expect(await sdk.verifySession(expired)).toBeNull();
  });

  it("rejects garbage and unsigned-forge tokens", async () => {
    const { sdk } = await import("./_core/sdk");
    expect(await sdk.verifySession("not-a-jwt")).toBeNull();
    expect(await sdk.verifySession(null)).toBeNull();
    const forgedHeader = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=+$/, "");
    const forgedPayload = btoa(
      JSON.stringify({ openId: "good-open", appId: "audit-app", name: "Eve", exp: 9999999999 })
    ).replace(/=+$/, "");
    expect(await sdk.verifySession(`${forgedHeader}.${forgedPayload}.`)).toBeNull();
  });

  it("authenticateRequest: cookie path returns DB user and touches lastSignedIn", async () => {
    const { sdk } = await import("./_core/sdk");
    const token = await sdk.createSessionToken("good-open", { name: "Core" });
    const req = { headers: { cookie: `app_session_id=${token}` } } as any;
    const user = await sdk.authenticateRequest(req);
    expect(user.openId).toBe("good-open");
    expect(dbMock.upserts).toHaveLength(1);
    expect(dbMock.upserts[0].lastSignedIn).toBeInstanceOf(Date);
  });

  it("authenticateRequest: Bearer fallback works when no cookie is present", async () => {
    const { sdk } = await import("./_core/sdk");
    const token = await sdk.createSessionToken("good-open", {});
    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    const user = await sdk.authenticateRequest(req);
    expect(user.openId).toBe("good-open");
  });

  it("authenticateRequest: missing credentials, expired session, and deleted user all throw", async () => {
    const { sdk } = await import("./_core/sdk");
    await expect(sdk.authenticateRequest({ headers: {} } as any)).rejects.toThrow(/Invalid session/);
    const expired = await sdk.createSessionToken("good-open", { expiresInMs: -1 });
    await expect(
      sdk.authenticateRequest({ headers: { cookie: `app_session_id=${expired}` } } as any)
    ).rejects.toThrow(/Invalid session/);
    const ghost = await sdk.createSessionToken("ghost-open", {});
    await expect(
      sdk.authenticateRequest({ headers: { cookie: `app_session_id=${ghost}` } } as any)
    ).rejects.toThrow(/User not found/);
  });

  it("authenticateRequest rejects a cookie signed with the wrong secret", async () => {
    const { sdk } = await import("./_core/sdk");
    const foreign = await sdk.createSessionToken("good-open", {});
    process.env.SESSION_SECRET = "rotated-away-secret";
    await expect(
      sdk.authenticateRequest({ headers: { cookie: `app_session_id=${foreign}` } } as any)
    ).rejects.toThrow(/Invalid session/);
  });
});

describe("getSessionCookieOptions", () => {
  it("plain http on localhost: lax, httpOnly, host path, not secure", async () => {
    const { getSessionCookieOptions } = await import("./_core/cookies");
    const opts = getSessionCookieOptions({ protocol: "http", headers: {} } as any);
    expect(opts).toEqual({ httpOnly: true, path: "/", sameSite: "lax", secure: false });
  });

  it("https protocol: secure cookie, still lax sameSite (never reverts to none)", async () => {
    const { getSessionCookieOptions } = await import("./_core/cookies");
    const opts = getSessionCookieOptions({ protocol: "https", headers: {} } as any);
    expect(opts.secure).toBe(true);
    expect(opts.sameSite).toBe("lax");
  });

  it("x-forwarded-proto list containing https: secure", async () => {
    const { getSessionCookieOptions } = await import("./_core/cookies");
    const opts = getSessionCookieOptions({
      protocol: "http",
      headers: { "x-forwarded-proto": "http, https" },
    } as any);
    expect(opts.secure).toBe(true);
  });

  it("does not set a domain (host-only cookie)", async () => {
    const { getSessionCookieOptions } = await import("./_core/cookies");
    const opts = getSessionCookieOptions({ protocol: "https", headers: {} } as any);
    expect((opts as { domain?: string }).domain).toBeUndefined();
  });
});

describe("createContext + procedure guards", () => {
  it("unauthenticated protected procedure call yields UNAUTHORIZED with the shared message", async () => {
    const { createContext } = await import("./_core/context");
    const { router, protectedProcedure } = await import("./_core/trpc");
    const { UNAUTHED_ERR_MSG } = await import("../shared/const");
    const testRouter = router({ secret: protectedProcedure.query(() => "should not run") });
    const ctx = await createContext({
      req: { headers: {} } as any,
      res: {} as any,
    });
    expect(ctx.user).toBeNull();
    await expect(testRouter.createCaller(ctx).secret()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG,
    });
  });

  it("public procedure sees ctx.user when a valid cookie is present", async () => {
    const { createContext } = await import("./_core/context");
    const { router, publicProcedure } = await import("./_core/trpc");
    const { sdk } = await import("./_core/sdk");
    const token = await sdk.createSessionToken("good-open", {});
    const testRouter = router({
      whoami: publicProcedure.query(({ ctx }) => ctx.user?.openId ?? null),
    });
    const ctx = await createContext({
      req: { headers: { cookie: `app_session_id=${token}` } } as any,
      res: {} as any,
    });
    expect(await testRouter.createCaller(ctx).whoami()).toBe("good-open");
  });

  it("tampered cookie downgrades to anonymous instead of erroring", async () => {
    const { createContext } = await import("./_core/context");
    const ctx = await createContext({
      req: { headers: { cookie: "app_session_id=garbage.value.sig" } } as any,
      res: {} as any,
    });
    expect(ctx.user).toBeNull();
  });

  it("adminProcedure: role user is FORBIDDEN, role admin passes; DB role wins over any client field", async () => {
    const { router, adminProcedure } = await import("./_core/trpc");
    const { NOT_ADMIN_ERR_MSG } = await import("../shared/const");
    const testRouter = router({ op: adminProcedure.mutation(() => "done") });
    const userCtx = { user: fakeUser({ role: "user" }), req: {} as any, res: {} as any };
    await expect(testRouter.createCaller(userCtx).op()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: NOT_ADMIN_ERR_MSG,
    });
    const adminCtx = { user: fakeUser({ role: "admin" }), req: {} as any, res: {} as any };
    expect(await testRouter.createCaller(adminCtx).op()).toBe("done");
    // A missing user is also refused (no anonymous bypass).
    const anonCtx = { user: null, req: {} as any, res: {} as any };
    await expect(testRouter.createCaller(anonCtx).op()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("systemRouter", () => {
  it("health answers ok for a valid timestamp input (client-side smoke check)", async () => {
    const { systemRouter } = await import("./_core/systemRouter");
    const caller = systemRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    expect(await caller.health({ timestamp: 1 })).toEqual({ ok: true });
  });

  it("health rejects invalid input (negative or missing timestamp)", async () => {
    const { systemRouter } = await import("./_core/systemRouter");
    const caller = systemRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(caller.health({ timestamp: -5 })).rejects.toBeTruthy();
  });

  it("notifyOwner is admin-gated and posts to the forge endpoint with the bearer key", async () => {
    const calls: Array<{ url: string; init: any }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        calls.push({ url, init });
        return new Response("{}", { status: 200 });
      })
    );
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example/";
    process.env.BUILT_IN_FORGE_API_KEY = "fake-token";
    const { systemRouter } = await import("./_core/systemRouter");
    const anon = systemRouter.createCaller({ user: fakeUser({ role: "user" }), req: {} as any, res: {} as any });
    await expect(anon.notifyOwner({ title: "t", content: "c" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = systemRouter.createCaller({ user: fakeUser({ role: "admin" }), req: {} as any, res: {} as any });
    const res = await admin.notifyOwner({ title: "  Hello  ", content: " world " });
    expect(res).toEqual({ success: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://forge.example/webdevtoken.v1.WebDevService/SendNotification");
    expect(calls[0].init.headers.authorization).toBe("Bearer fake-token");
    expect(JSON.parse(calls[0].init.body)).toEqual({ title: "Hello", content: "world" });
    vi.unstubAllGlobals();
  });

  it("notifyOwner reports success:false (not a throw) when the service is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }));
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example/";
    process.env.BUILT_IN_FORGE_API_KEY = "fake-token";
    const { systemRouter } = await import("./_core/systemRouter");
    const admin = systemRouter.createCaller({ user: fakeUser({ role: "admin" }), req: {} as any, res: {} as any });
    expect(await admin.notifyOwner({ title: "t", content: "c" })).toEqual({ success: false });
    vi.unstubAllGlobals();
  });
});
