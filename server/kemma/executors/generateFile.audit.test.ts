// Audit tests for server/kemma/executors/generateFile.ts (generate_file tool).
// Uses the real fileGenerator (pdfkit etc. run locally, no network), the real
// LocalAdapter against a /tmp root, and a mocked db. Verifies DB row columns
// against the files schema, format dispatch, failure modes (bad format,
// insert-after-put), and name handling.
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const h = vi.hoisted(() => {
  const state = {
    inserts: [] as any[],
    nextId: 500,
    insertFails: false,
  };
  const db = {
    insert: () => ({
      values: (v: any) => ({
        returning: () => {
          if (state.insertFails) return Promise.reject(new Error("db down"));
          state.inserts.push(v);
          return Promise.resolve([{ id: state.nextId++ }]);
        },
      }),
    }),
  };
  return { state, db };
});

vi.mock("../../db", () => ({ getDb: async () => h.db }));
vi.mock("../../services/google", () => ({
  createDriveFolder: vi.fn(async () => ({ id: "fake" })),
  uploadDriveFile: vi.fn(async () => ({ id: "fake" })),
  getConnectionStatus: vi.fn(async () => ({ connected: false })),
}));

const savedEnv: Record<string, string | undefined> = {};
const tempDirs: string[] = [];

async function setup(name: string) {
  vi.resetModules();
  const base = mkdtempSync(path.join(tmpdir(), `gf-audit-${name}-`));
  tempDirs.push(base);
  const root = path.join(base, "store");
  savedEnv.STORAGE_LOCAL_ROOT ??= process.env.STORAGE_LOCAL_ROOT;
  savedEnv.STORAGE_DRIVER ??= process.env.STORAGE_DRIVER;
  process.env.STORAGE_LOCAL_ROOT = root;
  process.env.STORAGE_DRIVER = "local";
  const mod = await import("./generateFile");
  const { STYLE_DEFINITIONS } = await import("../../fileGenerator");
  return { mod, root, base, style: STYLE_DEFINITIONS[0] };
}

afterEach(() => {
  for (const k of ["STORAGE_LOCAL_ROOT", "STORAGE_DRIVER"]) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  tempDirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
  h.state.inserts = [];
  h.state.insertFails = false;
  h.state.nextId = 500;
});

const content = {
  title: "Q3 Report",
  subtitle: "Audited",
  sections: [{ heading: "Intro", body: "Hello world", bullets: ["a", "b"] }],
  summary: "All good",
};

describe("generateAndSaveFile happy paths", () => {
  it("markdown: full files-table row and correct on-disk bytes", async () => {
    const { mod, root, style } = await setup("md");
    const res = await mod.generateAndSaveFile(3, "report", content as any, "md", style, {
      threadId: "t-1",
      spaceId: "s-1",
    });
    expect(res.fileId).toBe(500);
    expect(res.url).toBe("/files/users/3/files/report.md");
    const row = h.state.inserts[0];
    expect(row).toMatchObject({
      userId: 3,
      name: "report",
      originalPrompt: "Q3 Report",
      format: "md",
      styleLabel: "Minimal Clean",
      kind: "document",
      storageProvider: "local",
      storageRef: "users/3/files/report.md",
      threadId: "t-1",
      spaceId: "s-1",
      fileKey: "users/3/files/report.md",
      fileUrl: "/files/users/3/files/report.md",
      mimeType: "text/markdown",
    });
    const onDisk = readFileSync(path.join(root, "users/3/files/report.md")).toString();
    expect(onDisk.startsWith("# Q3 Report")).toBe(true);
    expect(row.fileSizeBytes).toBe(Buffer.byteLength(onDisk));
  });

  it("pdf: binary buffer reaches storage intact (starts with %PDF)", async () => {
    const { mod, root, style } = await setup("pdf");
    const res = await mod.generateAndSaveFile(3, "doc", content as any, "pdf", style);
    expect(res.url).toBe("/files/users/3/files/doc.pdf");
    const bytes = readFileSync(path.join(root, "users/3/files/doc.pdf"));
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(h.state.inserts[0].mimeType).toBe("application/pdf");
    expect(h.state.inserts[0].fileSizeBytes).toBe(bytes.length);
  });

  it("xlsx: produces a zip (PK magic) and office mime type", async () => {
    const { mod, root, style } = await setup("xlsx");
    await mod.generateAndSaveFile(3, "sheet", content as any, "xlsx", style);
    const bytes = readFileSync(path.join(root, "users/3/files/sheet.xlsx"));
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(h.state.inserts[0].mimeType).toContain("spreadsheetml");
  });

  it("threadId/spaceId default to null when options are omitted", async () => {
    const { mod, style } = await setup("nulls");
    await mod.generateAndSaveFile(3, "n", content as any, "md", style);
    expect(h.state.inserts[0]).toMatchObject({ threadId: null, spaceId: null });
  });
});

describe("failure modes", () => {
  it("unsupported format string is rejected with a clear message before any write or row", async () => {
    const { mod, root, base, style } = await setup("badfmt");
    await expect(
      mod.generateAndSaveFile(3, "x", content as any, "exe", style)
    ).rejects.toThrow(/Unsupported file format: exe/);
    expect(h.state.inserts).toHaveLength(0);
    expect(existsSync(path.join(base, "store"))).toBe(false); // nothing was written
  });

  it("db insert failure after a successful put leaves orphan bytes with no row (documented leak)", async () => {
    const { mod, root, style } = await setup("orphan");
    h.state.insertFails = true;
    await expect(
      mod.generateAndSaveFile(3, "ghost", content as any, "md", style)
    ).rejects.toThrow(/db down/);
    expect(h.state.inserts).toHaveLength(0);
    expect(existsSync(path.join(root, "users/3/files/ghost.md"))).toBe(true);
  });

  it("LLM-controlled name with dot-dot is stripped by the adapter, stays under users/<id>/files", async () => {
    const { mod, root, base, style } = await setup("travname");
    await mod.generateAndSaveFile(3, "../../escape", content as any, "md", style);
    expect(existsSync(path.join(base, "escape.md"))).toBe(false);
    expect(existsSync(path.join(base, "root/escape.md"))).toBe(false);
    const key = h.state.inserts[0].fileKey;
    expect(key).not.toContain("..");
    expect(key.startsWith("users/3/files/")).toBe(true);
    // file physically lands inside the user's namespace (path.join collapses)
    expect(existsSync(path.join(root, "users/3/files/escape.md"))).toBe(true);
  });

  it("same name twice overwrites the object but creates a second DB row pointing at it", async () => {
    const { mod, root, style } = await setup("dup");
    await mod.generateAndSaveFile(3, "same", content as any, "md", style);
    const other = { ...content, title: "Second version" };
    await mod.generateAndSaveFile(3, "same", other as any, "md", style);
    expect(h.state.inserts).toHaveLength(2);
    expect(h.state.inserts[0].fileKey).toBe(h.state.inserts[1].fileKey);
    const bytes = readFileSync(path.join(root, "users/3/files/same.md")).toString();
    expect(bytes.startsWith("# Second version")).toBe(true); // first row now points at second content
  });
});
