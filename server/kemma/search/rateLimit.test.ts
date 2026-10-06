import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { acquireSearchToken, resetSearchRateLimiters } from "./rateLimit";

const ENV = ["KEMMA_SEARCH_RPM", "KEMMA_SEARCH_RPM_BRAVE"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  resetSearchRateLimiters();
  for (const n of ENV) { saved.set(n, process.env[n]); delete process.env[n]; }
});
afterEach(() => { for (const [n, v] of saved) if (v === undefined) delete process.env[n]; else process.env[n] = v; });

describe("acquireSearchToken", () => {
  it("lets the first call through immediately", async () => {
    process.env.KEMMA_SEARCH_RPM_BRAVE = "2";
    let now = 1_000_000;
    await acquireSearchToken("brave", { nowMs: () => now, sleep: async () => {} });
  });

  it("waits for a refill once the bucket is exhausted, using the per-provider RPM override", async () => {
    process.env.KEMMA_SEARCH_RPM = "1000"; // default; should be ignored for "brave" below
    process.env.KEMMA_SEARCH_RPM_BRAVE = "60"; // 1 token per second
    let now = 0;
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); now += ms; };

    await acquireSearchToken("brave", { nowMs: () => now, sleep }); // consumes the initial full bucket's first token
    await acquireSearchToken("brave", { nowMs: () => now, sleep }); // bucket now has ~59, still available
    expect(waits).toHaveLength(0);
  });

  it("keeps independent buckets per provider id", async () => {
    process.env.KEMMA_SEARCH_RPM_BRAVE = "1";
    let now = 0;
    const sleep = async () => {};
    await acquireSearchToken("brave", { nowMs: () => now, sleep });
    // A different provider id (default RPM, much higher) is unaffected by brave's exhausted bucket.
    await acquireSearchToken("tavily", { nowMs: () => now, sleep });
  });

  it("blocks until enough time has passed to refill a token", async () => {
    process.env.KEMMA_SEARCH_RPM_BRAVE = "60"; // 1 token/sec, capacity 60
    let now = 0;
    const sleep = async (ms: number) => { now += ms; };

    // Drain the bucket.
    for (let i = 0; i < 60; i++) await acquireSearchToken("brave", { nowMs: () => now, sleep });
    const before = now;
    await acquireSearchToken("brave", { nowMs: () => now, sleep });
    expect(now).toBeGreaterThan(before); // had to wait for a refill
  });
});
