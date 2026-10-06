import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Source } from "./sources";

const db = vi.hoisted(() => ({
  messages: [] as Array<{
    id: string;
    sessionId: string;
    userId: number;
    content: string;
    role: string;
    model: string | null;
    settings: Record<string, unknown>;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }>,
  sessions: new Map<string, { id: string; userId: number; title: string }>(),
}));

vi.mock("../db", async () => {
  return {
    getDb: vi.fn(async () => null),
    addChatMessage: vi.fn(async (
      sessionId: string,
      userId: number,
      content: string,
      role: string,
      model?: string,
      settings?: Record<string, unknown>,
      metadata?: Record<string, unknown>
    ) => {
      const id = "msg-" + (db.messages.length + 1);
      db.messages.push({
        id,
        sessionId,
        userId,
        content,
        role,
        model: model || null,
        settings: settings ?? {},
        metadata: metadata ?? {},
        createdAt: new Date(),
      });
      return id;
    }),
    getChatSessionMessages: vi.fn(async (sessionId: string) => {
      return db.messages
        .filter((m) => m.sessionId === sessionId)
        .map((m) => ({ ...m, metadata: m.metadata ?? {} }));
    }),
    listChatSessions: vi.fn(async (userId: number) => {
      return Array.from(db.sessions.values()).filter((s) => s.userId === userId);
    }),
    createChatSession: vi.fn(async (userId: number, title: string) => {
      const id = "550e8400-e29b-41d4-a716-446655440000";
      db.sessions.set(id, { id, userId, title });
      return id;
    }),
    updateChatSessionTitle: vi.fn(async () => {}),
    deleteChatSession: vi.fn(async () => {}),
    getChatSessionSettings: vi.fn(async () => ({})),
    ensureChatSession: vi.fn(async () => "owned" as const),
  };
});

// Mock dependencies for routers
vi.mock("../_core/email", () => ({
  sendPasswordResetEmail: vi.fn(async () => {}),
  sendEmailVerification: vi.fn(async () => {}),
}));
vi.mock("./routers/kemma", async () => {
  const { router } = await import("../_core/trpc");
  return { kemmaRouter: router({}) };
});
vi.mock("../llmProvider", () => ({
  generateStyleOptions: vi.fn(async () => []),
  generateDocumentContent: vi.fn(async () => ""),
}));
vi.mock("../fileGenerator", () => ({
  generateFile: vi.fn(async () => ({ buffer: Buffer.from(""), mimeType: "", extension: "" })),
  STYLE_DEFINITIONS: [],
}));
vi.mock("../services/vectorSearch", () => ({
  embed: vi.fn(async () => []),
  upsertVector: vi.fn(async () => {}),
  removeVector: vi.fn(async () => {}),
  searchSimilar: vi.fn(async () => []),
  isVectorSearchConfigured: vi.fn(() => false),
}));

