/**
 * AREA 4 (part 1) audit tests: tRPC auth surface in server/routers.ts.
 * Covers login (password + handle + 2FA), logout cookies, signup gating,
 * password reset, email verification, rate limiting, and speakeasy flows.
 * server/db and server/_core/email are fully mocked; no network, no DB.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";

const store = vi.hoisted(() => ({
  users: [] as any[],
  resetTokens: new Map<string, { userId: number; token: string; expiresAt: Date }>(),
  verifyTokens: new Map<string, { userId: number; token: string; expiresAt: Date }>(),
  passwordHashSets: [] as { openId: string; hash: string }[],
  emailVerifiedMarks: [] as number[],
  handles: [] as string[],
  upsertedIdentity: null as any,
  sendPasswordResetEmail: null as any,
  sendEmailVerification: null as any,
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./db");
  return {
    ...actual,
    getDb: vi.fn(async () => null),
    getUserByEmail: vi.fn(async (email: string) =>
      store.users.find((u) => u.email === email)
    ),
    getUserByHandle: vi.fn(async (handle: string) => {
      const u = store.users.find((x) => x.handle && x.handle.toLowerCase() === handle);
      return u ?? undefined;
    }),
    getUserById: vi.fn(async (id: number) => store.users.find((u) => u.id === id)),
    getUserByOpenId: vi.fn(async (openId: string) =>
      store.users.find((u) => u.openId === openId)
    ),
    upsertUser: vi.fn(async () => {}),
    setUserPasswordHash: vi.fn(async (openId: string, hash: string) => {
      store.passwordHashSets.push({ openId, hash });
    }),
    createPasswordResetToken: vi.fn(
      async (userId: number, token: string, expiresAt: Date) => {
        store.resetTokens.set(token, { userId, token, expiresAt });
      }
    ),
    getPasswordResetToken: vi.fn(async (token: string) => store.resetTokens.get(token)),
    deletePasswordResetToken: vi.fn(async (token: string) => {
      store.resetTokens.delete(token);
    }),
    createEmailVerificationToken: vi.fn(
      async (userId: number, token: string, expiresAt: Date) => {
        store.verifyTokens.clear(); // mirrors the delete-then-insert in db.ts
        store.verifyTokens.set(token, { userId, token, expiresAt });
      }
    ),
    getEmailVerificationToken: vi.fn(async (token: string) =>
      store.verifyTokens.get(token)
    ),
    deleteEmailVerificationToken: vi.fn(async (token: string) => {
      store.verifyTokens.delete(token);
    }),
    markEmailVerified: vi.fn(async (userId: number) => {
      store.emailVerifiedMarks.push(userId);
    }),
    getIdentityByHandle: vi.fn(async (handle: string) =>
      store.handles.includes(handle) ? { userId: 5, handle } : null
    ),
    upsertIdentity: vi.fn(async (userId: number, data: any) => {
      store.upsertedIdentity = { userId, data };
      return { userId, ...data };
    }),
    setUserTotpSecret: vi.fn(async (userId: number, secret: string | null) => {
      const u = store.users.find((x) => x.id === userId);
      if (u) u.totpSecret = secret;
    }),
    setUserTotpEnabled: vi.fn(async (userId: number, enabled: boolean) => {
      const u = store.users.find((x) => x.id === userId);
      if (u) u.totpEnabled = enabled;
    }),
  };
});

vi.mock("./_core/email", async () => {
  const { vi: vitest } = await import("vitest");
  return {
    sendPasswordResetEmail: vitest.fn(async (email: string, token: string) => {
      if (store.sendPasswordResetEmail) {
        await store.sendPasswordResetEmail(email, token);
      }
    }),
    sendEmailVerification: vitest.fn(async (email: string, token: string) => {
      if (store.sendEmailVerification) {
        await store.sendEmailVerification(email, token);
      }
    }),
  };
});

// The kemma router pulls in the LLM engine chain; irrelevant to auth. Stub it.
vi.mock("./routers/kemma", async () => {
  const { router } = await import("./_core/trpc");
  return { kemmaRouter: router({}) };
});
vi.mock("./llmProvider", () => ({
  generateStyleOptions: vi.fn(async () => []),
  generateDocumentContent: vi.fn(async () => ""),
}));
vi.mock("./fileGenerator", () => ({
  generateFile: vi.fn(async () => ({ buffer: Buffer.from(""), mimeType: "", extension: "" })),
  STYLE_DEFINITIONS: [],
}));
vi.mock("./services/vectorSearch", () => ({
  embed: vi.fn(async () => []),
  upsertVector: vi.fn(async () => {}),
  removeVector: vi.fn(async () => {}),
  searchSimilar: vi.fn(async () => []),
  isVectorSearchConfigured: vi.fn(() => false),
}));

type CookieCall = { name: string; value: string; options: Record<string, unknown> };

function makeCtx(opts?: { secure?: boolean; xff?: string }) {
  const cookies: CookieCall[] = [];
  const cleared: CookieCall[] = [];
  const headers: Record<string, string> = {};
  if (opts?.xff) headers["x-forwarded-for"] = opts.xff;
  const ctx = {
    user: null as any,
    req: {
      protocol: opts?.secure ? "https" : "http",
      headers,
      ip: "127.0.0.1",
    } as any,
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        cleared.push({ name, value: "", options });
      },
    } as any,
  };
  return { ctx, cookies, cleared };
}

let xffCounter = 0;
function freshIp() {
  xffCounter += 1;
  return `10.77.${Math.floor(xffCounter / 256) % 256}.${xffCounter % 256}`;
}

async function buildCaller(ctx: any) {
  const { appRouter } = await import("./routers");
  return appRouter.createCaller(ctx);
}

const BASE_USER = {
  id: 1,
  openId: "open-alice",
  email: "alice@example.com",
  name: "Alice",
  loginMethod: "local",
  role: "user",
  onboarded: true,
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

async function makeUser(pw: string, extra?: Record<string, unknown>) {
  const passwordHash = await bcrypt.hash(pw, 4); // cost 4: fast in tests
  const user = { ...BASE_USER, passwordHash, handle: "alice", ...extra };
  store.users = [user];
  return user;
}

beforeEach(() => {
  store.users = [];
  store.resetTokens.clear();
  store.verifyTokens.clear();
  store.passwordHashSets = [];
  store.emailVerifiedMarks = [];
  store.handles = [];
  store.upsertedIdentity = null;
  store.sendPasswordResetEmail = null;
  store.sendEmailVerification = null;
  process.env.SESSION_SECRET = "audit-test-session-secret";
  process.env.ALLOWED_LOGIN = "alice@example.com,@alice,bob@example.com";
});

describe("auth.login (password flow)", () => {
  it("sets a lax/HttpOnly session cookie and a token that verifies for the openId", async () => {
    await makeUser("correct horse battery staple");
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);

    const result = await caller.auth.login({
      email: "alice@example.com",
      password: "correct horse battery staple",
    });

    expect(result.success).toBe(true);
    expect(cookies).toHaveLength(1);
    expect(cookies[0].name).toBe("app_session_id");
    expect(cookies[0].options).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
    const { sdk } = await import("./_core/sdk");
    const payload = await sdk.verifySession(cookies[0].value);
    expect(payload?.openId).toBe("open-alice");
    expect(await sdk.verifySession(result.token)).not.toBeNull();
  });

  it("marks secure=true when behind an https proxy (x-forwarded-proto)", async () => {
    await makeUser("hunter2-hunter2");
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    ctx.req.headers["x-forwarded-proto"] = "https";
    const caller = await buildCaller(ctx);
    await caller.auth.login({ email: "alice@example.com", password: "hunter2-hunter2" });
    expect(cookies[0].options).toMatchObject({ secure: true, sameSite: "lax" });
  });

  it("rejects a wrong password with a generic message and no cookie", async () => {
    await makeUser("correct horse battery staple");
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await expect(
      caller.auth.login({ email: "alice@example.com", password: "wrong password" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email/handle or password." });
    expect(cookies).toHaveLength(0);
  });

  it("rejects a missing user with the same message as a wrong password", async () => {
    store.users = [];
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await expect(
      caller.auth.login({ email: "bob@example.com", password: "whatever" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email/handle or password." });
    expect(cookies).toHaveLength(0);
  });

  it("rejects an email that is not on ALLOWED_LOGIN", async () => {
    await makeUser("whatever12345");
    store.users = [{ ...store.users[0], email: "eve@elsewhere.org", openId: "open-eve" }];
    process.env.ALLOWED_LOGIN = "alice@example.com";
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await expect(
      caller.auth.login({ email: "eve@elsewhere.org", password: "whatever12345" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(cookies).toHaveLength(0);
  });

  it("rejects every login when ALLOWED_LOGIN is empty (closed by default)", async () => {
    await makeUser("whatever12345");
    delete process.env.ALLOWED_LOGIN;
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await expect(
      caller.auth.login({ email: "alice@example.com", password: "whatever12345" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accepts an @handle login and strips the @ before lookup", async () => {
    await makeUser("handle-secret-1");
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    const result = await caller.auth.login({ email: "@alice", password: "handle-secret-1" });
    expect(result.success).toBe(true);
    expect(cookies).toHaveLength(1);
  });

  it("does not issue a session when the account has 2FA enabled (AUD-2FA-1 fix)", async () => {
    await makeUser("correct horse battery staple", { totpEnabled: true, totpSecret: "JBSWY3DPEHPK3PXP" });
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await expect(
      caller.auth.login({ email: "alice@example.com", password: "correct horse battery staple" })
    ).rejects.toMatchObject({ message: /2FA|two-factor/i });
    expect(cookies).toHaveLength(0);
  });

  it("blocks the 11th attempt from one IP within the window", async () => {
    await makeUser("whatever12345");
    const ip = freshIp();
    const { ctx } = makeCtx({ xff: ip });
    const caller = await buildCaller(ctx);
    // bob@example.com is on the allowlist but has no user row: every attempt
    // burns limiter budget and fails UNAUTHORIZED until the 11th flips to 429.
    for (let i = 0; i < 10; i++) {
      await expect(
        caller.auth.login({ email: "bob@example.com", password: "x" })
      ).rejects.toBeTruthy();
    }
    await expect(
      caller.auth.login({ email: "bob@example.com", password: "x" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("CURRENT BEHAVIOR (finding AUD-RL-2): rotating X-Forwarded-For bypasses the auth limiter entirely", async () => {
    // routers.ts trusts the FIRST x-forwarded-for entry, which a client controls.
    // This test documents the bypass; it is a report finding, not a fix.
    await makeUser("whatever12345");
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    for (let i = 0; i < 25; i++) {
      const err = await caller.auth
        .login({ email: "bob@example.com", password: "x" })
        .then(() => null)
        .catch((e: unknown) => e);
      expect((err as { code?: string } | null)?.code).toBe("UNAUTHORIZED");
      // each attempt uses a new spoofed client IP
      ctx.req.headers["x-forwarded-for"] = `203.0.113.${i}`;
    }
  });
});

describe("auth.login2fa (speakeasy flow)", () => {
  function secret() {
    return speakeasy.generateSecret({ length: 20 }).base32;
  }

  it("issues the session cookie only with password AND a current TOTP code", async () => {
    const totpSecret = secret();
    await makeUser("pw-for-2fa-1", { totpEnabled: true, totpSecret });
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    const token = speakeasy.totp({ secret: totpSecret, encoding: "base32" });
    const result = await caller.auth.login2fa({
      email: "alice@example.com",
      password: "pw-for-2fa-1",
      token,
    });
    expect(result.success).toBe(true);
    expect(cookies).toHaveLength(1);
    expect(cookies[0].name).toBe("app_session_id");
    expect(cookies[0].options).toMatchObject({ httpOnly: true, sameSite: "lax" });
  });

  it("rejects an invalid TOTP code without setting the cookie", async () => {
    const totpSecret = secret();
    await makeUser("pw-for-2fa-1", { totpEnabled: true, totpSecret });
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await expect(
      caller.auth.login2fa({ email: "alice@example.com", password: "pw-for-2fa-1", token: "000000" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid authenticator code." });
    expect(cookies).toHaveLength(0);
  });

  it("rejects a TOTP code from two windows ago (drift beyond window=1)", async () => {
    const totpSecret = secret();
    await makeUser("pw-for-2fa-1", { totpEnabled: true, totpSecret });
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    const old = speakeasy.totp({ secret: totpSecret, encoding: "base32", time: Date.now() / 1000 - 120 });
    const current = speakeasy.totp({ secret: totpSecret, encoding: "base32" });
    if (old !== current) {
      await expect(
        caller.auth.login2fa({ email: "alice@example.com", password: "pw-for-2fa-1", token: old })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(cookies).toHaveLength(0);
    }
  });

  it("rejects wrong password before checking the TOTP code", async () => {
    const totpSecret = secret();
    await makeUser("pw-for-2fa-1", { totpEnabled: true, totpSecret });
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    const token = speakeasy.totp({ secret: totpSecret, encoding: "base32" });
    await expect(
      caller.auth.login2fa({ email: "alice@example.com", password: "bad password", token })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email or password." });
  });

  it("reports 2FA not configured when the user has no secret", async () => {
    await makeUser("pw-for-2fa-1", { totpEnabled: false, totpSecret: null });
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await expect(
      caller.auth.login2fa({ email: "alice@example.com", password: "pw-for-2fa-1", token: "123456" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "2FA not configured." });
  });
});

describe("auth.check2faRequired", () => {
  it("returns required=true only for users with totpEnabled", async () => {
    await makeUser("x".repeat(12), { totpEnabled: true, totpSecret: "JBSWY3DPEHPK3PXP" });
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    expect(await caller.auth.check2faRequired({ email: "alice@example.com" })).toEqual({ required: true });
  });

  it("returns required=false for non-allowlisted emails without touching the user table", async () => {
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    expect(await caller.auth.check2faRequired({ email: "stranger@elsewhere.org" })).toEqual({ required: false });
  });
});

describe("auth.logout", () => {
  it("clears the session cookie with the request-appropriate options over http", async () => {
    const { ctx, cleared } = makeCtx();
    ctx.user = { ...BASE_USER };
    const caller = await buildCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(cleared).toHaveLength(1);
    expect(cleared[0].name).toBe("app_session_id");
    expect(cleared[0].options).toMatchObject({ maxAge: -1, httpOnly: true, path: "/", sameSite: "lax", secure: false });
  });

  it("CURRENT BEHAVIOR (finding AUD-SESS-1): logout only clears the cookie, the JWT stays valid until exp", async () => {
    await makeUser("logout-proof-1");
    const { ctx, cookies } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    const { token } = await caller.auth.login({ email: "alice@example.com", password: "logout-proof-1" });
    ctx.user = store.users[0];
    await caller.auth.logout();
    const { sdk } = await import("./_core/sdk");
    // No server-side revocation exists: the signed token still verifies post-logout.
    expect(await sdk.verifySession(token)).not.toBeNull();
  });
});

describe("auth.register (signup)", () => {
  it("CURRENT BEHAVIOR (finding AUD-SIGNUP-1): registration is hard-disabled; invite codes are never consumed", async () => {
    process.env.ALLOWED_LOGIN = "";
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await expect(
      caller.auth.register({
        name: "Carol",
        email: "carol@example.com",
        password: "longenoughpw",
        inviteCode: "SUTAERU1234",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: /disabled/i });
  });
});

describe("auth.requestPasswordReset / auth.resetPassword", () => {
  it("creates a 64-hex token valid ~1h and emails it to the user", async () => {
    await makeUser("whatever12345");
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    const result = await caller.auth.requestPasswordReset({ email: "alice@example.com" });
    expect(result).toEqual({ success: true });
    expect([...store.resetTokens.keys()]).toHaveLength(1);
    const [token, rec] = [...store.resetTokens.entries()][0];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const ttlMinutes = (rec.expiresAt.getTime() - Date.now()) / 60000;
    expect(ttlMinutes).toBeGreaterThan(55);
    expect(ttlMinutes).toBeLessThanOrEqual(61);
    const { sendPasswordResetEmail } = await import("./_core/email");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith("alice@example.com", token);
  });

  it("returns success without creating a token for unknown or non-allowlisted emails", async () => {
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    expect(await caller.auth.requestPasswordReset({ email: "nobody@example.com" })).toEqual({ success: true });
    expect(await caller.auth.requestPasswordReset({ email: "stranger@elsewhere.org" })).toEqual({ success: true });
    expect(store.resetTokens.size).toBe(0);
  });

  it("does not leak the reset token when the email transport fails (AUD-LEAK-1 fix)", async () => {
    await makeUser("whatever12345");
    // Simulate a transport error whose text echoes the message content (worst case).
    store.sendPasswordResetEmail = async (_email: string, token: string) => {
      throw new Error(`SMTP 550 could not deliver https://sutaeru.com/reset-password?token=${token}`);
    };
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    // Fixed behavior: public reset request stays silent-success; the SMTP error is
    // logged server-side, never surfaced (so neither token nor transport details leak).
    const result = await caller.auth.requestPasswordReset({ email: "alice@example.com" });
    expect(result).toEqual({ success: true });
  });

  it("completes the reset flow: valid token changes the password hash and consumes the token", async () => {
    await makeUser("old-password-123");
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await caller.auth.requestPasswordReset({ email: "alice@example.com" });
    const token = [...store.resetTokens.keys()][0];

    const result = await caller.auth.resetPassword({ token, password: "brand-new-password" });
    expect(result).toEqual({ success: true });
    expect(store.passwordHashSets).toHaveLength(1);
    expect(store.passwordHashSets[0].openId).toBe("open-alice");
    expect(await bcrypt.compare("brand-new-password", store.passwordHashSets[0].hash)).toBe(true);
    expect(await bcrypt.compare("old-password-123", store.passwordHashSets[0].hash)).toBe(false);
    // bcryptjs default rounds must stay strong (router uses cost 12)
    expect(Number(store.passwordHashSets[0].hash.split("$")[2])).toBeGreaterThanOrEqual(10);
    expect(store.resetTokens.size).toBe(0);
  });

  it("rejects reuse of a consumed token", async () => {
    await makeUser("old-password-123");
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await caller.auth.requestPasswordReset({ email: "alice@example.com" });
    const token = [...store.resetTokens.keys()][0];
    await caller.auth.resetPassword({ token, password: "brand-new-password" });
    await expect(
      caller.auth.resetPassword({ token, password: "another-new-password" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(store.passwordHashSets).toHaveLength(1);
  });

  it("rejects an expired token without touching the password", async () => {
    await makeUser("old-password-123");
    store.resetTokens.set("expiredtoken", {
      userId: 1,
      token: "expiredtoken",
      expiresAt: new Date(Date.now() - 1000),
    });
    const { ctx } = makeCtx({ xff: freshIp() });
    const caller = await buildCaller(ctx);
    await expect(
      caller.auth.resetPassword({ token: "expiredtoken", password: "attacker-pass-1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Invalid or expired password reset token." });
    expect(store.passwordHashSets).toHaveLength(0);
  });

  it("rejects a random unknown token", async () => {
    const { ctx } = makeCtx();
    const caller = await buildCaller(ctx);
    await expect(
      caller.auth.resetPassword({ token: "deadbeef", password: "whatever-12345" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("auth.verifyEmail / auth.resendVerificationEmail", () => {
  it("marks the email verified and consumes the token", async () => {
    await makeUser("whatever12345", { emailVerified: false });
    store.verifyTokens.set("vt-ok", { userId: 1, token: "vt-ok", expiresAt: new Date(Date.now() + 86400000) });
    const { ctx } = makeCtx();
    const caller = await buildCaller(ctx);
    expect(await caller.auth.verifyEmail({ token: "vt-ok" })).toEqual({ success: true });
    expect(store.emailVerifiedMarks).toEqual([1]);
    expect(store.verifyTokens.size).toBe(0);
    // reuse rejected
    await expect(caller.auth.verifyEmail({ token: "vt-ok" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an expired verification token and does not mark verified", async () => {
    await makeUser("whatever12345", { emailVerified: false });
    store.verifyTokens.set("vt-old", { userId: 1, token: "vt-old", expiresAt: new Date(Date.now() - 1) });
    const { ctx } = makeCtx();
    const caller = await buildCaller(ctx);
    await expect(caller.auth.verifyEmail({ token: "vt-old" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(store.emailVerifiedMarks).toHaveLength(0);
  });

  it("resend creates a 24h token for unverified users and sends it by email", async () => {
    await makeUser("whatever12345", { emailVerified: false });
    const { ctx } = makeCtx();
    ctx.user = store.users[0];
    const caller = await buildCaller(ctx);
    const result = await caller.auth.resendVerificationEmail();
    expect(result).toEqual({ success: true, alreadyVerified: false });
    const [token] = [...store.verifyTokens.keys()];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const rec = store.verifyTokens.get(token)!;
    const ttlHours = (rec.expiresAt.getTime() - Date.now()) / 3600000;
    expect(ttlHours).toBeGreaterThan(23);
    expect(ttlHours).toBeLessThanOrEqual(24.1);
    const { sendEmailVerification } = await import("./_core/email");
    expect(sendEmailVerification).toHaveBeenCalledWith("alice@example.com", token);
  });

  it("resend is a no-op for already-verified users", async () => {
    await makeUser("whatever12345", { emailVerified: true });
    const { ctx } = makeCtx();
    ctx.user = store.users[0];
    const caller = await buildCaller(ctx);
    expect(await caller.auth.resendVerificationEmail()).toEqual({ success: true, alreadyVerified: true });
    expect(store.verifyTokens.size).toBe(0);
  });

  it("CURRENT BEHAVIOR: a failing email transport for resend surfaces the raw SMTP error to the client", async () => {
    await makeUser("whatever12345", { emailVerified: false });
    store.sendEmailVerification = async () => {
      throw new Error("SMTP 421 service temporarily unavailable");
    };
    const { ctx } = makeCtx();
    ctx.user = store.users[0];
    const caller = await buildCaller(ctx);
    // The token itself is not in the message; acceptable because resend is a
    // protected procedure (the user owns the token). Documented, not changed.
    await expect(caller.auth.resendVerificationEmail()).rejects.toThrow(/SMTP 421/);
  });
});

describe("identity.upsert handle casing (AUD-HANDLE-1 fix)", () => {
  it("detects an existing lowercase handle when the user submits mixed case", async () => {
    store.handles = ["ashida"];
    const { ctx } = makeCtx();
    ctx.user = { ...BASE_USER };
    const caller = await buildCaller(ctx);
    // db.ts getUserByHandle lowercases at login; storing "Ashida" made the
    // account unreachable by @handle login and bypassed uniqueness.
    await expect(caller.identity.upsert({ handle: "Ashida" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("persists the handle lowercased so @handle login can find it", async () => {
    store.handles = [];
    const { ctx } = makeCtx();
    ctx.user = { ...BASE_USER };
    const caller = await buildCaller(ctx);
    await caller.identity.upsert({ handle: "NovaStar", displayName: "Nova" });
    expect(store.upsertedIdentity.data.handle).toBe("novastar");
    expect(store.upsertedIdentity.data.displayName).toBe("Nova");
  });
});

describe("auth 2FA management (protected procedures)", () => {
  it("setup2fa returns a base32 secret + QR data URL and persists the secret", async () => {
    await makeUser("whatever12345");
    const { ctx } = makeCtx();
    ctx.user = store.users[0];
    const caller = await buildCaller(ctx);
    const result = await caller.auth.setup2fa();
    expect(result.secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(result.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(store.users[0].totpSecret).toBe(result.secret);
  });

  it("verify2fa enables 2FA only with a correct code", async () => {
    const totpSecret = speakeasy.generateSecret({ length: 20 }).base32;
    await makeUser("whatever12345", { totpSecret });
    const { ctx } = makeCtx();
    ctx.user = store.users[0];
    const caller = await buildCaller(ctx);
    await expect(caller.auth.verify2fa({ token: "000000" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(store.users[0].totpEnabled).toBeFalsy();
    const good = speakeasy.totp({ secret: totpSecret, encoding: "base32" });
    expect(await caller.auth.verify2fa({ token: good })).toEqual({ success: true });
    expect(store.users[0].totpEnabled).toBe(true);
  });

  it("disable2fa requires a valid code and then clears the secret", async () => {
    const totpSecret = speakeasy.generateSecret({ length: 20 }).base32;
    await makeUser("whatever12345", { totpSecret, totpEnabled: true });
    const { ctx } = makeCtx();
    ctx.user = store.users[0];
    const caller = await buildCaller(ctx);
    const good = speakeasy.totp({ secret: totpSecret, encoding: "base32" });
    expect(await caller.auth.disable2fa({ token: good })).toEqual({ success: true });
    expect(store.users[0].totpEnabled).toBe(false);
    expect(store.users[0].totpSecret).toBeNull();
  });

  it("verify2fa without a stored secret tells the user to set up first", async () => {
    await makeUser("whatever12345", { totpSecret: null });
    const { ctx } = makeCtx();
    ctx.user = store.users[0];
    const caller = await buildCaller(ctx);
    await expect(caller.auth.verify2fa({ token: "123456" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
