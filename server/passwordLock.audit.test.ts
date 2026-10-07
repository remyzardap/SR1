/**
 * T-84 M4: the change-your-password lock.
 *
 * An account created by an administrator holds a password it never chose, so every route except
 * the one that replaces it has to refuse. Two enforcement points exist (tRPC for the app's own
 * calls, Express for the hand-written routes); this file pins both.
 *
 * The gate is exercised through synthetic routers built from the same exported procedure
 * builders, which is how server/trpc-core.audit.test.ts tests the guards it already has.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NOT_ADMIN_ERR_MSG, PASSWORD_CHANGE_REQUIRED_MESSAGE } from "@shared/const";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";

const LOCKED = {
  id: 42,
  openId: "local:locked",
  name: "Locked Out",
  email: "locked@example.com",
  role: "user",
  mustChangePassword: true,
};

const UNLOCKED = { ...LOCKED, mustChangePassword: false };

function ctxFor(user: unknown) {
  return { user: user as any, req: {} as any, res: {} as any };
}

/** Every procedure builder in the app is derived from these four, so the chain is what matters. */
const suite = router({
  auth: router({
    changePassword: protectedProcedure.mutation(async () => "changed"),
    // Public in the real router, so the lock never sees them.
    me: publicProcedure.query(async () => "public"),
    logout: publicProcedure.mutation(async () => "logged out"),
  }),
  skills: router({
    list: protectedProcedure.query(async () => "skills"),
    adminOnly: adminProcedure.query(async () => "admin-skills"),
  }),
  admin: router({
    users: router({
      list: adminProcedure.query(async () => "users"),
    }),
  }),
});

const callerFor = (user: unknown) => suite.createCaller(ctxFor(user) as any);

async function expectRefused(promise: Promise<unknown>) {
  const error = await promise.then(() => null).catch((e) => e);
  expect(error).toBeTruthy();
  expect(error!.code).toBe("FORBIDDEN");
  expect(error!.message).toBe(PASSWORD_CHANGE_REQUIRED_MESSAGE);
}

describe("the change-password lock on tRPC procedures", () => {
  it("refuses a protected procedure and names the one thing the user can do", async () => {
    await expectRefused(callerFor(LOCKED).skills.list());
  });

  it("refuses an admin procedure too, so a locked administrator cannot manage other accounts", async () => {
    await expectRefused(callerFor({ ...LOCKED, role: "admin" }).admin.users.list());
    await expectRefused(callerFor({ ...LOCKED, role: "admin" }).skills.adminOnly());
  });

  it("lets auth.changePassword through, because nothing else could clear the flag", async () => {
    await expect(callerFor(LOCKED).auth.changePassword()).resolves.toBe("changed");
  });

  it("leaves an account that has set its own password alone", async () => {
    await expect(callerFor(UNLOCKED).skills.list()).resolves.toBe("skills");
    await expect(callerFor({ ...UNLOCKED, role: "admin" }).admin.users.list()).resolves.toBe("users");
  });

  it("treats a user row without the flag as unlocked (sessions issued before the column existed)", async () => {
    const { mustChangePassword, ...legacy } = UNLOCKED;
    await expect(callerFor(legacy).skills.list()).resolves.toBe("skills");
  });

  it("does not touch public procedures", async () => {
    await expect(callerFor(LOCKED).auth.me()).resolves.toBe("public");
    // A locked account must still be able to leave: refusing logout would strand the session.
    await expect(callerFor(LOCKED).auth.logout()).resolves.toBe("logged out");
  });

  it("keeps the existing refusals for anonymous and non-admin callers ahead of the lock", async () => {
    const anonymous = await callerFor(null).skills.list().then(() => null).catch((e) => e);
    expect(anonymous!.message).not.toBe(PASSWORD_CHANGE_REQUIRED_MESSAGE);

    const anonAdmin = await callerFor(null).admin.users.list().then(() => null).catch((e) => e);
    expect(anonAdmin!.message).toBe(NOT_ADMIN_ERR_MSG);

    const plainUser = await callerFor({ ...UNLOCKED, role: "user" }).admin.users.list().then(() => null).catch((e) => e);
    expect(plainUser!.message).toBe(NOT_ADMIN_ERR_MSG);
  });

  it("passes the user through untouched so resolvers still see the row they expect", async () => {
    let reached = false;
    const probe = router({
      probe: protectedProcedure.query(async ({ ctx }: any) => {
        reached = true;
        return { id: ctx.user.id, locked: ctx.user.mustChangePassword };
      }),
    }).createCaller(ctxFor(UNLOCKED) as any);
    await expect(probe.probe()).resolves.toEqual({ id: 42, locked: false });
    expect(reached).toBe(true);
  });

  it("never runs the resolver body for a locked account", async () => {
    let reached = false;
    const probe = router({
      probe: protectedProcedure.query(async () => {
        reached = true;
        return "should not happen";
      }),
    }).createCaller(ctxFor(LOCKED) as any);
    await expectRefused(probe.probe());
    expect(reached).toBe(false);
  });
});

