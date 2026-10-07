/**
 * T-84: what the admin user-account helpers in server/db.ts actually send to Postgres.
 *
 * "drizzle-orm/node-postgres" is mocked, so there is no connection and no database: the fake records
 * every insert/update/select a helper builds, and the recorded SQL fragments are rendered with
 * PgDialect. That is enough to prove the parts that matter offline — the list query selects a fixed
 * column set and never the password hash or the TOTP secret, a password write puts the new hash and
 * the must-change flag in a single UPDATE, and the last-admin count only counts live admins.
 */
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dialect = new PgDialect();

interface InsertCall {
  tableName: string;
  values: any;
}

interface SelectCall {
  config: Record<string, unknown>;
  where: unknown;
  orderBy: unknown[];
  limit: number | undefined;
}

interface UpdateCall {
  tableName: string;
  set: any;
  where: unknown;
}

const state: {
  inserts: InsertCall[];
  selects: SelectCall[];
  updates: UpdateCall[];
  rows: any[];
} = { inserts: [], selects: [], updates: [], rows: [] };

function tableNameOf(table: any): string {
  return table?.[Symbol.for("drizzle:Name")] ?? "unknown";
}

function selectChain(entry: SelectCall): any {
  const chain: any = {
    from: () => chain,
    where: (pred: unknown) => {
      entry.where = pred;
      return chain;
    },
    orderBy: (...order: unknown[]) => {
      entry.orderBy = order;
      return chain;
    },
    limit: (n: number) => {
      entry.limit = n;
      return chain;
    },
    then: (resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(state.rows).then(resolve, reject),
  };
  return chain;
}

function updateChain(table: any, entry: UpdateCall): any {
  const chain: any = {
    set: (values: any) => {
      entry.set = values;
      return chain;
    },
    where: (pred: unknown) => {
      entry.where = pred;
      return chain;
    },
    returning: async () => state.rows,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve, reject),
  };
  return chain;
}

function makeFakeDb(): any {
  return {
    insert: (table: any) => ({
      values: (values: any) => {
        const entry: InsertCall = { tableName: tableNameOf(table), values };
        state.inserts.push(entry);
        const chain: any = {
          returning: async () => state.rows,
          then: (resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(state.rows).then(resolve, reject),
        };
        return chain;
      },
    }),
    select: (config: Record<string, unknown>) => {
      const entry: SelectCall = { config: config ?? {}, where: undefined, orderBy: [], limit: undefined };
      state.selects.push(entry);
      return selectChain(entry);
    },
    update: (table: any) => {
      const entry: UpdateCall = { tableName: tableNameOf(table), set: undefined, where: undefined };
      state.updates.push(entry);
      return updateChain(table, entry);
    },
  };
}

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => makeFakeDb(),
}));

const savedDbUrl = process.env.DATABASE_URL;

beforeEach(() => {
  vi.resetModules();
  state.inserts = [];
  state.selects = [];
  state.updates = [];
  state.rows = [];
  process.env.DATABASE_URL = "postgres://fake:fake@127.0.0.1:5432/fake";
});

