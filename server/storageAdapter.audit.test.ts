// Audit tests for server/storageAdapter.ts: driver switching by env, local
// root defaults, and path-safety of the LocalAdapter. Uses real fs confined
// to /tmp; never touches the production default /root/sr1-data.
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// Stub the Drive adapter's service layer so importing storageAdapter never
// loads googleapis or touches the network.
vi.mock("./services/google", () => ({
  createDriveFolder: vi.fn(async () => ({ id: "drive-folder-fake" })),
  uploadDriveFile: vi.fn(async () => ({ id: "drive-file-fake", webViewLink: "https://drive.example/fake" })),
  getConnectionStatus: vi.fn(async () => ({ connected: false })),
}));

const ENV_KEYS = ["STORAGE_DRIVER", "STORAGE_LOCAL_ROOT", "STORAGE_LOCAL_URL"] as const;
const saved: Record<string, string | undefined> = {};
const tempDirs: string[] = [];

function freshRoot(name: string): string {
  const base = mkdtempSync(path.join(tmpdir(), `sa-audit-${name}-`));
  tempDirs.push(base);
  return base;
}

async function importAdapterModule() {
  vi.resetModules();
  return await import("./storageAdapter");
}

function setEnv(values: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (process.env[k] !== undefined && saved[k] === undefined) saved[k] = process.env[k];
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) process.env[k] = v;
  }
}

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  tempDirs.splice(0).forEach((d) => {
    try {
      rm(d);
    } catch {
      /* best effort */
    }
  });
  vi.resetModules();
});

// simple recursive remove
function rm(p: string) {
  rmSync(p, { recursive: true, force: true });
}

describe("getStorageAdapter driver switching", () => {
  it("unset STORAGE_DRIVER selects the local driver", async () => {
    setEnv({});
    const { getStorageAdapter } = await importAdapterModule();
    expect(getStorageAdapter().constructor.name).toBe("LocalAdapter");
  });

  it("empty STORAGE_DRIVER also selects local (silent default)", async () => {
    setEnv({ STORAGE_DRIVER: "" });
    const { getStorageAdapter } = await importAdapterModule();
    expect(getStorageAdapter().constructor.name).toBe("LocalAdapter");
  });

  it("unknown STORAGE_DRIVER values silently fall back to local", async () => {
    setEnv({ STORAGE_DRIVER: "s3" });
    const { getStorageAdapter } = await importAdapterModule();
    expect(getStorageAdapter().constructor.name).toBe("LocalAdapter");
    setEnv({ STORAGE_DRIVER: "forg" }); // typo for forge
    const { getStorageAdapter: g2 } = await importAdapterModule();
    expect(g2().constructor.name).toBe("LocalAdapter");
  });

  it("forge and drive select their drivers", async () => {
    setEnv({ STORAGE_DRIVER: "forge" });
    const { getStorageAdapter } = await importAdapterModule();
    expect(getStorageAdapter().constructor.name).toBe("ForgeAdapter");
    setEnv({ STORAGE_DRIVER: "drive" });
    const { getStorageAdapter: g2 } = await importAdapterModule();
    expect(g2().constructor.name).toBe("DriveAdapter");
  });

  it("getStorageAdapter returns a new instance per call (Drive folder cache is per-call only)", async () => {
    setEnv({ STORAGE_DRIVER: "drive" });
    const { getStorageAdapter } = await importAdapterModule();
    expect(getStorageAdapter()).not.toBe(getStorageAdapter());
  });
});

describe("LocalAdapter put/get round trip under a /tmp root", () => {
  it("stores bytes under the root and serves them back; url uses the public prefix", async () => {
    const root = freshRoot("roundtrip");
    setEnv({ STORAGE_LOCAL_ROOT: path.join(root, "files"), STORAGE_LOCAL_URL: "https://files.example" });
    const { LocalAdapter, ensureLocalStorageRoot } = await importAdapterModule();
    await ensureLocalStorageRoot();
    expect(existsSync(path.join(root, "files"))).toBe(true);

    const a = new LocalAdapter();
    const res = await a.put("users/1/files/report.md", Buffer.from("# hello"), "text/markdown");
    expect(res.provider).toBe("local");
    expect(res.sizeBytes).toBe(7);
    expect(res.url).toBe("https://files.example/users/1/files/report.md");
    expect(readFileSync(path.join(root, "files", "users/1/files/report.md")).toString()).toBe("# hello");
    const back = await a.get("users/1/files/report.md");
    expect(back.toString()).toBe("# hello");
    expect(await a.getUrl("users/1/files/report.md")).toBe("https://files.example/users/1/files/report.md");
  });

  it("default STORAGE_LOCAL_URL is /files when unset", async () => {
    const root = freshRoot("defurl");
    setEnv({ STORAGE_LOCAL_ROOT: path.join(root, "files") });
    const { LocalAdapter } = await importAdapterModule();
    const a = new LocalAdapter();
    const res = await a.put("users/2/files/a.pdf", Buffer.from("x"), "application/pdf");
    expect(res.url).toBe("/files/users/2/files/a.pdf");
  });

  it("get rejects with ENOENT when the root or file is missing (upload route self-heals via put only)", async () => {
    const root = freshRoot("missing");
    setEnv({ STORAGE_LOCAL_ROOT: path.join(root, "nope") });
    const { LocalAdapter } = await importAdapterModule();
    const a = new LocalAdapter();
    await expect(a.get("users/1/files/x.md")).rejects.toMatchObject({ code: "ENOENT" });
    // put creates missing directories recursively, so generation paths recover
    await a.put("users/1/files/x.md", Buffer.from("y"), "text/markdown");
    expect(existsSync(path.join(root, "nope", "users/1/files/x.md"))).toBe(true);
  });

  it("ensureLocalStorageRoot silently no-ops when the root path is a regular file, then put fails ENOTDIR", async () => {
    const root = freshRoot("occupied");
    const occupied = path.join(root, "files");
    writeFileSync(occupied, "not a dir");
    setEnv({ STORAGE_LOCAL_ROOT: occupied });
    const { LocalAdapter, ensureLocalStorageRoot } = await importAdapterModule();
    await expect(ensureLocalStorageRoot()).resolves.toBeUndefined(); // existsSync passes on a file
    const a = new LocalAdapter();
    await expect(a.put("users/1/files/x.md", Buffer.from("y"), "text/markdown")).rejects.toMatchObject({
      code: "ENOTDIR",
    });
  });

  it("reads STORAGE_LOCAL_ROOT only at module load, not per call", async () => {
    const rootA = freshRoot("loadA");
    const rootB = freshRoot("loadB");
    setEnv({ STORAGE_LOCAL_ROOT: path.join(rootA, "files") });
    const { LocalAdapter } = await importAdapterModule();
    const a = new LocalAdapter();
    await a.put("k.md", Buffer.from("v"), "text/markdown");
    process.env.STORAGE_LOCAL_ROOT = path.join(rootB, "files"); // too late
    await a.put("k2.md", Buffer.from("v2"), "text/markdown");
    expect(existsSync(path.join(rootA, "files", "k2.md"))).toBe(true);
    expect(existsSync(path.join(rootB, "files", "k2.md"))).toBe(false);
  });
});

