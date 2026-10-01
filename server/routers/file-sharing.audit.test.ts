import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TrpcContext } from "../_core/context";

const dbh = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
vi.mock("../db", () => dbh);

import { fileSharingRouter } from "./file-sharing";

type CapturedCall = { kind: string; where?: unknown; values?: Record<string, unknown>; set?: Record<string, unknown> };

function makeFakeDb() {
  const captured: CapturedCall[] = [];
  const state = { results: [] as unknown[][], rows: [] as unknown[] };
  function chain(kind: string): any {
    const api: any = {
      from: () => api,
      where: (c?: unknown) => {
        captured.push({ kind, where: c });
        return api;
      },
      limit: () => api,
      orderBy: () => api,
      values: (v: Record<string, unknown>) => {
        captured.push({ kind, values: v });
        return api;
      },
      set: (v: Record<string, unknown>) => {
        captured.push({ kind, set: v });
        return api;
      },
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
        const rows = kind === "select"
          ? (state.results.length > 0 ? state.results.shift() : state.rows)
          : state.rows;
        return Promise.resolve(rows ?? []).then(onF, onR);
      },
    };
    return api;
  }
  return {
    captured,
    state,
    select: () => chain("select"),
    update: () => chain("update"),
    insert: () => chain("insert"),
    delete: () => chain("delete"),
  };
}

let fake: ReturnType<typeof makeFakeDb>;
const dialect = new PgDialect();

