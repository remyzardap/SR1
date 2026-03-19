/**
 * e2e.test.ts — Sutaeru end-to-end smoke tests
 *
 * Verifies the live Railway deployment is healthy by hitting key endpoints.
 * Uses only built-in Node.js fetch (Node 18+), no extra dependencies.
 *
 * Run with:  pnpm test:e2e
 */
import { describe, expect, it } from "vitest";

const BASE_URL = "https://sutaeru.com";

describe("Sutaeru — live deployment smoke tests", () => {
  it("GET /api/health → HTTP 200", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
  });

  it("GET / → HTTP 200 (HTML response)", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toMatch(/html/i);
  });

  it("GET /api/trpc/identity.get → HTTP 401 (unauthenticated)", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/identity.get`);
    // tRPC returns 401 for protected procedures when unauthenticated
    expect(res.status).toBe(401);
  });
});
