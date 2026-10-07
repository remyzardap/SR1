/**
 * T-84: admin.users.* — the admin-facing account surface (create / list / resetPassword /
 * setDisabled).
 *
 * server/db and the audit writer are mocked, so every assertion is about what this router hands to
 * the database and to audit_logs: the shape of the row it inserts, the fact that only a bcrypt hash
 * of a one-time password ever leaves it, and that a rejected action writes nothing at all.
 *
 * bcrypt runs for real at production cost so the stored hash can be inspected as a genuine hash.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserts: [] as any[],
  passwordWrites: [] as any[],
  disabledWrites: [] as any[],
  emailLookups: [] as string[],
  existingEmails: [] as string[],
  users: new Map<number, any>(),
  listRows: [] as any[],
  activeAdmins: 2,
  activeAdminChecks: 0,
  audit: [] as any[],
  getUserByIdCalls: 0,
}));

vi.mock("../db", () => ({
  createManagedUser: vi.fn(async (input: any) => {
    state.inserts.push(input);
    return {
      id: 42,
      openId: input.openId,
      email: input.email,
      name: input.name,
      role: "user",
      mustChangePassword: true,
      disabledAt: null,
      createdAt: new Date("2026-10-07T00:00:00Z"),
    };
  }),
  listManagedUsers: vi.fn(async () => state.listRows),
  getUserByEmailIgnoreCase: vi.fn(async (email: string) => {
    state.emailLookups.push(email);
    return state.existingEmails.includes(email.toLowerCase()) ? { id: 7 } : undefined;
  }),
  getUserById: vi.fn(async (id: number) => {
    state.getUserByIdCalls += 1;
    return state.users.get(id);
  }),
  updateUserPassword: vi.fn(async (userId: number, passwordHash: string, mustChangePassword: boolean) => {
    state.passwordWrites.push({ userId, passwordHash, mustChangePassword });
  }),
  setUserDisabledAt: vi.fn(async (userId: number, disabledAt: Date | null) => {
    state.disabledWrites.push({ userId, disabledAt });
  }),
  countActiveAdmins: vi.fn(async () => {
    state.activeAdminChecks += 1;
    return state.activeAdmins;
  }),
}));

vi.mock("../middleware/audit-logging", () => ({
  logAuditEvent: vi.fn(async (payload: any) => {
    state.audit.push(payload);
  }),
}));

function makeActor(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    openId: "local:adminactor",
    email: "admin@example.com",
    name: "Admin",
    loginMethod: "local",
    role: "admin",
    passwordHash: "hashed-secret-do-not-return",
    totpSecret: null,
    totpEnabled: false,
    onboarded: true,
    emailVerified: true,
    mustChangePassword: false,
    disabledAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    lastSignedIn: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as any;
}

async function caller(user: any) {
  const { adminUsersRouter } = await import("./adminUsers");
  return adminUsersRouter.createCaller({ user, req: {} as any, res: {} as any });
}

const adminCaller = () => caller(makeActor());
const userCaller = () => caller(makeActor({ id: 3, role: "user", email: "user@example.com" }));

beforeEach(() => {
  state.inserts.length = 0;
  state.passwordWrites.length = 0;
  state.disabledWrites.length = 0;
  state.emailLookups.length = 0;
  state.existingEmails.length = 0;
  state.users.clear();
  state.listRows.length = 0;
  state.activeAdmins = 2;
  state.activeAdminChecks = 0;
  state.audit.length = 0;
  state.getUserByIdCalls = 0;
});

describe("admin.users.create", () => {
  it("stores only a bcrypt hash of a one-time password it hands back once", async () => {
    const c = await adminCaller();
    const result = await c.create({ email: "Ana@Example.com", name: "Ana" });

    expect(state.inserts).toHaveLength(1);
    const inserted = state.inserts[0];
    expect(result.oneTimePassword).toMatch(/^[A-Za-z\d]{16,}$/); // printable, look-alike-free OTP
    expect(inserted.passwordHash).toMatch(/^\$2[aby]\$/); // a bcrypt hash, not the password
    expect(inserted.passwordHash).not.toBe(result.oneTimePassword);
    expect(Object.keys(inserted)).not.toContain("password");
    expect(JSON.stringify(state.inserts)).not.toContain(result.oneTimePassword);
  });

  it("hashes at bcrypt cost 12, the cost the rest of the password paths use", async () => {
    const c = await adminCaller();
    await c.create({ email: "cost@example.com" });
    const hash = state.inserts[0].passwordHash as string;
    expect(hash.split("$")[2]).toBe("12");
  });

  it("issues a one-time password of at least 16 readable characters", async () => {
    const c = await adminCaller();
    const result = await c.create({ email: "otp@example.com" });
    expect(result.oneTimePassword.length).toBeGreaterThanOrEqual(16);
    expect(result.oneTimePassword).not.toMatch(/[0Oo1lI]/);
  });

  it("creates a locked, non-admin local account with a lower-cased email", async () => {
    const c = await adminCaller();
    const result = await c.create({ email: "Ana@Example.COM", name: "  Ana  " });
    const inserted = state.inserts[0];

    expect(inserted.email).toBe("ana@example.com");
    expect(result.email).toBe("ana@example.com");
    expect(inserted.name).toBe("Ana");
    // role / loginMethod / mustChangePassword are not caller-supplied at all: the db helper sets
    // them, so an admin cannot escalate an account through this procedure.
    expect(Object.keys(inserted).sort()).toEqual(["email", "name", "openId", "passwordHash"]);
    expect(result.mustChangePassword).toBe(true);
    expect(result.role).toBe("user");
    expect(inserted.openId.startsWith("local:")).toBe(true);
    expect(inserted.openId.length).toBeLessThanOrEqual(64);
  });

  it("leaves name null when the admin does not supply one", async () => {
    const c = await adminCaller();
    const result = await c.create({ email: "noname@example.com" });
    expect(state.inserts[0].name).toBeNull();
    expect(result.name).toBeNull();
  });

  it("rejects an email that already belongs to an account, whatever its case", async () => {
    state.existingEmails = ["ana@example.com"];
    const c = await adminCaller();
    await expect(c.create({ email: "ANA@example.com" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "A user with that email already exists",
    });
    expect(state.emailLookups).toEqual(["ana@example.com"]);
    expect(state.inserts).toHaveLength(0);
  });

  it("audits a rejected duplicate as a failure without writing an account", async () => {
    state.existingEmails = ["dup@example.com"];
    const c = await adminCaller();
    await expect(c.create({ email: "dup@example.com" })).rejects.toThrow();
    expect(state.audit).toHaveLength(1);
    expect(state.audit[0]).toMatchObject({
      userId: "2",
      action: "user.create",
      resourceType: "user",
      status: "failure",
    });
  });

  it("writes exactly one audit row naming the actor and the new account", async () => {
    const c = await adminCaller();
    const result = await c.create({ email: "audited@example.com", name: "Audited" });

    expect(state.audit).toHaveLength(1);
    expect(state.audit[0]).toMatchObject({
      userId: "2",
      action: "user.create",
      resourceType: "user",
      resourceId: String(result.id),
    });
    expect(state.audit[0].changes).toMatchObject({ role: "user", mustChangePassword: true });
    expect(JSON.stringify(state.audit)).not.toContain(result.oneTimePassword);
    expect(JSON.stringify(state.audit)).not.toContain(state.inserts[0].passwordHash);
  });

  it("refuses a non-admin before touching the database", async () => {
    const c = await userCaller();
    await expect(c.create({ email: "nobody@example.com" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
    expect(state.inserts).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });

  it("refuses a malformed or empty email through the input schema, not the database", async () => {
    const c = await adminCaller();
    await expect(c.create({ email: "not-an-email" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect((c.create as any)({})).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect((c.create as any)({ email: "a@b.co", name: "  " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(state.inserts).toHaveLength(0);
  });
});

describe("admin.users.list", () => {
  it("returns the account columns an admin needs and never a secret", async () => {
    state.listRows = [
      {
        id: 11,
        name: "Ana",
        email: "ana@example.com",
        role: "user",
        createdAt: new Date("2026-10-01T00:00:00Z"),
        lastSignedIn: new Date("2026-10-02T00:00:00Z"),
        mustChangePassword: true,
        disabledAt: null,
      },
      {
        id: 12,
        name: "Bo",
        email: "bo@example.com",
        role: "admin",
        createdAt: new Date("2026-10-03T00:00:00Z"),
        lastSignedIn: new Date("2026-10-04T00:00:00Z"),
        mustChangePassword: false,
        disabledAt: new Date("2026-10-05T00:00:00Z"),
      },
    ];
    const c = await adminCaller();
    const rows: any[] = await c.list();

    expect(rows.map((r) => r.id)).toEqual([11, 12]);
    expect(rows[0].disabled).toBe(false);
    expect(rows[0].mustChangePassword).toBe(true);
    expect(rows[1].disabled).toBe(true);
    expect(rows[1].disabledAt).toBeInstanceOf(Date);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        ["createdAt", "disabled", "disabledAt", "email", "id", "lastSignedIn", "mustChangePassword", "name", "role"],
      );
      expect(row).not.toHaveProperty("passwordHash");
      expect(row).not.toHaveProperty("totpSecret");
    }
  });

  it("refuses a non-admin", async () => {
    const c = await userCaller();
    await expect(c.list()).rejects.toMatchObject({ code: "FORBIDDEN", message: "Admin access required" });
  });
});

describe("admin.users.resetPassword", () => {
  beforeEach(() => {
    state.users.set(50, { id: 50, email: "target@example.com", role: "user", openId: "local:target" });
  });

  it("writes a new hash and the change-password lock in one call and returns the password once", async () => {
    const c = await adminCaller();
    const result = await c.resetPassword({ id: 50 });

    expect(state.passwordWrites).toHaveLength(1);
    expect(state.passwordWrites[0]).toMatchObject({ userId: 50, mustChangePassword: true });
    expect(state.passwordWrites[0].passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(state.passwordWrites[0].passwordHash).not.toBe(result.oneTimePassword);
    expect(result).toEqual({ id: 50, oneTimePassword: result.oneTimePassword });
    expect(result.oneTimePassword.length).toBeGreaterThanOrEqual(16);
    expect(JSON.stringify(state.audit)).not.toContain(result.oneTimePassword);
  });

  it("audits the reset against the target account", async () => {
    const c = await adminCaller();
    await c.resetPassword({ id: 50 });
    expect(state.audit).toHaveLength(1);
    expect(state.audit[0]).toMatchObject({
      userId: "2",
      action: "user.password_reset",
      resourceType: "user",
      resourceId: "50",
    });
  });

  it("refuses to reset the caller's own password and writes nothing", async () => {
    state.users.set(2, { id: 2, email: "admin@example.com", role: "admin", openId: "local:adminactor" });
    const c = await adminCaller();
    await expect(c.resetPassword({ id: 2 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "You cannot reset your own password",
    });
    expect(state.passwordWrites).toHaveLength(0);
  });

  it("refuses an unknown account id", async () => {
    const c = await adminCaller();
    await expect(c.resetPassword({ id: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.passwordWrites).toHaveLength(0);
  });

  it("refuses a non-admin and a malformed id", async () => {
    const c = await userCaller();
    await expect(c.resetPassword({ id: 50 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.getUserByIdCalls).toBe(0);
    const a = await adminCaller();
    await expect((a.resetPassword as any)({ id: "50" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect((a.resetPassword as any)({ id: -3 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("admin.users.setDisabled", () => {
  beforeEach(() => {
    state.users.set(60, { id: 60, email: "switch@example.com", role: "user", openId: "local:switch" });
    state.users.set(61, { id: 61, email: "peer@example.com", role: "admin", openId: "local:peer" });
    // The acting admin is also a row in users: switching yourself off has to be caught by the
    // self-check, which runs after the target is looked up.
    state.users.set(2, { id: 2, email: "admin@example.com", role: "admin", openId: "local:adminactor" });
  });

  it("stamps disabledAt and audits user.disable", async () => {
    const c = await adminCaller();
    const result = await c.setDisabled({ id: 60, disabled: true });

    expect(state.disabledWrites).toHaveLength(1);
    expect(state.disabledWrites[0].userId).toBe(60);
    expect(state.disabledWrites[0].disabledAt).toBeInstanceOf(Date);
    expect(result).toEqual({ id: 60, disabled: true });
    expect(state.audit[0]).toMatchObject({
      userId: "2",
      action: "user.disable",
      resourceType: "user",
      resourceId: "60",
      severity: "warn",
    });
  });

  it("clears disabledAt and audits user.enable", async () => {
    const c = await adminCaller();
    const result = await c.setDisabled({ id: 60, disabled: false });
    expect(state.disabledWrites[0].disabledAt).toBeNull();
    expect(result).toEqual({ id: 60, disabled: false });
    expect(state.audit[0]).toMatchObject({ action: "user.enable", severity: "info" });
  });

  it("refuses to switch off the caller's own account", async () => {
    const c = await adminCaller();
    await expect(c.setDisabled({ id: 2, disabled: true })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "You cannot switch off your own account",
    });
    expect(state.disabledWrites).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });

  it("refuses to switch off the last active administrator", async () => {
    state.activeAdmins = 1;
    const c = await adminCaller();
    await expect(c.setDisabled({ id: 61, disabled: true })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: /last active administrator/,
    });
    expect(state.disabledWrites).toHaveLength(0);
  });

  it("allows switching off an administrator while another active one remains", async () => {
    state.activeAdmins = 2;
    const c = await adminCaller();
    expect(await c.setDisabled({ id: 61, disabled: true })).toEqual({ id: 61, disabled: true });
  });

  it("never consults the admin count for an ordinary account", async () => {
    const c = await adminCaller();
    await c.setDisabled({ id: 60, disabled: true });
    expect(state.activeAdminChecks).toBe(0);
  });

  it("does consult it before switching off an administrator", async () => {
    const c = await adminCaller();
    await c.setDisabled({ id: 61, disabled: true });
    expect(state.activeAdminChecks).toBe(1);
  });

  it("refuses an unknown id and a non-admin caller", async () => {
    const c = await adminCaller();
    await expect(c.setDisabled({ id: 999, disabled: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const u = await userCaller();
    await expect(u.setDisabled({ id: 60, disabled: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
    expect(state.disabledWrites).toHaveLength(0);
  });

  it("rejects a missing or non-boolean disabled flag", async () => {
    const c = await adminCaller();
    await expect((c.setDisabled as any)({ id: 60 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect((c.setDisabled as any)({ id: 60, disabled: "yes" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(state.disabledWrites).toHaveLength(0);
  });
});