function ctxFor(userId: number | null): TrpcContext {
  return {
    user:
      userId === null
        ? null
        : ({
            id: userId,
            openId: `u${userId}`,
            role: "user",
            name: null,
            email: null,
            loginMethod: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
          } as unknown as NonNullable<TrpcContext["user"]>),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const caller = (userId: number | null) => fileSharingRouter.createCaller(ctxFor(userId));

const FILE_ROW = {
  id: 3,
  userId: 1,
  name: "report.pdf",
  mimeType: "application/pdf",
  fileUrl: "https://files.example/report.pdf",
  fileKey: "k",
  trashed: false,
  spaceId: null,
};

function shareRow(over: Record<string, unknown> = {}) {
  return {
    id: "sh1",
    fileId: 3,
    identityId: 1,
    token: "tok123",
    passwordHash: null,
    expiresAt: null,
    maxAccessCount: null,
    accessCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

async function expectCode(fn: () => Promise<unknown>, code: TRPCError["code"]): Promise<TRPCError> {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(TRPCError);
    expect((e as TRPCError).code).toBe(code);
    return e as TRPCError;
  }
  throw new Error(`expected TRPCError ${code}, call succeeded`);
}

const savedAppUrl = process.env.APP_URL;

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeDb();
  dbh.getDb.mockResolvedValue(fake);
  process.env.APP_URL = "https://share.example";
});

afterEach(() => {
  if (savedAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = savedAppUrl;
});

describe("createShareLink (protected): file ownership first", () => {
  it("unauthenticated callers cannot create links", async () => {
    await expectCode(() => caller(null).createShareLink({ fileId: 3 }), "UNAUTHORIZED");
  });

  it("refuses files owned by someone else with FORBIDDEN", async () => {
    fake.state.results = [[{ ...FILE_ROW, userId: 2 }]];
    await expectCode(() => caller(1).createShareLink({ fileId: 3 }), "FORBIDDEN");
    expect(fake.captured.some((c) => c.kind === "insert")).toBe(false);
  });

  it("missing file gives NOT_FOUND", async () => {
    fake.state.results = [[]];
    await expectCode(() => caller(1).createShareLink({ fileId: 99 }), "NOT_FOUND");
  });

  it("stores the link under the caller and returns a token URL; never trusts a client identityId", async () => {
    fake.state.results = [[FILE_ROW]];
    fake.state.rows = [];
    const res = await caller(1).createShareLink({ fileId: 3, options: { expiresInHours: 24, maxAccessCount: 5 } });
    const insert = fake.captured.find((c) => c.kind === "insert");
    expect(insert!.values).toMatchObject({ fileId: 3, identityId: 1, accessCount: 0, maxAccessCount: 5 });
    expect(res.shareUrl).toBe(`https://share.example/share/${res.token}`);
    expect(res.token).toHaveLength(43); // base64url of 32 bytes, fits varchar(64)
    const expiresAt = (insert!.values as { expiresAt: number }).expiresAt;
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 24 * 3600 * 1000 + 5000);
  });

  it("rejects fractional and negative file ids with BAD_REQUEST", async () => {
    await expectCode(() => caller(1).createShareLink({ fileId: 2.5 }), "BAD_REQUEST");
    await expectCode(() => caller(1).createShareLink({ fileId: -7 }), "BAD_REQUEST");
  });

  it("password hashing is stored, the plaintext is not", async () => {
    fake.state.results = [[FILE_ROW]];
    const res = await caller(1).createShareLink({ fileId: 3, options: { password: "hunter2x" } });
    const insert = fake.captured.find((c) => c.kind === "insert");
    const values = insert!.values as Record<string, string>;
    expect(values.passwordHash).toHaveLength(64);
    expect(values.passwordHash).not.toContain("hunter2x");
    expect(res.hasPassword).toBe(true);
  });
});

describe("revoke / list (protected): scoping by the creator, not the file", () => {
  it("revoke refuses another user's share and deletes nothing", async () => {
    fake.state.results = [[shareRow({ identityId: 2 })]];
    await expectCode(() => caller(1).revokeShareLink({ shareId: "sh1" }), "FORBIDDEN");
    expect(fake.captured.some((c) => c.kind === "delete")).toBe(false);
  });

  it("revoke of an owned share deletes by id", async () => {
    fake.state.results = [[shareRow()]];
    await caller(1).revokeShareLink({ shareId: "sh1" });
    expect(fake.captured.some((c) => c.kind === "delete")).toBe(true);
  });

  it("listShareLinks hides shares created by other users even on the same file", async () => {
    fake.state.rows = [shareRow({ id: "mine" }), shareRow({ id: "theirs", identityId: 2 })];
    fake.state.results = [];
    const result = await caller(1).listShareLinks({ fileId: 3 });
    expect(result.map((s) => s.id)).toEqual(["mine"]);
  });

  it("listShareLinks flags expired and exhausted links", async () => {
    fake.state.rows = [
      shareRow({ id: "exp", expiresAt: Date.now() - 1000 }),
      shareRow({ id: "full", maxAccessCount: 2, accessCount: 2 }),
    ];
    const result = await caller(1).listShareLinks({ fileId: 3 });
    const exp = result.find((s) => s.id === "exp");
    const full = result.find((s) => s.id === "full");
    expect(exp!.isExpired).toBe(true);
    expect(full!.isExhausted).toBe(true);
  });
});

describe("getSharedFile (public): authorized by the share token only", () => {
  it("works without any session and never reads a client-supplied userId", async () => {
    fake.state.results = [[shareRow()], [FILE_ROW]];
    // extra unknown keys are stripped by zod; authorization comes only from the token
    const result = await caller(null).getSharedFile({ token: "tok123", userId: 999 } as never);
    expect(result.file.url).toBe(FILE_ROW.fileUrl);
    const shareLookup = fake.captured.find((c) => c.kind === "select");
    const rendered = dialect.sqlToQuery(shareLookup!.where as never);
    expect(rendered.sql).toContain('"file_shares"."token"');
    expect(rendered.params).toEqual(["tok123"]);
  });

  it("unknown token -> NOT_FOUND", async () => {
    fake.state.results = [[]];
    await expectCode(() => caller(null).getSharedFile({ token: "nope" }), "NOT_FOUND");
  });

  it("expired token -> NOT_FOUND, exhausted token -> NOT_FOUND", async () => {
    fake.state.results = [[shareRow({ expiresAt: Date.now() - 1 })]];
    await expectCode(() => caller(null).getSharedFile({ token: "tok123" }), "NOT_FOUND");
    fake.state.results = [[shareRow({ maxAccessCount: 1, accessCount: 1 })]];
    await expectCode(() => caller(null).getSharedFile({ token: "tok123" }), "NOT_FOUND");
  });

  it("password-protected share requires the right password", async () => {
    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update("hunter2x").digest("hex");
    fake.state.results = [[shareRow({ passwordHash: hash })]];
    await expectCode(() => caller(null).getSharedFile({ token: "tok123" }), "UNAUTHORIZED");
    fake.state.results = [[shareRow({ passwordHash: hash })]];
    await expectCode(() => caller(null).getSharedFile({ token: "tok123", password: "wrongpw" }), "UNAUTHORIZED");
    fake.state.results = [[shareRow({ passwordHash: hash })], [FILE_ROW]];
    const ok = await caller(null).getSharedFile({ token: "tok123", password: "hunter2x" });
    expect(ok.file.name).toBe("report.pdf");
  });

  it("access counter increments atomically with a quoted camelCase column", async () => {
    fake.state.results = [[shareRow()], [FILE_ROW]];
    await caller(null).getSharedFile({ token: "tok123" });
    const upd = fake.captured.find((c) => c.kind === "update");
    const setSql = dialect.sqlToQuery((upd!.set as Record<string, never>).accessCount as never);
    expect(setSql.sql).toContain('"file_shares"."accessCount" + 1');
    expect(setSql.sql).not.toMatch(/access_count/);
  });

  it("cannot enumerate other files: the file fetched is the one bound to the share", async () => {
    fake.state.results = [[shareRow({ fileId: 42 })], [{ ...FILE_ROW, id: 42 }]];
    const result = await caller(null).getSharedFile({ token: "tok123" });
    const fileQuery = fake.captured.filter((c) => c.kind === "select")[1];
    const rendered = dialect.sqlToQuery(fileQuery.where as never);
    expect(rendered.params).toEqual([42]);
    expect(result.file.id).toBe(42);
  });
});