describe("LocalAdapter path safety (traversal and containment)", () => {
  it("dot-dot segments are stripped and the object stays inside the root", async () => {
    const root = freshRoot("trav");
    setEnv({ STORAGE_LOCAL_ROOT: path.join(root, "files") });
    const { LocalAdapter } = await importAdapterModule();
    const a = new LocalAdapter();
    const outside = path.join(root, "ESCAPED.txt");
    const res = await a.put("users/1/../../ESCAPED.txt", Buffer.from("boom"), "text/plain");
    expect(existsSync(outside)).toBe(false);
    expect(existsSync(path.join(root, "files", "ESCAPED.txt"))).toBe(false);
    expect(existsSync(path.join(root, "files", "users/1/ESCAPED.txt"))).toBe(true);
    expect(res.key).not.toContain("..");
    expect(readFileSync(path.join(root, "files", "users/1/ESCAPED.txt")).toString()).toBe("boom");
  });

  it("classic dot-dot stripping bypass attempts remain contained", async () => {
    const root = freshRoot("bypass");
    setEnv({ STORAGE_LOCAL_ROOT: path.join(root, "files") });
    const { LocalAdapter } = await importAdapterModule();
    const a = new LocalAdapter();
    const attempts = [
      "....//ESCAPED2.txt",
      "users/1/....//..//ESCAPED3.txt",
      "..././../ESCAPED4.txt",
      "/etc/ESCAPED5.txt",
    ];
    for (const key of attempts) {
      await a.put(key, Buffer.from("x"), "text/plain");
    }
    // nothing may land outside the root
    expect(existsSync(path.join(root, "ESCAPED2.txt"))).toBe(false);
    expect(existsSync(path.join(root, "ESCAPED3.txt"))).toBe(false);
    expect(existsSync(path.join(root, "ESCAPED4.txt"))).toBe(false);
    expect(existsSync(path.join(root, "ESCAPED5.txt"))).toBe(false);
    expect(existsSync(path.join(root, "etc/ESCAPED5.txt"))).toBe(false);
  });

  it("legit filenames containing dot-dot are corrupted but contained (documented behavior)", async () => {
    const root = freshRoot("corrupt");
    setEnv({ STORAGE_LOCAL_ROOT: path.join(root, "files") });
    const { LocalAdapter } = await importAdapterModule();
    const a = new LocalAdapter();
    const res = await a.put("users/1/report..v2.md", Buffer.from("z"), "text/markdown");
    expect(res.key).toBe("users/1/reportv2.md");
    expect(existsSync(path.join(root, "files", "users/1/reportv2.md"))).toBe(true);
  });

  it("null bytes in keys reject instead of truncating the path", async () => {
    const root = freshRoot("nul");
    setEnv({ STORAGE_LOCAL_ROOT: path.join(root, "files") });
    const { LocalAdapter } = await importAdapterModule();
    const a = new LocalAdapter();
    await expect(a.put("users/1/a\0b.md", Buffer.from("z"), "text/markdown")).rejects.toThrow();
    await expect(a.get("users/1/a\0b.md")).rejects.toThrow();
  });

  it("a pre-existing symlink inside the root is followed (hardening note; no app path can plant one)", async () => {
    const root = freshRoot("symlink");
    const filesRoot = path.join(root, "files");
    mkdirSync(filesRoot, { recursive: true });
    const outsideDir = path.join(root, "outside");
    mkdirSync(outsideDir);
    symlinkSync(outsideDir, path.join(filesRoot, "link"));
    setEnv({ STORAGE_LOCAL_ROOT: filesRoot });
    const { LocalAdapter } = await importAdapterModule();
    const a = new LocalAdapter();
    await a.put("link/pwned.txt", Buffer.from("escape"), "text/plain");
    // documents current behavior: the adapter does not lstat, so an attacker
    // who can plant a symlink under the root can write outside it.
    expect(existsSync(path.join(outsideDir, "pwned.txt"))).toBe(true);
  });
});
