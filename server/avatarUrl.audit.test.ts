/**
 * Batch 2 audit test, item 8: identity.upsert must accept the root-relative
 * /files/... avatar URLs that settings.uploadAvatar stores with the local storage
 * driver. Before the fix, saving the profile failed with BAD_REQUEST for every
 * user who had ever uploaded an avatar (zod .url() rejects relative paths).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const dbh = vi.hoisted(() => ({
  getOrCreateIdentity: vi.fn(),
  upsertIdentity: vi.fn(),
  getIdentityByHandle: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./db");
  return {
    ...actual,
    getDb: vi.fn(async () => ({})),
    getOrCreateIdentity: dbh.getOrCreateIdentity,
    upsertIdentity: dbh.upsertIdentity,
    getIdentityByHandle: dbh.getIdentityByHandle,
  };
});
vi.mock("./_core/email", async () => {
  const { vi: vitest } = await import("vitest");
  return { sendPasswordResetEmail: vitest.fn(async () => {}), sendEmailVerification: vitest.fn(async () => {}) };
});
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

const USER = { id: 7, openId: "open-7", name: "Ruth", email: "ruth@example.com", role: "user" };

async function caller() {
  const { appRouter } = await import("./routers");
  return appRouter.createCaller({
    user: USER,
    req: { protocol: "http", headers: {}, ip: "10.0.0.2" },
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbh.getOrCreateIdentity.mockResolvedValue({ id: 42, userId: 7 });
  dbh.upsertIdentity.mockResolvedValue({ id: 42 });
  dbh.getIdentityByHandle.mockResolvedValue(null);
});

describe("identity.upsert avatarUrl shape", () => {
  it("accepts the root-relative /files/... url the local storage driver returns", { timeout: 30000 }, async () => {
    const c = await caller();
    await expect(
      c.identity.upsert({ avatarUrl: "/files/users/7/avatars/avatar-ab12cd34.png" }),
    ).resolves.toBeTruthy();
    expect(dbh.upsertIdentity).toHaveBeenCalled();
  });

  it("still accepts full https urls and the empty reset value", { timeout: 30000 }, async () => {
    const c = await caller();
    await expect(c.identity.upsert({ avatarUrl: "https://cdn.example.com/a.png" })).resolves.toBeTruthy();
    await expect(c.identity.upsert({ avatarUrl: "" })).resolves.toBeTruthy();
  });

  it("rejects values that are neither a URL nor a root-relative path", async () => {
    const c = await caller();
    await expect(c.identity.upsert({ avatarUrl: "javascript:alert(1)" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c.identity.upsert({ avatarUrl: "avatars/foo.png" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