describe("the change-password lock outside tRPC", () => {
  // server/_core/index.ts boots the server and reads secrets when imported, so this gate can only
  // be pinned by shape: the route middleware has to carry the same refusal the procedure middleware
  // does, or a browser could keep calling /api/fn and /api/documents/generate with a pasted password.
  const source = () => readFileSync("server/_core/index.ts", "utf8");

  it("requireSession refuses a locked account before the route runs", () => {
    const text = source();
    expect(text).toMatch(
      /async function requireSession\([\s\S]*?sdk\.authenticateRequest\(req\)[\s\S]*?if \(user\.mustChangePassword\) \{\s*res\.status\(403\)\.json\(\{ error: PASSWORD_CHANGE_REQUIRED_MESSAGE \}\)/
    );
  });

  it("still hands the request on and keeps the 401 for a stranger", () => {
    const text = source();
    expect(text).toMatch(/if \(user\.mustChangePassword\)[\s\S]*?\(req as any\)\.user = user;\s*next\(\);/);
    expect(text).toMatch(/catch \{\s*res\.status\(401\)\.json\(\{ error: "Unauthorized" \}\)/);
  });

  it("refuses with the shared message instead of inventing a second one", () => {
    const text = source();
    expect(text).toMatch(/import \{[^}]*PASSWORD_CHANGE_REQUIRED_MESSAGE[^}]*\} from ["']@shared\/const["']/);
    // The switch-off message belongs to the sign-in path; reusing it here would tell a signed-in
    // user they have been disabled when all they need to do is set a password.
    expect(text).not.toMatch(/switched off/);
  });
});

describe("one middleware, not a check per procedure", () => {
  // The task asks for a single gate. Every one of these is a shape check on the two files that own
  // it: the exemption list, the procedure builders, and the absence of any per-procedure copy.
  const trpcSource = () => readFileSync("server/_core/trpc.ts", "utf8");
  const routersSource = () => readFileSync("server/routers.ts", "utf8");

  it("exemptions are only the procedures that read or clear the flag", () => {
    const list = trpcSource().match(/const PASSWORD_CHANGE_EXEMPT_PATHS = new Set\(\[([^\]]*)\]\)/);
    expect(list).toBeTruthy();
    expect(list![1].match(/["'][^"']+["']/g)).toEqual(['"auth.changePassword"']);
  });

  it("hangs the gate on both procedure builders so nothing can be added without it", () => {
    const text = trpcSource();
    expect(text).toMatch(/export const protectedProcedure = t\.procedure\.use\(requireUser\)\.use\(requireNewPassword\)/);
    expect(text).toMatch(/export const adminProcedure = t\.procedure\.use\(requireAdmin\)\.use\(requireNewPassword\)/);
  });

  it("leaves the routers free of any private copy of the check", () => {
    const text = routersSource();
    expect(text).not.toMatch(/PASSWORD_CHANGE_REQUIRED/);
    expect(text).not.toMatch(/mustChangePassword\s*(?:===|!==)\s*(?:true|false)/);
  });

  it("keeps auth.me and auth.logout public, which is why they need no exemption", () => {
    const text = routersSource();
    expect(text).toMatch(/^\s+me: publicProcedure/m);
    expect(text).toMatch(/^\s+logout: publicProcedure/m);
  });
});
