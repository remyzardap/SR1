// Audit tests for server/routes/export.ts (thread md/pdf export and the
// full-account zip). archiver and db are mocked; threadExport + fileGenerator
// run for real (local only). Verifies auth on every route, input validation,
// response content types, header safety, and the zip manifest's skip list.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    authThrows: true,
    user: { id: 1 } as any,
    session: null as any,
    messages: [] as any[],
    sessions: [] as any[],
    files: [] as any[],
    adapterGetThrowsKeys: new Set<string>(),
    archiverInstances: [] as any[],
  };
  return { state };
});

vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => {
      if (h.state.authThrows) throw new Error("no session");
      return h.state.user;
    }),
  },
}));

vi.mock("../db", () => ({
  getChatSessionForUser: vi.fn(async () => h.state.session),
  getChatSessionMessages: vi.fn(async () => h.state.messages),
  listChatSessions: vi.fn(async () => h.state.sessions),
  getFilesByUser: vi.fn(async () => h.state.files),
}));

vi.mock("../storageAdapter", () => ({
  getStorageAdapter: () => ({
    get: vi.fn(async (key: string) => {
      if (h.state.adapterGetThrowsKeys.has(key)) throw new Error("ENOENT " + key);
      return Buffer.from("bytes-of-" + key);
    }),
    put: vi.fn(),
    getUrl: vi.fn(),
  }),
}));

vi.mock("archiver", () => ({
  default: (format: string) => {
    const instance = {
      format,
      entries: [] as { name: string; data: any }[],
      on: vi.fn(),
      pipe: vi.fn(),
      append: vi.fn((data: any, meta: { name: string }) => {
        instance.entries.push({ name: meta.name, data });
      }),
      finalize: vi.fn(async () => undefined),
    };
    h.state.archiverInstances.push(instance);
    return instance;
  },
}));

import { registerExportRoutes } from "./export";

const routes: Record<string, any[]> = {};
const app: any = { get: (p: string, ...hs: any[]) => (routes[p] = hs) };
registerExportRoutes(app);

function fakeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined as any,
    headers: {} as Record<string, string>,
    status(c: number) { res.statusCode = c; return res; },
    json(o: any) { res.body = o; return res; },
    setHeader(k: string, v: string) { res.headers[k] = v; },
    send(b: any) { res.body = b; return res; },
    destroy() {},
  };
  return res;
}

async function runThread(sessionId: string, query: any) {
  const handlers = routes["/api/export/thread/:sessionId"];
  const req: any = { params: { sessionId }, query, headers: {} };
  const res = fakeRes();
  const next = vi.fn();
  await handlers[0](req, res, next);
  if (!next.mock.calls.length) return res;
  req.user = h.state.user;
  await handlers[1](req, res, next);
  return res;
}

async function runAll() {
  const handlers = routes["/api/export/all"];
  const req: any = { params: {}, query: {}, headers: {} };
  const res = fakeRes();
  const next = vi.fn();
  await handlers[0](req, res, next);
  if (!next.mock.calls.length) return res;
  req.user = h.state.user;
  await handlers[1](req, res, next);
  return res;
}

const SID = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  h.state.authThrows = true;
  h.state.session = null;
  h.state.messages = [];
  h.state.sessions = [];
  h.state.files = [];
  h.state.adapterGetThrowsKeys = new Set();
  h.state.archiverInstances = [];
});

