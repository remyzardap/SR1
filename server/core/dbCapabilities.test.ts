import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock, executeMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: getDbMock }));

/**
 * Renders the text of the first statement passed to db.execute(). SQL objects need a dialect
 * before toQuery() works, so the raw chunks are read instead.
 */
function executedSql(): string {
  const statement = executeMock.mock.calls[0]?.[0] as { queryChunks?: unknown[] } | undefined;
  return (statement?.queryChunks ?? [])
    .map((chunk) => (typeof chunk === "string" ? chunk : String((chunk as { value?: unknown }).value ?? "")))
    .join("");
}

beforeEach(async () => {
  executeMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock } as unknown);
  // The probe is memoised module-wide, so every test starts from a cold cache.
  const { resetDbCapabilitiesCacheForTests } = await import("./dbCapabilities");
  resetDbCapabilitiesCacheForTests();
});

describe("hasPgvector", () => {
  it("reports true when pg_extension lists the vector extension", async () => {
    executeMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const { hasPgvector } = await import("./dbCapabilities");

    await expect(hasPgvector()).resolves.toBe(true);
    expect(executedSql()).toMatch(/pg_extension/);
    expect(executedSql()).toMatch(/extname = 'vector'/);
  });

  it("reports false when the extension is not installed", async () => {
    executeMock.mockResolvedValue({ rows: [] });
    const { hasPgvector } = await import("./dbCapabilities");

    await expect(hasPgvector()).resolves.toBe(false);
  });

  it("caches the answer, so the probe runs once per process", async () => {
    executeMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const { hasPgvector, resetDbCapabilitiesCacheForTests } = await import("./dbCapabilities");

    await Promise.all([hasPgvector(), hasPgvector(), hasPgvector()]);
    expect(getDbMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledTimes(1);

    resetDbCapabilitiesCacheForTests();
    await hasPgvector();
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it("reports false without a database instead of throwing", async () => {
    getDbMock.mockResolvedValue(null);
    const { hasPgvector } = await import("./dbCapabilities");

    await expect(hasPgvector()).resolves.toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("reports false and warns when the probe fails", async () => {
    executeMock.mockRejectedValue(new Error('relation "pg_extension" does not exist'));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { hasPgvector } = await import("./dbCapabilities");

    await expect(hasPgvector()).resolves.toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
