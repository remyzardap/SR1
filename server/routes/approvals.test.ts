/**
 * Tests for the approvals list endpoint (T-83).
 *
 * `GET /api/kemma/approvals?sessionId=<id>&status=pending` is what the chat
 * page calls after a reload to bring back the cards for a run that is still
 * waiting on a human. The three things that matter here are ownership (never
 * another user's rows, not even as a filter someone can forget), the shape
 * (identical to the `approval_request` SSE payload, or a restored card renders
 * differently from a live one), and staleness (no decided row, no expired row).
 *
 * The db mock is deliberately stricter than the one in the gate tests: it
 * evaluates the where clause instead of ignoring it, so a route that dropped
 * the userId filter would fail here rather than pass on luck.
 *
 * @see docs/spec/FRONTEND.md "Restoring pending approvals after a reload"
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

// --- Fake drizzle operators -------------------------------------------------
// Conditions become small descriptors so the mock can evaluate them against
// the in-memory rows. Columns are matched on their JS key (`userId`), which is
// what the route passes to eq().
type FakeCondition =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "gt"; column: string; value: unknown }
  | { kind: "and"; parts: FakeCondition[] };

type FakeOrder = { kind: "asc"; column: string };

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  // Columns are matched by their JS property name (`userId`) even though this
  // drizzle version only exposes the SQL name (`user_id`) at runtime.
  const jsName = (column: { key?: string; name?: string }): string => {
    const raw = column.key ?? column.name ?? "";
    return raw.replace(/_([a-z])/g, (_match, letter: string) =>
      letter.toUpperCase(),
    );
  };
  return {
    ...actual,
    eq: (
      column: { key?: string; name?: string },
      value: unknown,
    ): FakeCondition => ({
      kind: "eq",
      column: jsName(column),
      value,
    }),
    gt: (
      column: { key?: string; name?: string },
      value: unknown,
    ): FakeCondition => ({
      kind: "gt",
      column: jsName(column),
      value,
    }),
    and: (...parts: FakeCondition[]): FakeCondition => ({ kind: "and", parts }),
    asc: (column: { key?: string; name?: string }): FakeOrder => ({
      kind: "asc",
      column: jsName(column),
    }),
  };
});

// --- Fake database ----------------------------------------------------------
interface StoredApproval {
  id: string;
  userId: number;
  sessionId: string | null;
  runId: string;
  tool: string;
  risk: string;
  args: unknown;
  argsHash: string;
  targetRef: string | null;
  targetRevision: string | null;
  preview: unknown;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  decidedArgs?: unknown;
  decidedAt?: Date | null;
  executedAt?: Date | null;
  result?: unknown;
}

const store = new Map<string, StoredApproval>();

/** What the route actually built, so filters can be checked at the SQL level
 * as well as through the response body. */
let seenWhere: FakeCondition[] = [];
let seenOrder: FakeOrder[] = [];

function flatten(condition: FakeCondition | undefined): FakeCondition[] {
  if (!condition) return [];
  if (condition.kind === "and") return condition.parts.flatMap(flatten);
  return [condition];
}

function matches(row: StoredApproval, condition: FakeCondition): boolean {
  if (condition.kind === "and") {
    return condition.parts.every((part) => matches(row, part));
  }
  const actual = (row as Record<string, unknown>)[condition.column];
  if (condition.kind === "gt") {
    return (
      new Date(actual as string | number | Date).getTime() >
      Number(condition.value)
    );
  }
  return actual === condition.value;
}

function chainable(where: FakeCondition, order?: FakeOrder) {
  const rows = () => {
    const found = [...store.values()].filter((row) => matches(row, where));
    if (order?.kind === "asc") {
      found.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    return found;
  };
  const thenable = {
    then: (
      onFulfilled?: (value: StoredApproval[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows()).then(onFulfilled, onRejected),
  };
  return Object.assign(thenable, {
    orderBy: (next: FakeOrder) => {
      seenOrder.push(next);
      return chainable(where, next);
    },
  });
}

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: (condition: FakeCondition) => {
          seenWhere.push(condition);
          return chainable(condition);
        },
      }),
    }),
  })),
}));

import { approvalsRouter } from "./approvals";

const FUTURE = new Date(Date.now() + 10 * 60 * 1000);
const PAST = new Date(Date.now() - 10 * 60 * 1000);

function seedRow(
  overrides: Partial<StoredApproval> & { id: string },
): StoredApproval {
  const row: StoredApproval = {
    userId: 42,
    sessionId: "sess-1",
    runId: "run-1",
    tool: "email_send",
    risk: "write",
    args: { to: "ada@example.com", subject: "Hello" },
    argsHash: "hash",
    targetRef: null,
    targetRevision: null,
    preview: { title: "Send an email", to: "ada@example.com" },
    status: "pending",
    expiresAt: FUTURE,
    createdAt: new Date("2026-10-07T03:00:00.000Z"),
    ...overrides,
  };
  store.set(row.id, row);
  return row;
}

function ids(body: { approvals: { id: string }[] }): string[] {
  return body.approvals.map((card) => card.id);
}