const restore = () => {
  if (savedDbUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDbUrl;
};

/** Column names a select config picks, as they appear in the generated SQL. */
function selectedColumns(config: Record<string, unknown>): string[] {
  const rendered = dialect.sqlToQuery(
    sql.join(Object.values(config) as SQL[], sql`, `) as any,
  ).sql;
  return rendered.split(",").map((part) => part.trim().replace(/^"users"\."/, "").replace(/"$/, ""));
}

function renderWhere(pred: unknown): string {
  return dialect.sqlToQuery(pred as SQL).sql;
}

describe("createManagedUser", () => {
  it("inserts one users row carrying the managed-account fields", async () => {
    const db = await import("./db");
    state.rows = [{ id: 42 }];
    const row = await db.createManagedUser({
      openId: "local:abc123",
      email: "newcomer@example.com",
      name: "New Comerson",
      passwordHash: "$2b$12$theHash",
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].tableName).toBe("users");
    expect(state.inserts[0].values).toMatchObject({
      openId: "local:abc123",
      email: "newcomer@example.com",
      name: "New Comerson",
      loginMethod: "local",
      role: "user",
      passwordHash: "$2b$12$theHash",
      mustChangePassword: true,
    });
    expect(row).toEqual({ id: 42 });
    restore();
  });

  it("stamps createdAt/updatedAt/lastSignedIn with real dates", async () => {
    const db = await import("./db");
    await db.createManagedUser({
      openId: "local:x",
      email: "a@b.example",
      name: null,
      passwordHash: "$2b$12$theHash",
    });
    const values = state.inserts[0].values;
    expect(values.createdAt).toBeInstanceOf(Date);
    expect(values.updatedAt).toBeInstanceOf(Date);
    expect(values.lastSignedIn).toBeInstanceOf(Date);
    expect(values.name).toBeNull();
    restore();
  });
});

describe("listManagedUsers", () => {
  it("selects exactly the admin-visible columns and no secret", async () => {
    const db = await import("./db");
    state.rows = [{ id: 1 }];
    const rows = await db.listManagedUsers();

    expect(state.selects).toHaveLength(1);
    expect(selectedColumns(state.selects[0].config).sort()).toEqual(
      [
        "createdAt",
        "disabledAt",
        "email",
        "id",
        "lastSignedIn",
        "mustChangePassword",
        "name",
        "role",
      ].sort(),
    );
    expect(rows).toEqual([{ id: 1 }]);
    restore();
  });

  it("newest account first", async () => {
    const db = await import("./db");
    await db.listManagedUsers();
    expect(state.selects[0].orderBy).toHaveLength(1);
    expect(dialect.sqlToQuery(state.selects[0].orderBy[0] as SQL).sql).toBe('"users"."createdAt" desc');
    restore();
  });
});

describe("getUserByEmailIgnoreCase", () => {
  it("looks up by lowercased email and returns only the id", async () => {
    const db = await import("./db");
    state.rows = [{ id: 7 }];
    const hit = await db.getUserByEmailIgnoreCase("MixedCase@Example.COM");

    expect(state.selects).toHaveLength(1);
    expect(selectedColumns(state.selects[0].config)).toEqual(["id"]);
    expect(state.selects[0].limit).toBe(1);
    expect(renderWhere(state.selects[0].where)).toBe('lower("users"."email") = lower($1)');
    expect(hit).toEqual({ id: 7 });
    restore();
  });

  it("reports no existing account when the lookup comes back empty", async () => {
    const db = await import("./db");
    state.rows = [];
    expect(await db.getUserByEmailIgnoreCase("nobody@example.com")).toBeUndefined();
    restore();
  });
});

describe("updateUserPassword", () => {
  it("writes the new hash and the flag in one UPDATE", async () => {
    const db = await import("./db");
    await db.updateUserPassword(7, "$2b$12$fresh", false);

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].tableName).toBe("users");
    expect(state.updates[0].set).toMatchObject({
      passwordHash: "$2b$12$fresh",
      mustChangePassword: false,
    });
    expect(state.updates[0].set.mustChangePassword).toBe(false);
    expect(state.updates[0].set.updatedAt).toBeInstanceOf(Date);
    expect(renderWhere(state.updates[0].where)).toBe('"users"."id" = $1');
    restore();
  });

  it("can arm the flag again when an admin hands out a one-time password", async () => {
    const db = await import("./db");
    await db.updateUserPassword(8, "$2b$12$otp", true);
    expect(state.updates[0].set.mustChangePassword).toBe(true);
    restore();
  });
});

describe("setUserDisabledAt", () => {
  it("stamps the moment the account was switched off", async () => {
    const db = await import("./db");
    const when = new Date("2026-03-01T10:00:00.000Z");
    await db.setUserDisabledAt(9, when);

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].set.disabledAt).toBe(when);
    expect(renderWhere(state.updates[0].where)).toBe('"users"."id" = $1');
    restore();
  });

  it("clears the stamp back to null so the account can sign in again", async () => {
    const db = await import("./db");
    await db.setUserDisabledAt(9, null);
    expect(state.updates[0].set.disabledAt).toBeNull();
    expect(state.updates[0].set.updatedAt).toBeInstanceOf(Date);
    restore();
  });
});

describe("countActiveAdmins", () => {
  it("counts only admins that are not switched off", async () => {
    const db = await import("./db");
    state.rows = [{ count: "3" }];
    const count = await db.countActiveAdmins();

    expect(state.selects).toHaveLength(1);
    expect(Object.keys(state.selects[0].config)).toEqual(["count"]);
    expect(dialect.sqlToQuery(state.selects[0].config.count as SQL).sql).toBe("count(*)");
    expect(renderWhere(state.selects[0].where)).toBe(
      '("users"."role" = $1 and "users"."disabledAt" is null)',
    );
    expect(count).toBe(3);
    restore();
  });

  it("reads a missing count row as zero rather than NaN", async () => {
    const db = await import("./db");
    state.rows = [];
    expect(await db.countActiveAdmins()).toBe(0);
    restore();
  });
});
