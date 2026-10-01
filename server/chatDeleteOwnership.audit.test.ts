/**
 * Batch 2 audit test, item 1: chat.deleteSession in server/routers.ts must refuse
 * sessions the caller does not own before calling deleteChatSession, which deletes
 * chat_messages by sessionId before any userId filter (server/db.ts). The sibling
 * renameSession already pre-checks with listChatSessions; deleteSession did not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  sessions: [] as { id: string; userId: number }[],
  deleted: [] as Array<{ sessionId: string; userId: number }>,
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./db");
  return {
    ...actual,
    getDb: vi.fn(async () => null),
    listChatSessions: vi.fn(async (userId: number) =>
      store.sessions.filter((s) => s.userId === userId)
    ),
    deleteChatSession: vi.fn(async (sessionId: string, userId: number) => {
      store.deleted.push({ sessionId, userId });
    }),
  };
});

vi.mock("./_core/email", async () => {
  const { vi: vitest } = await import("vitest");
  return {
    sendPasswordResetEmail: vitest.fn(async () => {}),
    sendEmailVerification: vitest.fn(async () => {}),
  };
});

// Pull in only what the chat router needs; the heavy LLM surfaces are irrelevant here.
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

const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const FOREIGN = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

const USER = { id: 7, openId: "open-7", name: "Ruth", email: "ruth@example.com", role: "user" };

function makeCtx() {
  return {
    user: USER as any,
    req: { protocol: "http", headers: {}, ip: "127.0.0.1" } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
  };
}

async function caller() {
  const { appRouter } = await import("./routers");
  return appRouter.createCaller(makeCtx() as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.sessions = [{ id: OWNER, userId: 7 }];
  store.deleted = [];
});

describe("chat.deleteSession ownership pre-check", () => {
  it("deletes the caller's own session", { timeout: 30000 }, async () => {
    const c = await caller();
    const res = await c.chat.deleteSession({ sessionId: OWNER });
    expect(res).toEqual({ success: true });
    expect(store.deleted).toEqual([{ sessionId: OWNER, userId: 7 }]);
  });

  it("refuses a session owned by someone else and touches nothing", { timeout: 30000 }, async () => {
    const c = await caller();
    await expect(c.chat.deleteSession({ sessionId: FOREIGN })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(store.deleted).toEqual([]);
  });

  it("refuses an unknown sessionId", async () => {
    const c = await caller();
    await expect(
      c.chat.deleteSession({ sessionId: "9c5d6b1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.deleted).toEqual([]);
  });
});
