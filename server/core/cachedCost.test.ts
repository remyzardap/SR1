import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Cache-aware cost estimation and usage logging. db mocked; router price functions are real.

const dbh = vi.hoisted(() => ({ getDb: vi.fn(), inserted: [] as any[] }));
vi.mock("../db", () => ({ getDb: dbh.getDb }));

import { logUsage } from "./usage";
import { estimateCostUsd, cachedInputMultiplier } from "./kemmaRouter";

beforeEach(() => {
  dbh.inserted = [];
  dbh.getDb.mockResolvedValue({ insert: () => ({ values: (v: any) => { dbh.inserted.push(v); return Promise.resolve(); } }) });
});
afterEach(() => vi.unstubAllEnvs());

describe("estimateCostUsd with cached tokens", () => {
  it("is unchanged when nothing was cached", () => {
    expect(estimateCostUsd("qwen3.8-max", 1_000_000, 0)).toBeCloseTo(2, 6);
    expect(estimateCostUsd("qwen3.8-max", 1_000_000, 0, 0)).toBeCloseTo(2, 6);
  });

  it("bills cached Qwen tokens at 20% of the input price", () => {
    // 1M input at $2/M, 800k of it cached: 200k full + 800k * 0.2 = 360k billed -> $0.72
    expect(estimateCostUsd("qwen3.8-max", 1_000_000, 0, 800_000)).toBeCloseTo(0.72, 6);
  });

  it("bills cached Gemini tokens at 25% of the input price", () => {
    // $0.75/M: 500k full + 500k * 0.25 = 625k billed -> $0.46875
    expect(estimateCostUsd("gemini-3.8-flash", 1_000_000, 0, 500_000)).toBeCloseTo(0.46875, 6);
  });

  it("never discounts output tokens", () => {
    expect(estimateCostUsd("qwen3.8-max", 0, 1_000_000, 0)).toBeCloseTo(6, 6);
  });

  it("clamps cached tokens to the input count", () => {
    expect(estimateCostUsd("qwen3.8-max", 1000, 0, 999_999)).toBeCloseTo(estimateCostUsd("qwen3.8-max", 1000, 0, 1000), 9);
  });

  it("KEMMA_CACHED_INPUT_MULTIPLIER overrides the default, ignoring out-of-range values", () => {
    vi.stubEnv("KEMMA_CACHED_INPUT_MULTIPLIER", "0.1");
    expect(cachedInputMultiplier("qwen3.8-max")).toBe(0.1);
    vi.stubEnv("KEMMA_CACHED_INPUT_MULTIPLIER", "5");
    expect(cachedInputMultiplier("qwen3.8-max")).toBe(0.2);
    vi.stubEnv("KEMMA_CACHED_INPUT_MULTIPLIER", "abc");
    expect(cachedInputMultiplier("gemini-3.8-flash")).toBe(0.25);
  });
});

describe("logUsage with cached tokens", () => {
  const base = { userId: 7, provider: "qwen" as const, model: "qwen3.8-max", purpose: "chat" };

  it("stores cachedInputTokens and a discounted cost", async () => {
    await logUsage({ ...base, inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 800_000 });
    expect(dbh.inserted[0].cachedInputTokens).toBe(800_000);
    expect(Number(dbh.inserted[0].estimatedCostUsd)).toBeCloseTo(0.72, 6);
  });

  it("defaults to 0 when the provider reported nothing", async () => {
    await logUsage({ ...base, inputTokens: 100, outputTokens: 10 });
    expect(dbh.inserted[0].cachedInputTokens).toBe(0);
  });

  it("clamps a bogus cached count to the input tokens", async () => {
    await logUsage({ ...base, inputTokens: 100, outputTokens: 10, cachedInputTokens: 5000 });
    expect(dbh.inserted[0].cachedInputTokens).toBe(100);
  });
});
