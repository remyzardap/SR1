import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kemmaExecute: vi.fn(),
  addChatMessage: vi.fn(),
  createChatSession: vi.fn(),
  getChatSessionMessages: vi.fn(),
  getUserById: vi.fn(),
  listChatSessions: vi.fn(),
  getChatSessionSettings: vi.fn(),
  isAdminUser: vi.fn(),
  getQuotaSummary: vi.fn(),
  chatImageOwnerUserId: vi.fn(),
  s1Blend: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../routers/s1Router", () => ({
  s1Blend: m.s1Blend,
  buildS1SystemPrompt: () => "system prompt",
  resolveBearer: async () => "bearer",
}));
vi.mock("../kemma/engine", () => ({ kemmaExecute: m.kemmaExecute }));
vi.mock("../db", () => ({
  addChatMessage: m.addChatMessage, createChatSession: m.createChatSession, getChatSessionMessages: m.getChatSessionMessages,
  getUserById: m.getUserById, listChatSessions: m.listChatSessions, getChatSessionSettings: m.getChatSessionSettings,
}));
vi.mock("../kemma/executors/vpsFiles", () => ({ isAdminUser: m.isAdminUser }));
vi.mock("../core/quotaCheck", () => ({ getQuotaSummary: m.getQuotaSummary }));
vi.mock("./chatImage", () => ({ chatImageOwnerUserId: m.chatImageOwnerUserId }));

import { runTelegramChat, startNewTelegramThread, TELEGRAM_THREAD_TITLE } from "./telegramChat";

beforeEach(() => {
  vi.clearAllMocks();
  m.chatImageOwnerUserId.mockResolvedValue(7);
  m.getUserById.mockResolvedValue({ name: "Owner" });
  m.getChatSessionSettings.mockResolvedValue({});
  m.isAdminUser.mockResolvedValue(true);
  delete process.env.VENICE_API_KEY;
  delete process.env.VENICE_SENSITIVE_ROUTING;
  m.listChatSessions.mockResolvedValue([{ id: "other", title: "Weekly plan" }, { id: "tg-1", title: "Telegram" }]);
  m.getChatSessionMessages.mockResolvedValue([
    { role: "user", content: "earlier question" },
    { role: "assistant", content: "earlier answer" },
  ]);
  m.getQuotaSummary.mockResolvedValue({ tier: "max" });
  m.kemmaExecute.mockResolvedValue({ response: "  the answer  ", isError: false });
  m.createChatSession.mockResolvedValue("tg-new");
  // The blend: two drafts counted, final answer written by a plain completion.
  m.s1Blend.mockResolvedValue({ config: { baseUrl: "https://llm.test/v1", model: "m", apiKey: "k" }, messages: [{ role: "user", content: "blend prompt" }], contributors: ["gemini", "qwen"] });
  m.fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: " blended answer " } }] }), { status: 200 }));
  vi.stubGlobal("fetch", m.fetch);
});

describe("runTelegramChat", () => {
  it("answers on the main engine as the owner, with the saved thread as history", async () => {
    expect(await runTelegramChat("and now?", "solo")).toBe("the answer");
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
    await runTelegramChat("hello", "solo");
    expect(m.addChatMessage).toHaveBeenCalledWith("tg-1", 7, "hello", "user");
    expect(m.addChatMessage).toHaveBeenCalledWith("tg-1", 7, "the answer", "assistant");
  });
  it("starts a Telegram thread when there is none", async () => {
    m.listChatSessions.mockResolvedValue([{ id: "other", title: "Weekly plan" }]);
    await runTelegramChat("hello", "solo");
    expect(m.createChatSession).toHaveBeenCalledWith(7, TELEGRAM_THREAD_TITLE);
    expect(m.kemmaExecute.mock.calls[0][0].sessionId).toBe("tg-new");
  });
  it("does not save an engine error as an answer", async () => {
    m.kemmaExecute.mockResolvedValue({ response: "Daily message limit reached", isError: true });
    expect(await runTelegramChat("hello", "solo")).toBe("Daily message limit reached");
    expect(m.addChatMessage).not.toHaveBeenCalledWith("tg-1", 7, expect.anything(), "assistant");
  });
  it("turns a crash into a plain line instead of throwing", async () => {
    m.chatImageOwnerUserId.mockRejectedValue(new Error("boom"));
    expect(await runTelegramChat("hello", "solo")).toMatch(/went wrong/i);
  });
  it("says so when there is no owner account", async () => {
    m.chatImageOwnerUserId.mockResolvedValue(null);
    expect(await runTelegramChat("hello")).toMatch(/no owner account/i);
    expect(m.kemmaExecute).not.toHaveBeenCalled();
  });
});

