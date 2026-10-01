// Audit tests for server/kemma/executors/vpsFiles.ts: admin gate, root containment, secret denylist.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const h = vi.hoisted(() => ({ role: "admin" as string }));
vi.mock("../../db", () => ({
  getDb: async () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ role: h.role }] }) }) }) }),
}));

import { runVpsFiles } from "./vpsFiles";

let root: string;
let outside: string;
beforeEach(() => {
  h.role = "admin";
  root = mkdtempSync(path.join(tmpdir(), "vps-root-"));
  outside = mkdtempSync(path.join(tmpdir(), "vps-out-"));
  process.env.VPS_FILES_ROOTS = root;
  writeFileSync(path.join(root, "notes.txt"), "hello");
  writeFileSync(path.join(root, ".env"), "SECRET=1");
  mkdirSync(path.join(root, "secrets"));
  writeFileSync(path.join(root, "secrets", "k.json"), "{}");
  writeFileSync(path.join(outside, "x.txt"), "nope");
  symlinkSync(outside, path.join(root, "escape"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
  delete process.env.VPS_FILES_ROOTS;
});

describe("vps_files", () => {
  it("rejects non-admins", async () => {
    h.role = "user";
    await expect(runVpsFiles(1, "list", { path: "." })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("lists without secret entries", async () => {
    const r: any = await runVpsFiles(1, "list", { path: "." });
    const names = r.entries.map((e: any) => e.name);
    expect(names).toContain("notes.txt");
    expect(names).not.toContain(".env");
    expect(names).not.toContain("secrets");
  });
  it("reads a text file", async () => {
    const r: any = await runVpsFiles(1, "read", { path: "notes.txt" });
    expect(r.content).toBe("hello");
  });
  it("blocks secret files and folders", async () => {
    await expect(runVpsFiles(1, "read", { path: ".env" })).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
    await expect(runVpsFiles(1, "read", { path: "secrets/k.json" })).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
  });
  it("blocks traversal and symlink escapes", async () => {
    await expect(runVpsFiles(1, "read", { path: "../etc/passwd" })).rejects.toBeTruthy();
    await expect(runVpsFiles(1, "read", { path: "escape/x.txt" })).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
    await expect(runVpsFiles(1, "read", { path: "/etc/passwd" })).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
  });
  it("searches by name and skips secrets", async () => {
    const r: any = await runVpsFiles(1, "search", { path: ".", query: "k.json" });
    expect(r.matches).toEqual([]);
    const r2: any = await runVpsFiles(1, "search", { path: ".", query: "notes" });
    expect(r2.matches).toHaveLength(1);
  });
});