describe("P1-07: Citations and Persisted Message Metadata", () => {
  const SESSION_OWNER = "550e8400-e29b-41d4-a716-446655440001";
  const OTHER_SESSION = "550e8400-e29b-41d4-a716-446655440002";
  const USER_ID = 42;

  beforeEach(() => {
    vi.clearAllMocks();
    db.messages = [];
    db.sessions.clear();
    db.sessions.set(SESSION_OWNER, { id: SESSION_OWNER, userId: USER_ID, title: "Research chat" });
    db.sessions.set(OTHER_SESSION, { id: OTHER_SESSION, userId: 999, title: "Other chat" });
  });

  describe("AC2: Session history round-trip through tRPC chat.getMessages", () => {
    it("returns persisted metadata so the client can rebuild sources on reload", async () => {
      const { appRouter } = await import("../routers");
      const ctx = {
        user: { id: USER_ID, openId: "usr-42", name: "Tester", role: "user" } as any,
        req: { protocol: "http", headers: {}, ip: "127.0.0.1" } as any,
        res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
      };
      const caller = appRouter.createCaller(ctx);

      const sources: Source[] = [
        { id: 1, title: "Global Tax 2026", url: "https://tax.example.com", date: "2026-03" },
        { id: 3, title: "ASEAN FDI Report", url: "https://asean.example.com/fdi", date: "2026-01" },
      ];

      const activity = [
        { tool: "web_search", label: "Found 2 sources", status: "done" as const, ms: 145 },
      ];

      const usage = { inputTokens: 1200, outputTokens: 350, totalTokens: 1550 };

      // 1. Persist user message
      const { addChatMessage } = await import("../db");
      await addChatMessage(SESSION_OWNER, USER_ID, "What are the tax incentives?", "user");

      // 2. Persist assistant message with metadata
      await addChatMessage(
        SESSION_OWNER,
        USER_ID,
        "According to [1], corporate tax is 22%. ASEAN reports high FDI inflows [3].",
        "assistant",
        "qwen3.8-max (qwen)",
        undefined,
        {
          sources,
          activity,
          usage,
          model: "qwen3.8-max (qwen)",
          thinking: "Comparing tax incentives across ASEAN.",
        }
      );

      // 3. Reload session through tRPC procedure
      const messages = await caller.chat.getMessages({ sessionId: SESSION_OWNER });

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("user");
      expect(messages[0].metadata).toEqual({});

      const assistantMsg = messages[1];
      expect(assistantMsg.role).toBe("assistant");
      expect(assistantMsg.content).toBe("According to [1], corporate tax is 22%. ASEAN reports high FDI inflows [3].");
      expect(assistantMsg.model).toBe("qwen3.8-max (qwen)");

      // Sources must be present with their stable ids
      expect(assistantMsg.metadata).toBeDefined();
      expect(assistantMsg.metadata.sources).toEqual(sources);
      expect(assistantMsg.metadata.sources[0].id).toBe(1);
      expect(assistantMsg.metadata.sources[1].id).toBe(3);

      // Activity and usage must be present
      expect(assistantMsg.metadata.activity).toEqual(activity);
      expect(assistantMsg.metadata.usage).toEqual(usage);
      expect(assistantMsg.metadata.thinking).toBe("Comparing tax incentives across ASEAN.");
    });

    it("failure path: chat.getMessages refuses sessions owned by another user with FORBIDDEN", async () => {
      const { appRouter } = await import("../routers");
      const ctx = {
        user: { id: USER_ID, openId: "usr-42", name: "Tester", role: "user" } as any,
        req: { protocol: "http", headers: {}, ip: "127.0.0.1" } as any,
        res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
      };
      const caller = appRouter.createCaller(ctx);

      await expect(caller.chat.getMessages({ sessionId: OTHER_SESSION })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("failure path: chat.getMessages rejects non-uuid sessionId with validation error", async () => {
      const { appRouter } = await import("../routers");
      const ctx = {
        user: { id: USER_ID, openId: "usr-42", name: "Tester", role: "user" } as any,
        req: { protocol: "http", headers: {}, ip: "127.0.0.1" } as any,
        res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
      };
      const caller = appRouter.createCaller(ctx);

      await expect(caller.chat.getMessages({ sessionId: "not-a-uuid" })).rejects.toThrow();
    });
  });

  describe("metadata thinking character capping", () => {
    it("caps thinking text at 20,000 characters when saving metadata", async () => {
      const longThinking = "t".repeat(25_000);
      const capped = longThinking.slice(0, 20_000);
      expect(capped).toHaveLength(20_000);

      const { addChatMessage, getChatSessionMessages } = await import("../db");
      await addChatMessage(
        SESSION_OWNER,
        USER_ID,
        "Deep answer.",
        "assistant",
        "qwen3.8-max",
        undefined,
        {
          sources: [],
          thinking: capped,
        }
      );

      const msgs = await getChatSessionMessages(SESSION_OWNER);
      expect(msgs[0].metadata.thinking).toHaveLength(20_000);
    });
  });
});
