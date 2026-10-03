import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kemmaExecute: vi.fn(),
  addChatMessage: vi.fn(),
  createChatSession: vi.fn(),
  getChatSessionMessages: vi.fn(),
  getUserById: vi.fn(),
  listChatSessions: vi.fn(),
  getQuotaSummary: vi.fn(),
  chatImageOwnerUserId: vi.fn(),
}));
vi.mock("../kemma/engine", () => ({ kemmaExecute: m.kemmaExecute }));
vi.mock("../db", () => ({
  addChatMessage: m.addChatMessage, createChatSession: m.createChatSession, getChatSessionMessages: m.getChatSessionMessages,
  getUserById: m.getUserById, listChatSessions: m.listChatSessions,
}));
vi.mock("../core/quotaCheck", () => ({ getQuotaSummary: m.getQuotaSummary }));
vi.mock("./chatImage", () => ({ chatImageOwnerUserId: m.chatImageOwnerUserId }));

import { runTelegramChat, startNewTelegramThread, TELEGRAM_THREAD_TITLE } from "./telegramChat";

beforeEach(() => {
  vi.clearAllMocks();
  m.chatImageOwnerUserId.mockResolvedValue(7);
  m.getUserById.mockResolvedValue({ name: "Owner" });
  m.listChatSessions.mockResolvedValue([{ id: "other", title: "Weekly plan" }, { id: "tg-1", title: "Telegram" }]);
  m.getChatSessionMessages.mockResolvedValue([
    { role: "user", content: "earlier question" },
    { role: "assistant", content: "earlier answer" },
  ]);
  m.getQuotaSummary.mockResolvedValue({ tier: "max" });
  m.kemmaExecute.mockResolvedValue({ response: "  the answer  ", isError: false });
  m.createChatSession.mockResolvedValue("tg-new");
});

describe("runTelegramChat", () => {
  it("answers on the main engine as the owner, with the saved thread as history", async () => {
    expect(await runTelegramChat("and now?")).toBe("the answer");
    const call = m.kemmaExecute.mock.calls[0][0];
    expect(call.userId).toBe(7);
    expect(call.sessionId).toBe("tg-1");
    expect(call.messages).toEqual([
      { role: "user", content: "earlier question" },
      { role: "assistant", content: "earlier answer" },
      { role: "user", content: "and now?" },
    ]);
    expect(call.allowedTools.length).toBeGreaterThan(0);
  });
  it("saves both sides of the exchange in the thread", async () => {
    await runTelegramChat("hello");
    expect(m.addChatMessage).toHaveBeenCalledWith("tg-1", 7, "hello", "user");
    expect(m.addChatMessage).toHaveBeenCalledWith("tg-1", 7, "the answer", "assistant");
  });
  it("starts a Telegram thread when there is none", async () => {
    m.listChatSessions.mockResolvedValue([{ id: "other", title: "Weekly plan" }]);
    await runTelegramChat("hello");
    expect(m.createChatSession).toHaveBeenCalledWith(7, TELEGRAM_THREAD_TITLE);
    expect(m.kemmaExecute.mock.calls[0][0].sessionId).toBe("tg-new");
  });
  it("does not save an engine error as an answer", async () => {
    m.kemmaExecute.mockResolvedValue({ response: "Daily message limit reached", isError: true });
    expect(await runTelegramChat("hello")).toBe("Daily message limit reached");
    expect(m.addChatMessage).not.toHaveBeenCalledWith("tg-1", 7, expect.anything(), "assistant");
  });
  it("turns a crash into a plain line instead of throwing", async () => {
    m.kemmaExecute.mockRejectedValue(new Error("boom"));
    expect(await runTelegramChat("hello")).toMatch(/went wrong/i);
  });
  it("says so when there is no owner account", async () => {
    m.chatImageOwnerUserId.mockResolvedValue(null);
    expect(await runTelegramChat("hello")).toMatch(/no owner account/i);
    expect(m.kemmaExecute).not.toHaveBeenCalled();
  });
});

describe("startNewTelegramThread", () => {
  it("creates a newer thread and leaves the old one alone", async () => {
    expect(await startNewTelegramThread()).toBe(true);
    expect(m.createChatSession).toHaveBeenCalledWith(7, TELEGRAM_THREAD_TITLE);
  });
});
