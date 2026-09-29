import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({
  LIVING_MEMORY_KEY: "livingMemoryEnabled",
  getUserSetting: vi.fn(),
  setUserSetting: vi.fn(),
}));
const db = vi.hoisted(() => ({
  getOrCreateIdentity: vi.fn(),
  getMemoriesByIdentity: vi.fn(),
  deleteMemory: vi.fn(),
}));
const llm = vi.hoisted(() => ({ complete: vi.fn() }));

vi.mock("../../lib/fnStore", () => store);
vi.mock("../../db", () => db);
vi.mock("../../lib/fnLlm", () => ({
  complete: llm.complete,
  LlmUnavailableError: class LlmUnavailableError extends Error {},
}));

import { extractMemories, handleMemories, livingMemoryEnabled, parseExtractedMemories } from "./memories";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const request = (body: unknown) => ({ body } as never);

beforeEach(() => {
  vi.clearAllMocks();
  store.getUserSetting.mockResolvedValue(undefined);
  store.setUserSetting.mockResolvedValue(undefined);
  db.getOrCreateIdentity.mockResolvedValue({ id: 42, userId: 7 });
  db.getMemoriesByIdentity.mockResolvedValue([]);
  db.deleteMemory.mockResolvedValue(undefined);
});

describe("parseExtractedMemories", () => {
  it("keeps well-formed proposals with a known type", () => {
    const raw = '{"memories":[{"type":"preference","content":"Prefers short memos."}]} extra prose';
    expect(parseExtractedMemories(raw)).toEqual([{ type: "preference", content: "Prefers short memos." }]);
  });

  it("drops unknown types, blank content, oversized items and junk", () => {
    const raw = JSON.stringify([
      { type: "gossip", content: "not in the enum" },
      { type: "fact", content: "   " },
      { type: "fact", content: "x".repeat(500) },
      "a string",
      null,
      { type: "project", content: "Building a nickel dashboard." },
    ]);
    expect(parseExtractedMemories(raw)).toEqual([{ type: "project", content: "Building a nickel dashboard." }]);
  });

  it("returns nothing for prose, broken JSON or an object instead of an array", () => {
    expect(parseExtractedMemories("I found nothing worth keeping.")).toEqual([]);
    expect(parseExtractedMemories("[{type:")).toEqual([]);
    expect(parseExtractedMemories("[1,2,3]")).toEqual([]);
  });

  it("caps the number of proposals", () => {
    const many = Array.from({ length: 20 }, (_unused, i) => ({ type: "fact", content: `Fact ${i}` }));
    expect(parseExtractedMemories(JSON.stringify(many))).toHaveLength(8);
  });
});

describe("living memory switch", () => {
  it("is on until the user turns it off", async () => {
    store.getUserSetting.mockResolvedValueOnce(undefined);
    expect(await livingMemoryEnabled(7)).toBe(true);
    store.getUserSetting.mockResolvedValueOnce(false);
    expect(await livingMemoryEnabled(7)).toBe(false);
    expect(store.getUserSetting).toHaveBeenLastCalledWith(7, "livingMemoryEnabled");
  });

  it("extract proposes nothing while the switch is off", async () => {
    store.getUserSetting.mockResolvedValueOnce(false);
    const result = await extractMemories(7, { action: "extract", conversation: "User: hi" });
    expect(result).toEqual({ memories: [] });
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("setSetting stores the flag for the signed-in user", async () => {
    const res = fakeRes();
    await handleMemories(7, request({ action: "setSetting", enabled: false }), res as never);
    expect(store.setUserSetting).toHaveBeenCalledWith(7, "livingMemoryEnabled", false);
    expect(res.body).toEqual({ ok: true, enabled: false });
  });

  it("getSetting answers with the shape MemorySwitch reads", async () => {
    store.getUserSetting.mockResolvedValueOnce(true);
    const res = fakeRes();
    await handleMemories(7, request({ action: "getSetting" }), res as never);
    expect(res.body).toEqual({ enabled: true });
  });

  it("setSetting refuses a non-boolean", async () => {
    await expect(handleMemories(7, request({ action: "setSetting", enabled: "no" }), fakeRes() as never)).rejects.toThrow(
      "Enabled is required."
    );
    expect(store.setUserSetting).not.toHaveBeenCalled();
  });
});

describe("memories rows", () => {
  it("lists through the caller's own identity only", async () => {
    db.getMemoriesByIdentity.mockResolvedValueOnce([
      {
        id: 1,
        type: "fact",
        content: "Lives in Bandung",
        sourceApp: "chat",
        title: null,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    ]);
    const res = fakeRes();
    await handleMemories(7, request({ action: "list" }), res as never);
    expect(db.getOrCreateIdentity).toHaveBeenCalledWith(7);
    expect(db.getMemoriesByIdentity).toHaveBeenCalledWith(42, undefined);
    expect(res.body).toEqual({
      memories: [{ id: 1, type: "fact", content: "Lives in Bandung", source: "chat", createdAt: "2026-09-01T00:00:00.000Z" }],
    });
  });

  it("deletes scoped to the caller's identity", async () => {
    const res = fakeRes();
    await handleMemories(7, request({ action: "delete", id: 9 }), res as never);
    expect(db.deleteMemory).toHaveBeenCalledWith(9, 42);
    expect(res.body).toEqual({ ok: true, id: 9 });
  });

  it("refuses a bad type filter before touching the table", async () => {
    await expect(handleMemories(7, request({ action: "list", type: "secret" }), fakeRes() as never)).rejects.toThrow(
      "Memory type is not valid."
    );
    expect(db.getMemoriesByIdentity).not.toHaveBeenCalled();
  });

  it("fails when there is no identity to write through", async () => {
    db.getOrCreateIdentity.mockResolvedValueOnce(null);
    await expect(handleMemories(7, request({ action: "list" }), fakeRes() as never)).rejects.toThrow("Memory storage is unavailable.");
  });

  it("rejects an unknown action", async () => {
    await expect(handleMemories(7, request({ action: "wipe-all" }), fakeRes() as never)).rejects.toThrow("Unknown action: wipeall");
  });
});

describe("extract request contract", () => {
  it("sends the conversation to the model and returns proposals", async () => {
    llm.complete.mockResolvedValueOnce({ text: '[{"type":"preference","content":"Likes tables."}]' });
    const result = await extractMemories(7, { action: "extract", conversation: "User: I like tables", source: "chat" });
    expect(result).toEqual({ memories: [{ type: "preference", content: "Likes tables." }] });
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(store.setUserSetting).not.toHaveBeenCalled();
  });

  it("requires a conversation", async () => {
    await expect(extractMemories(7, {})).rejects.toThrow("Conversation is required.");
  });

  it("refuses a conversation longer than the client limit", async () => {
    await expect(extractMemories(7, { conversation: "x".repeat(30001) })).rejects.toThrow("too long");
  });

  it("turns a missing model into a 503 the client can show", async () => {
    const { LlmUnavailableError } = await import("../../lib/fnLlm");
    llm.complete.mockRejectedValueOnce(new LlmUnavailableError());
    await expect(extractMemories(7, { conversation: "User: hi" })).rejects.toMatchObject({ status: 503 });
  });
});
