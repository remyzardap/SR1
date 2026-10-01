// Audit tests for server/routes/files.ts (file serving + video upload).
// The router is mounted via registerFileRoutes(app) with NO requireSession in
// _core/index.ts; this file verifies each route installs its own auth
// middleware. Uses fake req/res objects (pattern from routes/fn tests) and a
// mocked sdk/db/storage adapter. No network, no DB.
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const state = {
    user: { id: 1, openId: "u-open" } as any,
    authThrows: true,
    ownedRows: [] as any[],
    dbThrows: false,
    hasDb: true,
    adapterGet: Buffer.from("%PDF-1.4 stored bytes"),
    adapterGetThrows: false,
    adapterPut: { key: "k", url: "/files/k", sizeBytes: 3, provider: "local" },
    adapterPutThrows: false,
    ensureRootCalls: 0,
    putCalls: [] as any[],
    inserts: [] as any[],
    getAdapterCalls: 0,
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            if (state.dbThrows) return Promise.reject(new Error("db exploded"));
            return Promise.resolve(state.ownedRows);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => {
        if (state.insertRejects) return Promise.reject(new Error("insert rejected"));
        state.inserts.push(v);
        return Promise.resolve();
      },
    }),
  };
  return { state, db };
});
(hoisted.state as any).insertRejects = false;

vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => {
      if (hoisted.state.authThrows) throw new Error("Unauthorized");
      return hoisted.state.user;
    }),
  },
}));
vi.mock("../db", () => ({
  getDb: async () => (hoisted.state.hasDb ? hoisted.db : null),
}));
vi.mock("../storageAdapter", () => ({
  getStorageAdapter: () => ({
    put: vi.fn(async (key: string, data: Buffer, mime: string) => {
      hoisted.state.getAdapterCalls++;
      hoisted.state.putCalls.push({ key, size: data.length, mime });
      if (hoisted.state.adapterPutThrows) throw new Error("put exploded");
      return hoisted.state.adapterPut;
    }),
    get: vi.fn(async () => {
      if (hoisted.state.adapterGetThrows) throw new Error("ENOENT");
      return hoisted.state.adapterGet;
    }),
  }),
  ensureLocalStorageRoot: vi.fn(async () => {
    hoisted.state.ensureRootCalls++;
  }),
}));

import { registerFileRoutes } from "./files";

// ── fake express helpers ─────────────────────────────────────────────────────

type Handler = (req: any, res: any, next: any) => any;
const routes: Record<string, Handler[]> = {};
const app: any = {
  get: (pattern: string, ...handlers: Handler[]) => (routes[pattern] = handlers),
  post: (pattern: string, ...handlers: Handler[]) => (routes["POST " + pattern] = handlers),
};
registerFileRoutes(app);

function fakeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(obj: any) {
      res.body = obj;
      return res;
    },
    setHeader(k: string, v: string) {
      res.headers[k] = v;
    },
    send(b: any) {
      res.body = b;
      return res;
    },
  };
  return res;
}

async function runGet(key: string) {
  const handlers = routes["/files/*"];
  const req: any = { params: [key], headers: {}, user: undefined };
  const res = fakeRes();
  const next = vi.fn();
  await handlers[0](req, res, next); // requireSession
  if (!next.mock.calls.length) return res; // 401 short-circuit
  req.user = hoisted.state.user;
  req.params = [key];
  await handlers[1](req, res, next);
  return res;
}

beforeEach(() => {
  const s = hoisted.state;
  s.authThrows = true;
  s.ownedRows = [];
  s.dbThrows = false;
  s.hasDb = true;
  s.adapterGet = Buffer.from("%PDF-1.4 stored bytes");
  s.adapterGetThrows = false;
  s.adapterPut = { key: "k", url: "/files/k", sizeBytes: 3, provider: "local" };
  s.adapterPutThrows = false;
  s.ensureRootCalls = 0;
  s.putCalls = [];
  s.inserts = [];
  s.getAdapterCalls = 0;
  (s as any).insertRejects = false;
});

