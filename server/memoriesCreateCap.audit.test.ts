/**
 * Batch 2 audit test, item 7 (create-side bound): memories.create must refuse
 * oversized content instead of storing megabytes that then feed every prompt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const dbh = vi.hoisted(() => ({
  getDb: vi.fn(),
  getOrCreateIdentity: vi.fn(),
  createMemory: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./db");
  return { ...actual, getDb: dbh.getDb, getOrCreateIdentity: dbh.getOrCreateIdentity, createMemory: dbh.createMemory };
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
    req: { protocol: "http", headers: {}, ip: "10.0.0.1" },
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbh.getDb.mockResolvedValue({});
  dbh.getOrCreateIdentity.mockResolvedValue({ id: 42 });
  dbh.createMemory.mockResolvedValue({ id: 1 });
});

describe("memories.create content bound", () => {
  it("accepts normal-length content", { timeout: 30000 }, async () => {
    const c = await caller();
    await expect(
      c.memories.create({ type: "fact", content: "Prefers metric units" }),
    ).resolves.toEqual({ success: true });
  });

  it("refuses content longer than 4000 chars with a clean BAD_REQUEST", { timeout: 30000 }, async () => {
    const c = await caller();
    await expect(
      c.memories.create({ type: "fact", content: "x".repeat(4001) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbh.createMemory).not.toHaveBeenCalled();
  });
});
