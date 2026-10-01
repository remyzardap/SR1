/**
 * Batch 2 audit test, item 2: createTask / createReceipt / createProcurement in
 * server/db.ts must return the row they inserted, not the globally newest row
 * ordered by createdAt. With concurrent writers (or any other user's recent row),
 * the old select-the-newest pattern handed one tenant another tenant's row.
 * "drizzle-orm/node-postgres" is mocked: no pg pool, no network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeState {
  inserts: Array<{ table: string; data: unknown }>;
  newestRow: any;
}

const state: FakeState = { inserts: [], newestRow: { id: 999, title: "someone else's newest row" } };

function makeFakeDb(): any {
  return {
    insert: (table: any) => {
      const tableName = table?.[Symbol.for("drizzle:Name")] ?? "unknown";
      return {
        values: (data: unknown) => {
          state.inserts.push({ table: tableName, data });
          const inserted = { id: 42, ...(data as object) };
          const builder: any = {
            // the old code awaited values() directly; make it thenable
            then: (res: (v: unknown) => void) => res(undefined),
            returning: async () => [inserted],
          };
          return builder;
        },
      };
    },
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: async () => [state.newestRow],
        }),
      }),
    }),
  };
}

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => makeFakeDb(),
}));

const savedDbUrl = process.env.DATABASE_URL;

beforeEach(() => {
  vi.resetModules();
  state.inserts = [];
  process.env.DATABASE_URL = "postgres://fake:fake@127.0.0.1:5432/fake";
});

const restore = () => {
  if (savedDbUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDbUrl;
};

describe("create* helpers return the inserted row", () => {
  it("createTask returns its own insert, not the newest row in the table", async () => {
    const db = await import("./db");
    const row = await db.createTask({ title: "mine", ownerId: 7 } as any);
    expect(state.inserts).toHaveLength(1);
    expect(row).toMatchObject({ id: 42, title: "mine", ownerId: 7 });
    expect(row?.id).not.toBe(999);
    restore();
  });

  it("createReceipt returns its own insert, not the newest row in the table", async () => {
    const db = await import("./db");
    const row = await db.createReceipt({ vendor: "acme", total: 10 } as any);
    expect(row).toMatchObject({ id: 42, vendor: "acme" });
    expect(row?.id).not.toBe(999);
    restore();
  });

  it("createProcurement returns its own insert, not the newest row in the table", async () => {
    const db = await import("./db");
    const row = await db.createProcurement({ item: "laptop", requestedBy: 3 } as any);
    expect(row).toMatchObject({ id: 42, item: "laptop" });
    expect(row?.id).not.toBe(999);
    restore();
  });
});
