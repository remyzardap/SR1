/**
 * T-84 M5 + M6: what an administrator's switch-off and a temporary password do to sign-in.
 *
 *   - auth.login / auth.login2fa refuse a switched-off account, and only after the password has
 *     been checked, so a wrong guess cannot confirm anything about the account.
 *   - Both return the change-password flag so the client knows why the next call will be refused.
 *   - sdk.authenticateRequest, the one load point shared by tRPC, requireSession, the file and
 *     export routes and the WebSocket upgrade, revokes a live session.
 *   - auth.changePassword is the way out of the lock.
 *
 * server/db, server/_core/email and the audit writer are mocked; no network, no DB, no log file.
 */
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import { DISABLED_LOGIN_MESSAGE, PASSWORD_CHANGE_REQUIRED_MESSAGE } from "@shared/const";

const state = vi.hoisted(() => ({
  users: [] as any[],
  passwordWrites: [] as { userId: number; hash: string; mustChangePassword: boolean }[],
  upserts: [] as Array<{ openId: string; lastSignedIn?: Date }>,
  audit: [] as any[],
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./db");
  return {
    ...actual,
    getDb: vi.fn(async () => null),
    getUserByEmail: vi.fn(async (email: string) => state.users.find((u) => u.email === email)),
    getUserByHandle: vi.fn(async (handle: string) =>
      state.users.find((u) => u.handle && u.handle.toLowerCase() === handle.toLowerCase())
    ),
    getUserById: vi.fn(async (id: number) => state.users.find((u) => u.id === id)),
    getUserByOpenId: vi.fn(async (openId: string) => state.users.find((u) => u.openId === openId)),
    // admin.users.create reaches for these two; the fake keeps the row in state.users so the
    // sign-in path below finds the account the administrator just made.
    setUserDisabledAt: vi.fn(async (id: number, disabledAt: Date | null) => {
      const u = state.users.find((x) => x.id === id);
      if (u) u.disabledAt = disabledAt;
      return true;
    }),
    countActiveAdmins: vi.fn(async () => 3),
    getUserByEmailIgnoreCase: vi.fn(async (email: string) => {
      const u = state.users.find((x) => x.email === email);
      return u ? { id: u.id } : undefined;
    }),
    createManagedUser: vi.fn(async (row: Record<string, unknown>) => {
      // The router does not name the flag: db.createManagedUser sets it, because the column
      // default is false so nobody else - existing accounts included - is locked out.
      const created = account({
        openId: `local:${row.email}`,
        mustChangePassword: true,
        ...row,
        id: 900 + state.users.length,
      });
      state.users.push(created);
      return created;
    }),
    upsertUser: vi.fn(async (user: { openId: string; lastSignedIn?: Date }) => {
      state.upserts.push(user);
    }),
    updateUserPassword: vi.fn(async (userId: number, hash: string, mustChangePassword: boolean) => {
      state.passwordWrites.push({ userId, hash, mustChangePassword });
      const u = state.users.find((x) => x.id === userId);
      if (u) {
        u.passwordHash = hash;
        u.mustChangePassword = mustChangePassword;
      }
      return true;
    }),
  };
});

vi.mock("./_core/email", () => ({
  sendPasswordResetEmail: vi.fn(async () => {}),
  sendEmailVerification: vi.fn(async () => {}),
}));

// These routers pull in the LLM chain and the file pipeline; neither is relevant here.
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

vi.mock("./middleware/audit-logging", () => ({
  logAuditEvent: vi.fn(async (payload: any) => {
    state.audit.push(payload);
  }),
}));

let ipCounter = 0;

/** Each ctx gets its own client address: the auth limiter buckets are module-global. */
function makeCtx(user?: Record<string, unknown>) {
  ipCounter += 1;
  const cookies: Array<{ name: string; value: string }> = [];
  const ctx = {
    user: (user ?? null) as any,
    req: {
      protocol: "https",
      headers: {},
      ip: `10.244.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`,
    } as any,
    res: {
      cookie: (name: string, value: string) => {
        cookies.push({ name, value });
      },
      clearCookie: () => {},
    } as any,
  };
  return { ctx, cookies };
}

function account(overrides: Record<string, unknown>) {
  return {
    id: 500,
    openId: "local:member",
    name: "Team Member",
    email: "member@example.com",
    emailVerified: true,
    loginMethod: "local",
    role: "user",
    handle: null,
    image: null,
    bio: null,
    isPublic: false,
    onboarded: false,
    onboardingComplete: false,
    onboardingVersion: 1,
    passwordHash: null,
    totpSecret: null,
    totpEnabled: false,
    mustChangePassword: false,
    disabledAt: null,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    updatedAt: new Date("2026-03-01T00:00:00Z"),
    lastSignedIn: null,
    ...overrides,
  };
}

let appRouter: any;

beforeAll(async () => {
  appRouter = (await import("./routers")).appRouter;
});

/** createCaller is synchronous, so a caller can be built and awaited at the call site. */
function caller(ctx: unknown) {
  return appRouter.createCaller(ctx as any);
}

const PASSWORD = "correct horse battery staple";

beforeEach(async () => {
  process.env.SESSION_SECRET = "audit-lock-secret-123";
  process.env.VITE_APP_ID = "audit-app";
  // ALLOWED_LOGIN is closed by default, and a closed list refuses every sign-in before anything
  // else is checked - which would hide the switch-off behind it.
  process.env.ALLOWED_LOGIN = "member@example.com,locked@example.com,free@example.com";
  // @ts-ignore test fixture cost
  process.env.BCRYPT_COST = "4";
  state.users = [];
  state.passwordWrites = [];
  state.upserts = [];
  state.audit = [];
});

/**
 * A failing assertion prints `actual`, so comparing a credential head-on — `expect(hash).not.toBe(otp)`,
 * `expect(dump).not.toContain(passphrase)` — would put a live one-time password or a real bcrypt hash in
 * the test output the moment it failed, which T-84 forbids. These helpers turn those comparisons into
 * booleans: a failure then says "expected true to be false" and names where it looked, never what it saw.
 */
function expectAbsent(dump: string, secret: string, where: string) {
  expect(dump.includes(secret), `${where} carries the credential`).toBe(false);
}

const SECRET_COLUMNS = ["passwordHash", "password", "totpSecret", "oneTimePassword"];

/** Only the *names* of credential-bearing columns are compared, never their values. */
function secretColumnsIn(value: unknown): string[] {
  return Object.keys((value ?? {}) as Record<string, unknown>).filter((key) =>
    SECRET_COLUMNS.includes(key)
  );
}

describe("auth.login against a switched-off account", () => {
  // bcrypt cost 4 keeps the fixtures quick; the production cost is pinned in the admin tests.
  const hashFor = (text: string) => bcrypt.hash(text, 4);

  it("refuses the sign-in with the sentence the task asks for, and issues no session", async () => {
    state.users.push(
      account({ passwordHash: await hashFor(PASSWORD), disabledAt: new Date("2026-06-01T00:00:00Z") })
    );
    const { ctx, cookies } = makeCtx();
    const error = await await caller(ctx)
      .auth.login({ email: "member@example.com", password: PASSWORD })
      .then(() => null)
      .catch((e) => e);
    expect(error!.code).toBe("FORBIDDEN");
    expect(error!.message).toBe(DISABLED_LOGIN_MESSAGE);
    expect(cookies).toEqual([]);
  });

  it("gives a wrong password the generic refusal, so a guesser cannot learn the account is switched off", async () => {
    state.users.push(
      account({ passwordHash: await hashFor(PASSWORD), disabledAt: new Date("2026-06-01T00:00:00Z") })
    );
    const { ctx } = makeCtx();
    const error = await caller(ctx)
      .auth.login({ email: "member@example.com", password: "not the password" })
      .then(() => null)
      .catch((e) => e);
    expect(error!.message).toBe("Invalid email/handle or password.");
    expect(error!.message).not.toBe(DISABLED_LOGIN_MESSAGE);
  });

  it("lets the account sign in again once an administrator switches it back on", async () => {
    state.users.push(account({ passwordHash: await hashFor(PASSWORD), disabledAt: null }));
    const { ctx, cookies } = makeCtx();
    const result: any = await caller(ctx).auth.login({ email: "member@example.com", password: PASSWORD });
    expect(result.success).toBe(true);
    expect(cookies.map((c) => c.name)).toEqual(["app_session_id"]);
  });

  it("reports the change-password lock on the sign-in result, both ways round", async () => {
    state.users.push(
      account({ openId: "local:locked", email: "locked@example.com", id: 501, passwordHash: await hashFor(PASSWORD), mustChangePassword: true })
    );
    state.users.push(
      account({ openId: "local:free", email: "free@example.com", id: 502, passwordHash: await hashFor(PASSWORD), mustChangePassword: false })
    );

    const lockedCtx = makeCtx();
    const locked: any = await caller(lockedCtx.ctx).auth.login({ email: "locked@example.com", password: PASSWORD });
    expect(locked.mustChangePassword).toBe(true);

    const freeCtx = makeCtx();
    const free: any = await caller(freeCtx.ctx).auth.login({ email: "free@example.com", password: PASSWORD });
    expect(free.mustChangePassword).toBe(false);

    // The result must never carry the stored hash along with the flag.
    expect(secretColumnsIn(locked)).toEqual([]);
  });

  it("refuses a switched-off account on the 2FA path as well, before the authenticator code is checked", async () => {
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    state.users.push(
      account({
        passwordHash: await hashFor(PASSWORD),
        totpSecret: secret,
        totpEnabled: true,
        disabledAt: new Date("2026-06-01T00:00:00Z"),
      })
    );
    const token = speakeasy.totp({ secret, encoding: "base32" });
    const { ctx, cookies } = makeCtx();
    const error = await caller(ctx)
      .auth.login2fa({ email: "member@example.com", password: PASSWORD, token })
      .then(() => null)
      .catch((e) => e);
    expect(error!.code).toBe("FORBIDDEN");
    expect(error!.message).toBe(DISABLED_LOGIN_MESSAGE);
    expect(cookies).toEqual([]);
  });
});

describe("session revocation in sdk.authenticateRequest", () => {
  // One function, every request type: server/_core/context.ts (all tRPC), requireSession in
  // _core/index.ts, routes/export.ts, routes/files.ts, routers/chat.ts and routers/intelligence.ts.
  const requestFor = async (openId: string) => {
    const { sdk } = await import("./_core/sdk");
    const token = await sdk.createSessionToken(openId, { name: "x", expiresInMs: 60_000 });
    return { headers: { cookie: `app_session_id=${token}` } } as any;
  };

  it("refuses a session minted before the switch-off, with its own reason", async () => {
    state.users.push(account({ disabledAt: new Date("2026-06-01T00:00:00Z") }));
    const { sdk } = await import("./_core/sdk");
    const error = await sdk
      .authenticateRequest(await requestFor("local:member"))
      .then(() => null)
      .catch((e) => e);
    expect(error).toBeTruthy();
    expect(error.message).toBe(DISABLED_LOGIN_MESSAGE);
    // Distinct from the two existing refusals, so a client can tell "sign in again" from "closed".
    expect(error.message).not.toMatch(/Invalid session/);
    expect(error.message).not.toMatch(/User not found/);
  });

  it("does not touch lastSignedIn, so a switched-off account stops looking active", async () => {
    state.users.push(account({ disabledAt: new Date("2026-06-01T00:00:00Z") }));
    const { sdk } = await import("./_core/sdk");
    await sdk.authenticateRequest(await requestFor("local:member")).catch(() => null);
    expect(state.upserts).toEqual([]);
  });

  it("accepts the same session again after the account is switched back on", async () => {
    const user = account({ disabledAt: new Date("2026-06-01T00:00:00Z") });
    state.users.push(user);
    const { sdk } = await import("./_core/sdk");
    const req = await requestFor("local:member");
    await expect(sdk.authenticateRequest(req)).rejects.toThrow();
    user.disabledAt = null;
    const again = await sdk.authenticateRequest(req);
    expect(again.id).toBe(500);
    expect(state.upserts.map((u) => u.openId)).toEqual(["local:member"]);
  });

  it("still lets an account with the change-password lock use its session", async () => {
    // The lock refuses what an account does with a session, not the session itself: an admin
    // cannot disable the account, so locking someone out of signing in would leave no way back
    // except an operator. The refusal belongs to requireSession and the procedure middleware.
    state.users.push(account({ mustChangePassword: true }));
    const { sdk } = await import("./_core/sdk");
    const user = await sdk.authenticateRequest(await requestFor("local:member"));
    expect(user.mustChangePassword).toBe(true);
    const text = readFileSync("server/_core/sdk.ts", "utf8");
    expect(text).toMatch(/if \(user\.disabledAt\) \{\s*throw ForbiddenError\(DISABLED_LOGIN_MESSAGE\)/);
    expect(text).not.toMatch(/if \(user\.mustChangePassword\)/);
  });
});

describe("auth.changePassword", () => {
  const hashFor = (text: string) => bcrypt.hash(text, 4);

  it("replaces the password and clears the lock in one write", async () => {
    const user = account({ passwordHash: await hashFor(PASSWORD), mustChangePassword: true });
    state.users.push(user);
    const { ctx } = makeCtx(user);
    const result = await caller(ctx).auth.changePassword({
      currentPassword: PASSWORD,
      newPassword: "a brand new passphrase",
    });
    expect(result).toEqual({ success: true });
    expect(state.passwordWrites).toHaveLength(1);
    const write = state.passwordWrites[0];
    expect(write.userId).toBe(user.id);
    expect(write.mustChangePassword).toBe(false);
    expect(write.hash === "a brand new passphrase").toBe(false);
    expect((await bcrypt.compare("a brand new passphrase", write.hash)) || (await bcrypt.compare("a brand new passphrase", user.passwordHash))).toBe(true);
  });

  it("refuses a new password under ten characters", async () => {
    const user = account({ passwordHash: await hashFor(PASSWORD), mustChangePassword: true });
    state.users.push(user);
    const { ctx } = makeCtx(user);
    const error = await caller(ctx)
      .auth.changePassword({ currentPassword: PASSWORD, newPassword: "short" })
      .then(() => null)
      .catch((e) => e);
    expect(error!.code).toBe("BAD_REQUEST");
    expect(state.passwordWrites).toEqual([]);
  });

  it("refuses the wrong current password and writes nothing", async () => {
    const user = account({ passwordHash: await hashFor(PASSWORD), mustChangePassword: true });
    state.users.push(user);
    const { ctx } = makeCtx(user);
    const error = await caller(ctx)
      .auth.changePassword({ currentPassword: "guess", newPassword: "a brand new passphrase" })
      .then(() => null)
      .catch((e) => e);
    expect(error!.code).toBe("UNAUTHORIZED");
    expect(state.passwordWrites).toEqual([]);
    expect(state.audit).toEqual([]);
  });

  it("refuses to reuse the password it already has", async () => {
    const user = account({ passwordHash: await hashFor(PASSWORD), mustChangePassword: true });
    state.users.push(user);
    const { ctx } = makeCtx(user);
    const error = await caller(ctx)
      .auth.changePassword({ currentPassword: PASSWORD, newPassword: PASSWORD })
      .then(() => null)
      .catch((e) => e);
    expect(error!.code).toBe("BAD_REQUEST");
    expect(error!.message).toMatch(/different/);
    expect(state.passwordWrites).toEqual([]);
  });

  it("is rate-limited like the sign-in path", async () => {
    const user = account({ passwordHash: await hashFor(PASSWORD), mustChangePassword: true });
    state.users.push(user);
    const { ctx } = makeCtx(user);
    const c = await caller(ctx);
    const codes: string[] = [];
    for (let i = 0; i < 12; i++) {
      const error = await c
        .auth.changePassword({ currentPassword: "guess", newPassword: "a brand new passphrase" })
        .then(() => null)
        .catch((e) => e);
      codes.push(error!.code);
    }
    expect(codes.slice(0, 10)).toEqual(Array(10).fill("UNAUTHORIZED"));
    expect(codes.slice(10)).toEqual(["TOO_MANY_REQUESTS", "TOO_MANY_REQUESTS"]);
  });

  it("records who changed a password and never records the password", async () => {
    const user = account({ passwordHash: await hashFor(PASSWORD), mustChangePassword: true });
    state.users.push(user);
    const { ctx } = makeCtx(user);
    await caller(ctx).auth.changePassword({
      currentPassword: PASSWORD,
      newPassword: "a brand new passphrase",
    });
    expect(state.audit).toHaveLength(1);
    const entry = state.audit[0];
    expect(entry).toMatchObject({
      userId: String(user.id),
      action: "user.password_change",
      resourceType: "user",
      resourceId: String(user.id),
    });
    const dumped = JSON.stringify(state.audit).toLowerCase();
    expectAbsent(dumped, PASSWORD, "auth.changePassword's audit rows");
    expectAbsent(dumped, "a brand new passphrase", "auth.changePassword's audit rows");
    expectAbsent(dumped, "$2a$", "auth.changePassword's audit rows");
    expectAbsent(dumped, "passwordhash", "auth.changePassword's audit rows");
  });

  it("refuses an anonymous caller, so the route cannot be used to overwrite a password", async () => {
    const user = account({ passwordHash: await hashFor(PASSWORD) });
    state.users.push(user);
    const { ctx } = makeCtx(); // no user on the context
    const error = await caller(ctx)
      .auth.changePassword({ currentPassword: PASSWORD, newPassword: "a brand new passphrase" })
      .then(() => null)
      .catch((e) => e);
    // requireUser refuses before the lock's exemption list is ever consulted.
    expect(error!.code).toBe("UNAUTHORIZED");
    expect(state.passwordWrites).toEqual([]);
  });
});

// ─── Round trip: the password an admin hands out is the password the account signs in with ─────

describe("an account an administrator creates, end to end", () => {
  const CREATED_EMAIL = "newmember@example.com";

  beforeEach(() => {
    // The closed allowlist is a separate wall in front of the password check, so the new address
    // has to be on it before this test can say anything about the password.
    process.env.ALLOWED_LOGIN = `member@example.com,${CREATED_EMAIL}`;
  });

  async function createAccount() {
    const admin = makeCtx(
      account({ id: 1, openId: "local:admin-issuer", email: "issuer@example.com", role: "admin" })
    );
    return caller(admin.ctx).admin.users.create({ email: CREATED_EMAIL, name: "New Team Member" });
  }

  it("stores a bcrypt hash of the very password it hands back once", async () => {
    const created: any = await createAccount();
    expect(created.oneTimePassword.length).toBeGreaterThanOrEqual(16);

    const stored = state.users.find((u) => u.email === CREATED_EMAIL)!;
    expect(stored.passwordHash === created.oneTimePassword).toBe(false);
    expect(stored.name).toBe("New Team Member");
    expect(stored.role).toBe("user");
    // What auth.login will compare against: the issued string verifies, anything else does not.
    expect(await bcrypt.compare(created.oneTimePassword, stored.passwordHash)).toBe(true);
    expect(await bcrypt.compare("something else entirely", stored.passwordHash)).toBe(false);
  });

  it("signs in through the real login path with that password, and is told to change it", async () => {
    const created: any = await createAccount();
    const { ctx, cookies } = makeCtx();
    const result: any = await caller(ctx).auth.login({
      email: CREATED_EMAIL,
      password: created.oneTimePassword,
    });
    expect(result.success).toBe(true);
    expect(result.mustChangePassword).toBe(true);
    expect(cookies.map((c) => c.name)).toEqual(["app_session_id"]);
    expect(secretColumnsIn(result)).toEqual([]);
  });

  it("tells the client through auth.me as well, which is what a page reads on load", async () => {
    const created: any = await createAccount();
    const row = state.users.find((u) => u.email === CREATED_EMAIL)!;
    const { ctx } = makeCtx(row);
    const me: any = await caller(ctx).auth.me();
    expect(me.mustChangePassword).toBe(true);
    expect(me.id).toBe(row.id);
    // The strip-list still works with two more sensitive columns in play.
    expect(secretColumnsIn(me)).toEqual([]);
  });

  it("refuses the new account any protected procedure until it changes that password", async () => {
    const created: any = await createAccount();
    const row = state.users.find((u) => u.email === CREATED_EMAIL)!;
    const { ctx } = makeCtx(row);
    const error = await caller(ctx)
      .auth.get2faStatus()
      .then(() => null)
      .catch((e) => e);
    expect(error!.code).toBe("FORBIDDEN");
    expect(error!.message).toBe(PASSWORD_CHANGE_REQUIRED_MESSAGE);
  });

  it("changes the issued password, which then stops working and unlocks the account", async () => {
    const created: any = await createAccount();
    const row = state.users.find((u) => u.email === CREATED_EMAIL)!;
    const own = "a password of my own choosing";

    const changeCtx = makeCtx(row);
    const result: any = await caller(changeCtx.ctx).auth.changePassword({
      currentPassword: created.oneTimePassword,
      newPassword: own,
    });
    expect(result).toEqual({ success: true });
    expect(state.users.find((u) => u.email === CREATED_EMAIL)!.mustChangePassword).toBe(false);

    // The one-time password is spent: it no longer signs in, the new one does, and the lock is off.
    const spentCtx = makeCtx();
    const spent = await caller(spentCtx.ctx)
      .auth.login({ email: CREATED_EMAIL, password: created.oneTimePassword })
      .then(() => null)
      .catch((e) => e);
    expect(spent!.message).toBe("Invalid email/handle or password.");

    const freshCtx = makeCtx();
    const fresh: any = await caller(freshCtx.ctx).auth.login({ email: CREATED_EMAIL, password: own });
    expect(fresh.mustChangePassword).toBe(false);

    // And a protected procedure now answers for that account.
    const after = state.users.find((u) => u.email === CREATED_EMAIL)!;
    const status = await caller(makeCtx(after).ctx).auth.get2faStatus();
    expect(status).toEqual({ enabled: false });
  });

  it("invalidates the handed-out password when an administrator resets it, and the new one works", async () => {
    const created: any = await createAccount();
    const row = state.users.find((u) => u.email === CREATED_EMAIL)!;

    // The task's "reset invalidates" only means something on the sign-in path: a reset that left
    // the pasted-around password working would be a second password, not a replacement.
    const admin = makeCtx(
      account({ id: 1, openId: "local:admin-issuer", email: "issuer@example.com", role: "admin" })
    );
    const reset: any = await caller(admin.ctx).admin.users.resetPassword({ id: row.id });
    expect(reset.oneTimePassword === created.oneTimePassword).toBe(false);
    expect(reset.oneTimePassword.length).toBeGreaterThanOrEqual(16);

    const spentCtx = makeCtx();
    const spent = await caller(spentCtx.ctx)
      .auth.login({ email: CREATED_EMAIL, password: created.oneTimePassword })
      .then(() => null)
      .catch((e) => e);
    expect(spent!.message).toBe("Invalid email/handle or password.");

    const freshCtx = makeCtx();
    const fresh: any = await caller(freshCtx.ctx).auth.login({
      email: CREATED_EMAIL,
      password: reset.oneTimePassword,
    });
    expect(fresh.success).toBe(true);
    // The reset re-arms the lock, so the new holder is pushed to the change screen too.
    expect(fresh.mustChangePassword).toBe(true);
    expect(secretColumnsIn(fresh)).toEqual([]);
  });

  it("stops the round trip dead when an administrator switches the account off", async () => {
    const created: any = await createAccount();
    const row = state.users.find((u) => u.email === CREATED_EMAIL)!;

    const admin = makeCtx(
      account({ id: 1, openId: "local:admin-issuer", email: "issuer@example.com", role: "admin" })
    );
    await caller(admin.ctx).admin.users.setDisabled({ id: row.id, disabled: true });

    const { ctx, cookies } = makeCtx();
    const error = await caller(ctx)
      .auth.login({ email: CREATED_EMAIL, password: created.oneTimePassword })
      .then(() => null)
      .catch((e) => e);
    expect(error!.code).toBe("FORBIDDEN");
    expect(error!.message).toBe(DISABLED_LOGIN_MESSAGE);
    expect(cookies).toEqual([]);
  });
});