describe("runTelegramChat (blended, the default)", () => {
  it("passes the engine answer in as a draft and writes one final answer from the blend", async () => {
    expect(await runTelegramChat("and now?")).toBe("blended answer");
    const opts = m.s1Blend.mock.calls[0][2];
    expect(opts.skipDraft).toEqual(["gemini"]);
    expect(await opts.extraDrafts).toEqual([{ id: "gemini", label: "Kemma", text: "the answer" }]);
    expect(m.addChatMessage).toHaveBeenCalledWith("tg-1", 7, "blended answer", "assistant");
    expect(m.addChatMessage).toHaveBeenCalledTimes(2);
  });
  it("falls back to the engine answer when the blend call fails", async () => {
    m.fetch.mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await runTelegramChat("hello")).toBe("the answer");
  });
  it("falls back to the engine answer when the blend cannot be built", async () => {
    m.s1Blend.mockRejectedValue(new Error("no providers"));
    expect(await runTelegramChat("hello")).toBe("the answer");
  });
  it("keeps the engine answer when fewer than two drafts exist, without a second call", async () => {
    m.s1Blend.mockResolvedValue({ config: { baseUrl: "https://llm.test/v1", model: "m", apiKey: "k" }, messages: [], contributors: ["gemini"] });
    expect(await runTelegramChat("hello")).toBe("the answer");
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("still answers from the other models when the engine itself fails", async () => {
    m.kemmaExecute.mockResolvedValue({ response: "Daily message limit reached", isError: true });
    m.s1Blend.mockResolvedValue({ config: { baseUrl: "https://llm.test/v1", model: "m", apiKey: "k" }, messages: [], contributors: ["qwen"] });
    expect(await runTelegramChat("hello")).toBe("blended answer");
    expect((await m.s1Blend.mock.calls[0][2].extraDrafts)).toEqual([]);
  });
  it("says what went wrong when every model fails", async () => {
    m.kemmaExecute.mockResolvedValue({ response: "Daily message limit reached", isError: true });
    m.s1Blend.mockResolvedValue({ config: { baseUrl: "https://llm.test/v1", model: "m", apiKey: "k" }, messages: [], contributors: [] });
    m.fetch.mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await runTelegramChat("hello")).toBe("Daily message limit reached");
  });
  it("solo skips the blend entirely", async () => {
    await runTelegramChat("hello", "solo");
    expect(m.s1Blend).not.toHaveBeenCalled();
  });
});

describe("sensitive messages", () => {
  const SENSITIVE = "write an explicit sex scene between two adults";
  afterEach(() => { delete process.env.VENICE_API_KEY; delete process.env.VENICE_SENSITIVE_ROUTING; });

  it("skips the blend and goes to Venice alone", async () => {
    process.env.VENICE_API_KEY = "k";
    expect(await runTelegramChat(SENSITIVE)).toBe("the answer");
    expect(m.s1Blend).not.toHaveBeenCalled();
    expect(m.kemmaExecute.mock.calls[0][0].modelOverride).toBe("venice/venice-uncensored-1-2");
  });
  it("blends as usual when routing is off, not allowed, or the owner is not an admin", async () => {
    process.env.VENICE_API_KEY = "k";
    m.getChatSessionSettings.mockResolvedValue({ sensitiveRouting: "off" });
    await runTelegramChat(SENSITIVE);
    m.getChatSessionSettings.mockResolvedValue({});
    m.isAdminUser.mockResolvedValue(false);
    await runTelegramChat(SENSITIVE);
    process.env.VENICE_SENSITIVE_ROUTING = "0";
    m.isAdminUser.mockResolvedValue(true);
    await runTelegramChat(SENSITIVE);
    expect(m.s1Blend).toHaveBeenCalledTimes(3);
    expect(m.kemmaExecute.mock.calls.every((c) => c[0].modelOverride === undefined)).toBe(true);
  });
  it("refuses a blocked message before saving it or calling any model", async () => {
    expect(await runTelegramChat("sexual story about a 14 year old")).toBe("I can't help with that.");
    expect(m.kemmaExecute).not.toHaveBeenCalled();
    expect(m.addChatMessage).not.toHaveBeenCalled();
    expect(m.s1Blend).not.toHaveBeenCalled();
  });
});

describe("startNewTelegramThread", () => {
  it("creates a newer thread and leaves the old one alone", async () => {
    expect(await startNewTelegramThread()).toBe(true);
    expect(m.createChatSession).toHaveBeenCalledWith(7, TELEGRAM_THREAD_TITLE);
  });
});