describe("GET /api/export/thread/:sessionId", () => {
  it("401 without a session", async () => {
    const res = await runThread(SID, { format: "md" });
    expect(res.statusCode).toBe(401);
  });

  it("400 for a non-uuid sessionId", async () => {
    h.state.authThrows = false;
    const res = await runThread("../../etc/passwd", { format: "md" });
    expect(res.statusCode).toBe(400);
  });

  it("400 for a missing or unsupported format", async () => {
    h.state.authThrows = false;
    expect((await runThread(SID, {})).statusCode).toBe(400);
    expect((await runThread(SID, { format: "docx" })).statusCode).toBe(400);
    expect((await runThread(SID, { format: "pdf" })).statusCode).not.toBe(400);
  });

  it("404 when the session does not belong to the caller", async () => {
    h.state.authThrows = false;
    h.state.session = null;
    const res = await runThread(SID, { format: "md" });
    expect(res.statusCode).toBe(404);
  });

  it("db failure while loading the session answers 500 instead of hanging", async () => {
    h.state.authThrows = false;
    const db: any = await import("../db");
    db.getChatSessionForUser.mockRejectedValueOnce(new Error("db exploded"));
    const res = await runThread(SID, { format: "md" });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Export failed" });
  });

  it("markdown export: correct content type and body", async () => {
    h.state.authThrows = false;
    h.state.session = { id: SID, title: "Project notes" };
    h.state.messages = [
      { role: "user", content: "hi", model: null, createdAt: new Date("2026-01-01T00:00:00Z") },
      { role: "assistant", content: "hello", model: "qwen3.8-max", createdAt: new Date("2026-01-01T00:00:05Z") },
    ];
    const res = await runThread(SID, { format: "md" });
    expect(res.headers["Content-Type"]).toBe("text/markdown");
    expect(res.headers["Content-Disposition"]).toContain('filename="Project notes-' + SID.slice(0, 8) + '.md"');
    expect(res.body.toString()).toContain("# Project notes");
    expect(res.body.toString()).toContain("hello");
  });

  it("pdf export: real PDF bytes with the right content type", async () => {
    h.state.authThrows = false;
    h.state.session = { id: SID, title: "Board deck" };
    h.state.messages = [{ role: "user", content: "plan", model: null, createdAt: new Date() }];
    const res = await runThread(SID, { format: "pdf" });
    expect(res.headers["Content-Type"]).toBe("application/pdf");
    expect(res.headers["Content-Disposition"]).toContain(".pdf\"");
    // B1 regression guard: the response must be bytes, not a URL string
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("session titles cannot inject characters into Content-Disposition", async () => {
    h.state.authThrows = false;
    h.state.session = { id: SID, title: 'x"\r\nSet-Cookie: session=stolen' };
    h.state.messages = [];
    const res = await runThread(SID, { format: "md" });
    const disp = res.headers["Content-Disposition"];
    expect(disp).not.toContain("\r");
    expect(disp).not.toContain("\n");
    expect(disp.split('"').length - 1).toBe(2); // only the wrapping quotes
  });
});

describe("GET /api/export/all", () => {
  it("401 without a session", async () => {
    const res = await runAll();
    expect(res.statusCode).toBe(401);
  });

  it("db failure loading sessions/files answers 500 before any zip bytes", async () => {
    h.state.authThrows = false;
    const db: any = await import("../db");
    db.listChatSessions.mockRejectedValueOnce(new Error("db exploded"));
    const res = await runAll();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Export failed" });
    // no archive was created or piped: the client never gets a half-open zip
    expect(h.state.archiverInstances).toHaveLength(0);
  });

  it("zips chats and owned files, skips unreadable bytes, excludes trashed", async () => {
    h.state.authThrows = false;
    h.state.sessions = [{ id: SID, title: "Chat A" }];
    h.state.messages = [{ role: "user", content: "a", model: null, createdAt: new Date() }];
    h.state.files = [
      { id: 10, name: "one.md", fileKey: "users/1/files/one.md", fileUrl: "/files/users/1/files/one.md", trashed: false },
      { id: 11, name: "one.md", fileKey: "users/1/files/two.md", fileUrl: "/files/users/1/files/two.md", trashed: false },
      { id: 12, name: "gone.md", fileKey: "users/1/files/gone.md", fileUrl: "/files/users/1/files/gone.md", trashed: true },
      { id: 13, name: "remote.pdf", fileKey: "ext/13", fileUrl: "https://forge.example/13", trashed: false },
    ];
    h.state.adapterGetThrowsKeys.add("ext/13");
    const res = await runAll();
    expect(res.headers["Content-Type"]).toBe("application/zip");
    expect(res.headers["Content-Disposition"]).toBe('attachment; filename="sutaeru-export-1.zip"');
    const archive = h.state.archiverInstances[0];
    const names = archive.entries.map((e: any) => e.name);
    expect(names).toContain(`chats/Chat A-${SID.slice(0, 8)}.md`);
    expect(names).toContain("files/one.md");
    expect(names).toContain("files/one.md-11"); // collision suffix
    expect(names.some((n: string) => n.includes("gone.md"))).toBe(false);
    const manifest = JSON.parse(archive.entries.find((e: any) => e.name === "manifest.json").data);
    expect(manifest.files.map((f: any) => f.id)).toEqual([10, 11]);
    expect(manifest.skipped).toEqual([
      { id: 13, name: "remote.pdf", reason: "could not read file bytes (may be externally stored)", fileUrl: "https://forge.example/13" },
    ]);
    expect(archive.finalize).toHaveBeenCalled();
    // the zip only ever contains this user's rows
    expect(manifest.sessions).toHaveLength(1);
  });

  it("unsafe characters in stored file names are scrubbed from archive paths", async () => {
    h.state.authThrows = false;
    h.state.files = [{ id: 20, name: '../evil:*.md', fileKey: "users/1/files/e.md", fileUrl: "/files/u", trashed: false }];
    await runAll();
    const names = h.state.archiverInstances[0].entries.map((e: any) => e.name);
    // all "/" and ":" and "*" are stripped from the stored name, so the entry
    // is a single path element under files/ (the leading ".." survives as
    // literal dots but cannot traverse: no separators remain)
    expect(names).toContain("files/..evil.md");
    expect(names.some((n: string) => n.startsWith("files/") && n.split("/").length === 2)).toBe(true);
    expect(names).not.toContain("files/../evil.md");
  });
});
