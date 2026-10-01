/**
 * Audit test (area 8): upsertVector's raw JSONB merge must reference the real
 * memories column. schema.ts maps memories.structuredData to the QUOTED camelCase
 * column "structuredData" (bootstrap.sql creates it quoted), so a bare
 * `COALESCE(structured_data, ...)` fails on Postgres with 42703
 * column "structured_data" does not exist on every semantic-index write, silently
 * (routers.ts fire-and-forgets the failure). The fix interpolates the drizzle
 * column so the dialect quotes it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("../db", () => ({ getDb: async () => fakeDb }));

import { upsertVector } from "./vectorSearch";
import { memories } from "../../drizzle/schema";

const captured: Array<{ set: Record<string, unknown> }> = [];
const fakeDb: any = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [{ id: 4, content: "note", structuredData: null }],
      }),
    }),
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => {
      captured.push({ set: values });
      return { where: async () => undefined };
    },
  }),
};

const dialect = new PgDialect();

beforeEach(() => captured.length = 0);

describe("upsertVector JSONB merge SQL", () => {
  it("renders the quoted camelCase column so Postgres can resolve it", async () => {
    await upsertVector(4, [0.1, 0.2], 9);
    expect(captured).toHaveLength(1);
    const fragment = captured[0].set.structuredData as any;
    const rendered = dialect.sqlToQuery(fragment);
    expect(rendered.sql).toContain('"structuredData"');
    expect(rendered.sql).not.toMatch(/\bstructured_data\b/);
    // the embedding payload is a bound parameter, not interpolated SQL text
    expect(rendered.params.some((p: string) => typeof p === "string" && p.includes("embedding"))).toBe(true);
  });

  it("targets the same memory row it read", async () => {
    await upsertVector(4, [0.1], 9);
    expect(captured).toHaveLength(1);
  });
});