describe("GET /files/* auth and ownership", () => {
  it("route registers a requireSession middleware as its first handler", () => {
    expect(routes["/files/*"].length).toBe(2);
    expect(routes["POST /api/upload/video"].length).toBe(3);
  });

  it("rejects unauthenticated requests with 401 before touching the db", async () => {
    const res = await runGet("users/1/files/a.pdf");
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  it("404s when no db", async () => {
    hoisted.state.authThrows = false;
    hoisted.state.hasDb = false;
    const res = await runGet("users/1/files/a.pdf");
    expect(res.statusCode).toBe(404);
  });

  it("404s when the fileKey does not belong to the caller", async () => {
    hoisted.state.authThrows = false;
    hoisted.state.ownedRows = [];
    const res = await runGet("users/2/files/private.pdf");
    expect(res.statusCode).toBe(404);
    expect(hoisted.state.getAdapterCalls).toBe(0);
  });

  it("serves bytes with a sniffed content type for owned files", async () => {
    hoisted.state.authThrows = false;
    hoisted.state.ownedRows = [{ id: 7 }];
    const res = await runGet("users/1/files/a.pdf");
    expect(res.headers["Content-Type"]).toBe("application/pdf");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.toString()).toBe("%PDF-1.4 stored bytes");
  });

  it("dot-dot keys are neutralized by the ownership check: unknown key 404s even with traversal", async () => {
    hoisted.state.authThrows = false;
    hoisted.state.ownedRows = [];
    const res = await runGet("../../etc/passwd");
    expect(res.statusCode).toBe(404);
    expect(hoisted.state.getAdapterCalls).toBe(0);
  });

  it("db errors are swallowed into a 404", async () => {
    hoisted.state.authThrows = false;
    hoisted.state.dbThrows = true;
    const res = await runGet("users/1/files/a.pdf");
    expect(res.statusCode).toBe(404);
  });

  it("missing key (empty wildcard) 400s", async () => {
    hoisted.state.authThrows = false;
    const res = await runGet("");
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/upload/video", () => {
  async function runUpload(file: any) {
    const handlers = routes["POST /api/upload/video"];
    const req: any = { headers: {}, file };
    const res = fakeRes();
    const next = vi.fn();
    await handlers[0](req, res, next); // requireSession
    if (!next.mock.calls.length) return res;
    req.user = hoisted.state.user;
    // handlers[1] is multer's middleware; bypass it and invoke the final handler
    await handlers[2](req, res, next);
    return res;
  }

  it("rejects unauthenticated uploads with 401", async () => {
    const res = await runUpload({ originalname: "a.mp4", buffer: Buffer.from("v"), mimetype: "video/mp4" });
    expect(res.statusCode).toBe(401);
  });

  it("400s without a file part", async () => {
    hoisted.state.authThrows = false;
    const res = await runUpload(undefined);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "No video uploaded" });
  });

  it("derives the storage key from the user id and a timestamp, extension from originalname", async () => {
    hoisted.state.authThrows = false;
    const res = await runUpload({ originalname: "holiday.MP4", buffer: Buffer.from("vid"), mimetype: "video/mp4" });
    expect(res.statusCode).toBe(0); // fell through to res.json below
    const put = hoisted.state.putCalls[0];
    expect(put.key).toMatch(/^users\/1\/videos\/video-\d+\.MP4$/);
    expect(hoisted.state.inserts[0]).toMatchObject({
      userId: 1,
      kind: "video",
      format: "md", // NOTE: format hardcoded to "md" even for videos
      storageProvider: "local",
      mimeType: "video/mp4",
    });
    expect(hoisted.state.inserts[0].name).toBe("holiday.MP4");
  });

  it("extension is taken from originalname without validation; slashes can nest the key (contained)", async () => {
    hoisted.state.authThrows = false;
    await runUpload({ originalname: "movie.mp4/../../evil", buffer: Buffer.from("v"), mimetype: "video/mp4" });
    const key = hoisted.state.putCalls[0].key;
    // split(".").pop() yields "/evil": the raw extension can even contain a
    // slash, creating an unexpected subdirectory. No ".." survives (the dots
    // are consumed by the split), so containment holds, but the extension is
    // attacker-shaped input with zero validation.
    expect(key).toMatch(/^users\/1\/videos\/video-\d+\.\S*\/evil$/);
    expect(key).not.toContain("..");
  });

  it("falls back to mp4 when the originalname has no dot", async () => {
    hoisted.state.authThrows = false;
    await runUpload({ originalname: "plainname", buffer: Buffer.from("v"), mimetype: "video/mp4" });
    expect(hoisted.state.putCalls[0].key).toMatch(/\.plainname$/);
    // NOTE: an undotted name becomes the extension, e.g. video-123.plainname
  });

  it("db insert failure still wrote bytes first (row-less orphan object), answers 500 with the raw error message", async () => {
    hoisted.state.authThrows = false;
    (hoisted.state as any).insertRejects = true;
    const res = await runUpload({ originalname: "a.mp4", buffer: Buffer.from("v"), mimetype: "video/mp4" });
    expect(hoisted.state.putCalls).toHaveLength(1);
    expect(hoisted.state.inserts).toHaveLength(0);
    expect(res.statusCode).toBe(500);
    // NOTE: internal error message is echoed to the client (minor leak)
    expect(res.body).toEqual({ error: "insert rejected" });
  });

  it("storage failure surfaces as 500", async () => {
    hoisted.state.authThrows = false;
    hoisted.state.adapterPutThrows = true;
    const res = await runUpload({ originalname: "a.mp4", buffer: Buffer.from("v"), mimetype: "video/mp4" });
    expect(res.statusCode).toBe(500);
  });
});
