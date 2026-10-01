// Audit tests for server/kemma/executors/safeFiles.ts (the safe_files tool
// executor). Runs against the real LocalAdapter with a /tmp root and a mocked
// db. Covers traversal/null-byte containment, the PLAN.md B1 read path
// (bytes, not URL strings), versioning/trash/purge behavior, and key
// derivation. Never touches /root/sr1-data.
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import bcrypt from "bcryptjs";

const h = vi.hoisted(() => {
  const TABLE_NAME = Symbol.for("drizzle:Name");
  const tableName = (t: unknown): string | undefined =>
    (t as Record<symbol, unknown> | undefined)?.[TABLE_NAME] as string | undefined;
  const state = {
    rows: [] as any[],
    quotas: [] as any[],
    inserts: [] as any[],
    updates: [] as any[],
    deletes: [] as any[],
    nextId: 100,
    insertFails: false,
  };
  const makeQuery = (rows: () => any[]) => ({
    then: (res: (v: any[]) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(rows()).then(res, rej),
    limit: (n: number) => Promise.resolve(rows().slice(0, n)),
  });
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () =>
          makeQuery(() =>
            tableName(table) === "files" ? state.rows : tableName(table) === "user_quotas" ? state.quotas : []
          ),
      }),
    }),
    insert: () => ({
      values: (v: any) => ({
        returning: () => {
          if (state.insertFails) return Promise.reject(new Error("insert boom"));
          state.inserts.push(v);
          return Promise.resolve([{ id: state.nextId++ }]);
        },
      }),
    }),
    update: () => ({
      set: (v: any) => ({
        where: () => {
          state.updates.push(v);
          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({
      where: () => {
        state.deletes.push(true);
        return Promise.resolve();
      },
    }),
  };
  return { state, db };
});

vi.mock("../../db", () => ({
  getDb: async () => h.db,
}));

// Keep storageAdapter's Drive branch from loading googleapis.
vi.mock("../../services/google", () => ({
  createDriveFolder: vi.fn(async () => ({ id: "fake" })),
  uploadDriveFile: vi.fn(async () => ({ id: "fake" })),
  getConnectionStatus: vi.fn(async () => ({ connected: false })),
}));

const savedEnv: Record<string, string | undefined> = {};
const tempDirs: string[] = [];
const USER = 9;

async function freshModule(name: string) {
  vi.resetModules();
  const base = mkdtempSync(path.join(tmpdir(), `sf-audit-${name}-`));
  tempDirs.push(base);
  const root = path.join(base, "store");
  savedEnv.STORAGE_LOCAL_ROOT ??= process.env.STORAGE_LOCAL_ROOT;
  savedEnv.STORAGE_DRIVER ??= process.env.STORAGE_DRIVER;
  savedEnv.STORAGE_LOCAL_URL ??= process.env.STORAGE_LOCAL_URL;
  process.env.STORAGE_LOCAL_ROOT = root;
  process.env.STORAGE_DRIVER = "local";
  delete process.env.STORAGE_LOCAL_URL;
  const mod = await import("./safeFiles");
  return { mod, root, base };
}

afterEach(() => {
  for (const k of ["STORAGE_LOCAL_ROOT", "STORAGE_DRIVER", "STORAGE_LOCAL_URL"]) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  tempDirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
  h.state.rows = [];
  h.state.quotas = [];
  h.state.inserts = [];
  h.state.updates = [];
  h.state.deletes = [];
  h.state.insertFails = false;
  h.state.nextId = 100;
});

describe("createFile path safety (LLM-controlled path segment)", () => {
  it("dot-dot traversal is stripped; bytes stay under users/<id>/files inside the root", async () => {
    const { mod, root, base } = await freshModule("trav");
    const res = await mod.createFile(USER, "../../../../ESCAPED.txt", Buffer.from("boom"), "text/plain");
    expect(res.fileId).toBe(100);
    const stored = path.join(root, "users/9/files/ESCAPED.txt");
    expect(existsSync(stored)).toBe(true);
    expect(readFileSync(stored).toString()).toBe("boom");
    expect(existsSync(path.join(base, "ESCAPED.txt"))).toBe(false);
    // the row must carry the sanitized key (no "..") so later reads agree.
    // Note: put() keeps the empty path segments ("//" runs) that the ".."
    // stripping produced; only path.join on the filesystem collapses them.
    expect(h.state.inserts[0].fileKey).not.toContain("..");
    expect(h.state.inserts[0].fileKey).toBe("users/9/files/////ESCAPED.txt");
    expect(h.state.inserts[0].storageRef).toBe(h.state.inserts[0].fileKey);
  });

  it("the tool schema's own example absolute path '/documents/report.txt' is contained", async () => {
    const { mod, root } = await freshModule("abs");
    const res = await mod.createFile(USER, "/documents/report.txt", Buffer.from("hi"), "text/plain");
    expect(existsSync(path.join(root, "users/9/files/documents/report.txt"))).toBe(true);
    // key/url keep the doubled slash from path.join of "files/" + "/documents",
    // but the on-disk location and reads stay correct (path.join normalizes)
    expect(res.url).toBe("/files/users/9/files//documents/report.txt");
  });

  it("dot-dot stripping bypass attempts remain contained", async () => {
    const { mod, root, base } = await freshModule("bypass");
    await mod.createFile(USER, "....//ESCAPED2.txt", Buffer.from("x"), "text/plain");
    await mod.createFile(USER, "users/....//ESCAPED3.txt", Buffer.from("x"), "text/plain");
    expect(existsSync(path.join(base, "ESCAPED2.txt"))).toBe(false);
    expect(existsSync(path.join(base, "ESCAPED3.txt"))).toBe(false);
    expect(existsSync(path.join(root, "users/9/files/ESCAPED2.txt"))).toBe(true);
  });

  it("a null byte in the path fails closed with FileOperationError and no DB row", async () => {
    const { mod } = await freshModule("nul");
    await expect(
      mod.createFile(USER, "a\0evil.txt", Buffer.from("x"), "text/plain")
    ).rejects.toThrow(/Failed to create file/);
    expect(h.state.inserts).toHaveLength(0);
  });

  it("insert failure after a successful put leaves orphan bytes (documented leak)", async () => {
    const { mod, root, base } = await freshModule("orphan");
    h.state.insertFails = true;
    await expect(
      mod.createFile(USER, "ghost.md", Buffer.from("g"), "text/markdown")
    ).rejects.toThrow(/Failed to create file/);
    // bytes are on disk, but there is no row to reference or clean them up
    expect(existsSync(path.join(root, "users/9/files/ghost.md"))).toBe(true);
    expect(h.state.inserts).toHaveLength(0);
    expect(existsSync(path.join(base, "users"))).toBe(false);
  });
});

describe("readFile returns real bytes (PLAN.md B1 at the executor level)", () => {
  it("resolves to the stored Buffer, not the fileUrl string", async () => {
    const { mod, root } = await freshModule("read");
    const fileKey = "users/9/files/doc.pdf";
    mkdirSync(path.join(root, "users/9/files"), { recursive: true });
    writeFileSync(path.join(root, fileKey), "%PDF-1.4 real bytes");
    h.state.rows = [
      {
        id: 5,
        userId: USER,
        name: "doc.pdf",
        fileKey,
        fileUrl: "/files/" + fileKey,
        mimeType: "application/pdf",
        trashed: false,
      },
    ];
    const buf = await mod.readFile(USER, 5);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString("utf-8")).toBe("%PDF-1.4 real bytes");
    // regression guard for the old bug: content must not be the URL
    expect(buf.toString("utf-8")).not.toBe("/files/" + fileKey);
  });

  it("missing record raises FileNotFoundError before touching storage", async () => {
    const { mod } = await freshModule("readmiss");
    h.state.rows = [];
    await expect(mod.readFile(USER, 404)).rejects.toThrow(/File with ID 404 not found/);
  });
});

describe("editFile versioning", () => {
  it("archives the old bytes and overwrites the live object; row metadata updated", async () => {
    const { mod, root } = await freshModule("edit");
    const fileKey = "users/9/files/doc.md";
    mkdirSync(path.join(root, "users/9/files"), { recursive: true });
    writeFileSync(path.join(root, fileKey), "v1");
    h.state.rows = [
      { id: 5, userId: USER, name: "doc.md", fileKey, fileUrl: "/files/" + fileKey, mimeType: "text/markdown", trashed: false },
    ];
    await mod.editFile(USER, 5, Buffer.from("v2"));
    expect(readFileSync(path.join(root, fileKey)).toString()).toBe("v2");
    const archiveDir = path.join(root, "users/9/archive/5");
    expect(existsSync(archiveDir)).toBe(true);
    const versions = readdirSync(archiveDir);
    expect(versions).toHaveLength(1);
    expect(readFileSync(path.join(archiveDir, versions[0])).toString()).toBe("v1");
    expect(h.state.updates[0]).toMatchObject({ storageRef: fileKey, fileSizeBytes: 2 });
  });
});

describe("trash / restore / purge", () => {
  it("trashFile copies bytes to to_be_deleted and flags the row", async () => {
    const { mod, root } = await freshModule("trash");
    const fileKey = "users/9/files/doc.md";
    mkdirSync(path.join(root, "users/9/files"), { recursive: true });
    writeFileSync(path.join(root, fileKey), "content");
    h.state.rows = [{ id: 5, userId: USER, name: "doc.md", fileKey, mimeType: "text/markdown", trashed: false }];
    await mod.trashFile(USER, 5);
    expect(existsSync(path.join(root, "users/9/to_be_deleted/doc.md"))).toBe(true);
    expect(h.state.updates[0]).toMatchObject({ trashed: true });
  });

  it("trpc-generated rows with the 'user-<id>/' prefix still trash and restore (namespace mismatch is cosmetic)", async () => {
    const { mod, root } = await freshModule("prefix");
    const fileKey = "user-9/files/doc.md"; // routers.ts uses user-{id}, executors use users/{id}
    mkdirSync(path.join(root, "user-9/files"), { recursive: true });
    writeFileSync(path.join(root, fileKey), "content");
    h.state.rows = [{ id: 7, userId: USER, name: "doc.md", fileKey, mimeType: "text/markdown", trashed: false }];
    await mod.trashFile(USER, 7);
    // the replace(`users/9/files/`) is a no-op here, so the trash path nests the original key
    expect(existsSync(path.join(root, "users/9/to_be_deleted/user-9/files/doc.md"))).toBe(true);
    h.state.rows = [{ id: 7, userId: USER, name: "doc.md", fileKey, mimeType: "text/markdown", trashed: true }];
    await mod.restoreFile(USER, 7);
    expect(h.state.updates[1]).toMatchObject({ trashed: false });
  });

  it("restoreFile refuses files that are not trashed", async () => {
    const { mod } = await freshModule("restore-notdel");
    h.state.rows = [{ id: 5, userId: USER, name: "doc.md", fileKey: "users/9/files/doc.md", mimeType: "text/markdown", trashed: false }];
    await expect(mod.restoreFile(USER, 5)).rejects.toThrow(/File is not in trash/);
  });

  it("purgeFile enforces the bcrypt purge password and only then deletes the row", async () => {
    const { mod, root } = await freshModule("purge");
    const hash = bcrypt.hashSync("fake-pw", 10);
    h.state.quotas = [{ userId: USER, purgePasswordHash: hash }];
    const fileKey = "users/9/files/doc.md";
    mkdirSync(path.join(root, "users/9/files"), { recursive: true });
    writeFileSync(path.join(root, fileKey), "content");
    h.state.rows = [{ id: 5, userId: USER, name: "doc.md", fileKey, trashed: true }];
    await expect(mod.purgeFile(USER, 5, "wrong-pw")).rejects.toThrow(/Invalid purge password/);
    expect(h.state.deletes).toHaveLength(0);
    await mod.purgeFile(USER, 5, "fake-pw");
    expect(h.state.deletes).toHaveLength(1);
    // known gap: no storage delete exists, so bytes survive a "permanent" delete
    expect(existsSync(path.join(root, fileKey))).toBe(true);
  });

  it("purgeFile fails closed when no purge password is configured", async () => {
    const { mod } = await freshModule("purge-nopw");
    h.state.quotas = [{ userId: USER, purgePasswordHash: null }];
    await expect(mod.purgeFile(USER, 5, "any")).rejects.toThrow(/Purge password not configured/);
    expect(h.state.deletes).toHaveLength(0);
  });
});

describe("listings", () => {
  it("listFiles hides trashed rows", async () => {
    const { mod } = await freshModule("list");
    h.state.rows = [
      { id: 1, userId: USER, name: "a.md", fileKey: "users/9/files/a.md", trashed: false },
      { id: 2, userId: USER, name: "b.md", fileKey: "users/9/files/b.md", trashed: true },
    ];
    const out = await mod.listFiles(USER);
    expect(out.map((f) => f.id)).toEqual([1]);
  });

  it("listFileVersions always returns [] although editFile writes archives (functional gap)", async () => {
    const { mod, root } = await freshModule("versions");
    const fileKey = "users/9/files/doc.md";
    mkdirSync(path.join(root, "users/9/files"), { recursive: true });
    writeFileSync(path.join(root, fileKey), "v1");
    h.state.rows = [{ id: 5, userId: USER, name: "doc.md", fileKey, mimeType: "text/markdown", trashed: false }];
    await mod.editFile(USER, 5, Buffer.from("v2"));
    expect(await mod.listFileVersions(USER, 5)).toEqual([]);
    expect(existsSync(path.join(root, "users/9/archive/5"))).toBe(true);
  });
});