describe("GET /api/kemma/approvals", () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  let currentAuthUser: { id: number; name: string } | null = {
    id: 42,
    name: "Alice",
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    // Stands in for requireSession, the way the gate tests do.
    app.use((req, _res, next) => {
      (req as any).user = currentAuthUser;
      next();
    });
    app.use("/api/kemma/approvals", approvalsRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}/api/kemma/approvals`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    store.clear();
    seenWhere = [];
    seenOrder = [];
    currentAuthUser = { id: 42, name: "Alice" };
  });

  async function list(query = "sessionId=sess-1&status=pending") {
    const res = await fetch(`${baseUrl}?${query}`);
    return { res, body: await res.json() };
  }

  it("returns the caller's own pending approvals for that session, oldest first", async () => {
    seedRow({ id: "own-new", createdAt: new Date("2026-10-07T03:05:00.000Z") });
    seedRow({ id: "own-old", createdAt: new Date("2026-10-07T03:01:00.000Z") });

    const { res, body } = await list();
    expect(res.status).toBe(200);
    expect(ids(body)).toEqual(["own-old", "own-new"]);
    expect(seenOrder).toContainEqual({ kind: "asc", column: "createdAt" });
  });

  it("never returns another user's approval, even in the same session", async () => {
    seedRow({ id: "own-1" });
    seedRow({ id: "other-1", userId: 7 });

    const { res, body } = await list();
    expect(res.status).toBe(200);
    expect(ids(body)).toEqual(["own-1"]);
    expect(flatten(seenWhere[0])).toContainEqual({
      kind: "eq",
      column: "userId",
      value: 42,
    });
  });

  it("drops rows whose deadline has passed", async () => {
    seedRow({ id: "live" });
    seedRow({ id: "stale", expiresAt: PAST });

    const { body } = await list();
    expect(ids(body)).toEqual(["live"]);
    expect(flatten(seenWhere[0])).toContainEqual({
      kind: "gt",
      column: "expiresAt",
      value: expect.any(Date),
    });
  });

  it("drops rows that already have a decision", async () => {
    seedRow({ id: "pending" });
    seedRow({ id: "approved", status: "approved" });
    seedRow({ id: "rejected", status: "rejected" });
    seedRow({ id: "expired", status: "expired" });
    seedRow({ id: "cancelled", status: "cancelled" });

    const { body } = await list();
    expect(ids(body)).toEqual(["pending"]);
  });

  it("only returns rows for the session asked about", async () => {
    seedRow({ id: "here" });
    seedRow({ id: "elsewhere", sessionId: "sess-2" });
    seedRow({ id: "orphan", sessionId: null });

    const { body } = await list();
    expect(ids(body)).toEqual(["here"]);
  });

  it("returns exactly the approval_request fields, re-deriving title from the preview", async () => {
    seedRow({ id: "card-1" });
    seedRow({ id: "card-2", preview: null });
    seedRow({ id: "card-3", preview: "Free/busy 09:00-10:00" });
    seedRow({
      id: "card-4",
      tool: "shell_run",
      preview: { title: "Run a command", command: "ls" },
      decidedArgs: { secret: "edited later" },
      result: { stdout: "leak me" },
    });

    const { res, body } = await list();
    expect(res.status).toBe(200);
    expect(ids(body)).toEqual(["card-1", "card-2", "card-3", "card-4"]);
    expect(body.approvals[0]).toEqual({
      id: "card-1",
      tool: "email_send",
      title: "Send an email",
      preview: JSON.stringify({
        title: "Send an email",
        to: "ada@example.com",
      }),
      args: { to: "ada@example.com", subject: "Hello" },
      expiresAt: FUTURE.toISOString(),
    });
    expect(body.approvals[1]).toEqual({
      id: "card-2",
      tool: "email_send",
      title: "Approve email_send",
      preview: "",
      args: { to: "ada@example.com", subject: "Hello" },
      expiresAt: FUTURE.toISOString(),
    });
    expect(body.approvals[2].preview).toBe("Free/busy 09:00-10:00");
    expect(body.approvals[2].title).toBe("Approve email_send");
    expect(body.approvals[3].title).toBe("Run a command");

    // Six fields and nothing else: decided args, results, hashes and target
    // refs stay on the server.
    for (const card of body.approvals) {
      expect(Object.keys(card).sort()).toEqual([
        "args",
        "expiresAt",
        "id",
        "preview",
        "title",
        "tool",
      ]);
    }
    expect(JSON.stringify(body)).not.toContain("leak me");
    expect(JSON.stringify(body)).not.toContain("edited later");
    expect(JSON.stringify(body)).not.toContain("argsHash");
  });

  it("requires a session to ask about", async () => {
    seedRow({ id: "own-1" });
    const { res, body } = await list("status=pending");
    expect(res.status).toBe(400);
    expect(body.error).toContain("sessionId");
    expect(body.approvals).toBeUndefined();
  });

  it("refuses statuses other than pending", async () => {
    seedRow({ id: "own-1" });
    seedRow({ id: "decided", status: "approved" });
    for (const status of ["all", "approved", "expired"]) {
      const { res, body } = await list(`sessionId=sess-1&status=${status}`);
      expect(res.status).toBe(400);
      expect(body.error).toBeTruthy();
      expect(body.approvals).toBeUndefined();
    }
  });

  it("answers 401 without a session", async () => {
    seedRow({ id: "own-1" });
    currentAuthUser = null;
    const res = await fetch(`${baseUrl}?sessionId=sess-1&status=pending`);
    expect(res.status).toBe(401);
    currentAuthUser = { id: 42, name: "Alice" };
  });
});
