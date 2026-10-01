import { describe, it, expect, vi, beforeEach } from "vitest";

// memory.ts pulls in server/db (postgres) and services/vectorSearch (google SDK).
// Both are mocked: the seam under test is that memory.ts calls embed/searchSimilar
// through ../services/vectorSearch, and identity/memories through ../db.

const dbh = vi.hoisted(() => ({
  getDb: vi.fn(),
  getMemoriesByIdentity: vi.fn(),
  getOrCreateIdentity: vi.fn(),
}));

const vs = vi.hoisted(() => ({
  embed: vi.fn(),
  searchSimilar: vi.fn(),
  isVectorSearchConfigured: vi.fn(),
}));

vi.mock("../db", () => dbh);
vi.mock("../services/vectorSearch", () => vs);

import { getMemoriesContext } from "./memory";

const IDENTITY = { id: 42, userId: 7 };

beforeEach(() => {
  vi.clearAllMocks();
  dbh.getDb.mockResolvedValue({});
  vs.isVectorSearchConfigured.mockReturnValue(false);
  dbh.getOrCreateIdentity.mockResolvedValue(IDENTITY);
  dbh.getMemoriesByIdentity.mockResolvedValue([]);
  vs.embed.mockResolvedValue(Array.from({ length: 8 }, () => 0.1));
  vs.searchSimilar.mockResolvedValue([]);
});

describe("getMemoriesContext: recall flow and seams", () => {
  it("uses the vectorSearch embed/searchSimilar seam with the caller's identity id", async () => {
    vs.isVectorSearchConfigured.mockReturnValue(true);
    vs.searchSimilar.mockResolvedValue([{ id: 1, score: 0.9 }]);
    dbh.getMemoriesByIdentity.mockResolvedValue([
      { id: 1, type: "preference", title: "Units", content: "Prefers metric units" },
      { id: 2, type: "fact", title: null, content: "Lives in Osaka" },
    ]);

    const ctx = await getMemoriesContext(7, "what units do I like?", 5);

    expect(vs.embed).toHaveBeenCalledWith("what units do I like?");
    // per-user isolation: the search is scoped to THIS user's identity, never another's
    expect(vs.searchSimilar).toHaveBeenCalledWith(expect.any(Array), 42, 5);
    expect(dbh.getMemoriesByIdentity).toHaveBeenCalledWith(42);
    expect(ctx).toBe("[preference] Units: Prefers metric units");
  });

  it("never leaks another identity's memories: results are filtered to the fetched set", async () => {
    vs.isVectorSearchConfigured.mockReturnValue(true);
    vs.searchSimilar.mockResolvedValue([{ id: 99, score: 0.99 }]);
    // identity 42 does not own memory 99, so the join lookup finds nothing and
    // the recency fallback (scoped to identity 42) is used instead
    dbh.getMemoriesByIdentity.mockResolvedValue([{ id: 5, type: "fact", title: null, content: "mine" }]);

    const ctx = await getMemoriesContext(7, "hello there friend", 5);
    expect(ctx).toBe("[fact] mine");
  });

  it("skips the embedding call for trivially short messages and falls back to recency", async () => {
    vs.isVectorSearchConfigured.mockReturnValue(true);
    dbh.getMemoriesByIdentity.mockResolvedValue([{ id: 1, type: "preference", title: "T", content: "C" }]);

    const ctx = await getMemoriesContext(7, "hi", 5);

    expect(vs.embed).not.toHaveBeenCalled();
    expect(vs.searchSimilar).not.toHaveBeenCalled();
    expect(ctx).toBe("[preference] T: C");
  });

  it("caps the number of items at maxItems in the recency fallback", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: i, type: "fact", title: null, content: `m${i}` }));
    dbh.getMemoriesByIdentity.mockResolvedValue(many);

    const ctx = await getMemoriesContext(7, "tell me about my projects", 3);
    expect(ctx!.split("\n")).toHaveLength(3);
  });

  it("returns undefined when the user has no memories at all", async () => {
    expect(await getMemoriesContext(7, "anything at all", 5)).toBeUndefined();
  });

  it("returns undefined when the user has no identity", async () => {
    dbh.getOrCreateIdentity.mockResolvedValue(null);
    expect(await getMemoriesContext(7, "anything at all", 5)).toBeUndefined();
  });
});

describe("getMemoriesContext: failure tolerance (a bad db must not blank the chat)", () => {
  it("swallows a throwing getOrCreateIdentity and returns undefined", async () => {
    dbh.getOrCreateIdentity.mockRejectedValue(new Error("connection reset"));
    await expect(getMemoriesContext(7, "hello there friend", 5)).resolves.toBeUndefined();
  });

  it("swallows a throwing getMemoriesByIdentity and returns undefined", async () => {
    dbh.getMemoriesByIdentity.mockRejectedValue(new Error("column user_id does not exist"));
    await expect(getMemoriesContext(7, "hello there friend", 5)).resolves.toBeUndefined();
  });

  it("falls back to recency when the embedding call fails", async () => {
    vs.isVectorSearchConfigured.mockReturnValue(true);
    vs.embed.mockRejectedValue(new Error("GEMINI_API_KEY is not configured"));
    dbh.getMemoriesByIdentity.mockResolvedValue([{ id: 1, type: "fact", title: null, content: "ok" }]);

    await expect(getMemoriesContext(7, "hello there friend", 5)).resolves.toBe("[fact] ok");
  });

  it("falls back to recency when the vector search itself fails", async () => {
    vs.isVectorSearchConfigured.mockReturnValue(true);
    vs.searchSimilar.mockRejectedValue(new Error("vectors must have same dimensions"));
    dbh.getMemoriesByIdentity.mockResolvedValue([{ id: 1, type: "fact", title: null, content: "ok" }]);

    await expect(getMemoriesContext(7, "hello there friend", 5)).resolves.toBe("[fact] ok");
  });

  it("swallows a db that is not even connectable (getDb throws)", async () => {
    dbh.getOrCreateIdentity.mockRejectedValue(new Error("getDb: no pool"));
    await expect(getMemoriesContext(7, "hello there friend", 5)).resolves.toBeUndefined();
  });
});

describe("getMemoriesContext: injection size", () => {
  it("has NO total-size cap: one huge memory is injected verbatim (documented gap)", async () => {
    const huge = "x".repeat(2_000_000);
    dbh.getMemoriesByIdentity.mockResolvedValue([{ id: 1, type: "fact", title: "big", content: huge }]);

    const ctx = await getMemoriesContext(7, "hello there friend", 5);
    // Audit expectation for the CURRENT code: the full 2MB string reaches the system
    // prompt. If a cap is added later, this test should be updated to assert truncation.
    expect(ctx).toContain(huge);
    expect(ctx!.length).toBeGreaterThan(2_000_000);
  });
});
