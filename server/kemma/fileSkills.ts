import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Skills in the open Agent Skills format (agentskills.io): one folder per skill with a SKILL.md
 * (name + description frontmatter), optional scripts/, references/, assets/, and optional allowed-tools.
 * Flat skills/*.md files are wrapped automatically. Only name + description reach the system prompt;
 * bodies and files are read on demand through load_skill / read_skill_file.
 */

export interface FileSkill {
  /** Folder name, or the file name without .md for flat skills. Stable id used by tools and approvals. */
  slug: string;
  name: string;
  description: string;
  kind: "folder" | "flat";
  /** Absolute skill folder; null for flat skills. */
  dir: string | null;
  /** Absolute path of SKILL.md or the flat .md file. */
  entryFile: string;
  /** Markdown after the frontmatter. */
  body: string;
  /** null means the skill does not narrow the tool set. */
  allowedTools: string[] | null;
  /** Relative paths of every other file in the folder (never includes SKILL.md). */
  files: string[];
  /** sha256 over every file in the skill; any edit changes it and voids approval. */
  hash: string;
}

const DEFAULT_SKILLS_DIR = process.env.SKILLS_DIR ? path.resolve(process.env.SKILLS_DIR) : path.resolve(process.cwd(), "skills");
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SKIP_NAMES = new Set(["node_modules", "__pycache__", ".git", ".DS_Store"]);
const MAX_FILES = 200;
const MAX_DEPTH = 4;
export const MAX_SKILL_FILE_BYTES = 200_000;

export async function loadFileSkills(skillsDir: string = DEFAULT_SKILLS_DIR): Promise<FileSkill[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: FileSkill[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_NAMES.has(e.name) || e.isSymbolicLink()) continue;
    try {
      if (e.isDirectory()) {
        const s = await loadFolderSkill(path.join(skillsDir, e.name), e.name);
        if (s) out.push(s);
      } else if (e.isFile() && e.name.endsWith(".md") && e.name !== "README.md") {
        const s = await loadFlatSkill(path.join(skillsDir, e.name), e.name);
        if (s) out.push(s);
      }
    } catch (err) {
      console.warn(`[skills] skipped ${e.name}: ${(err as Error).message}`);
    }
  }
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

async function loadFolderSkill(dir: string, slug: string): Promise<FileSkill | null> {
  if (!SLUG_RE.test(slug)) return null;
  const entryFile = path.join(dir, "SKILL.md");
  let text: string;
  try {
    text = await fs.readFile(entryFile, "utf-8");
  } catch {
    return null;
  }
  const { meta, body } = parseFrontmatter(text);
  const description = meta.description?.trim() ?? "";
  if (!description) return null;

  const files = await listSkillFiles(dir);
  return {
    slug,
    name: meta.name?.trim() || slug,
    description,
    kind: "folder",
    dir,
    entryFile,
    body,
    allowedTools: parseAllowedTools(meta["allowed-tools"]),
    files,
    hash: await hashSkill(entryFile, dir, files),
  };
}

async function loadFlatSkill(filePath: string, fileName: string): Promise<FileSkill | null> {
  const slug = slugify(fileName.replace(/\.md$/, ""));
  if (!SLUG_RE.test(slug)) return null;
  const text = await fs.readFile(filePath, "utf-8");
  const { meta, body } = parseFrontmatter(text);
  const h1 = body.split("\n").find((l) => l.startsWith("# "))?.slice(2).trim();
  const firstLine = body.split("\n").find((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith("#") && !t.startsWith("---");
  });
  const description = meta.description?.trim() || firstLine?.trim() || "";
  if (!description) return null;
  return {
    slug,
    name: meta.name?.trim() || h1 || slug,
    description,
    kind: "flat",
    dir: null,
    entryFile: filePath,
    body,
    allowedTools: parseAllowedTools(meta["allowed-tools"]),
    files: [],
    hash: crypto.createHash("sha256").update(`SKILL.md\0${sha(text)}\n`).digest("hex"),
  };
}

async function listSkillFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH || found.length >= MAX_FILES) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP_NAMES.has(e.name) || e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs, depth + 1);
      else if (e.isFile()) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        if (rel !== "SKILL.md" && found.length < MAX_FILES) found.push(rel);
      }
    }
  }
  await walk(root, 0);
  return found.sort();
}

async function hashSkill(entryFile: string, dir: string, files: string[]): Promise<string> {
  const h = crypto.createHash("sha256");
  h.update(`SKILL.md\0${sha(await fs.readFile(entryFile))}\n`);
  for (const rel of files) h.update(`${rel}\0${sha(await fs.readFile(path.join(dir, rel)))}\n`);
  return h.digest("hex");
}

function sha(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function parseAllowedTools(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const list = raw.replace(/[\[\],]/g, " ").split(/\s+/).map((t) => t.replace(/^["']|["']$/g, "")).filter(Boolean);
  return list.length ? list : null;
}

/** Top-level `key: value` frontmatter only. Handles quotes and >/| block scalars; ignores nested maps. */
export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const src = text.replace(/^﻿/, "");
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const km = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!km) continue;
    const key = km[1].toLowerCase();
    let value = km[2].trim();
    if (value === ">" || value === "|" || value === ">-" || value === "|-") {
      const parts: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim());
      value = parts.join(value.startsWith(">") ? " " : "\n");
    } else if (value === "") {
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) i++;
      continue;
    } else if (/^(".*"|'.*')$/.test(value)) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: src.slice(m[0].length).trimStart() };
}

/** The only skill text that goes into the system prompt on every run. */
export function buildSkillIndex(skills: FileSkill[]): string {
  if (skills.length === 0) return "";
  const lines = skills.map((s) => `- ${s.slug}: ${s.description}`);
  return [
    "## Skills",
    "Skills are folders of instructions. Below is only the index. When a task matches one, call load_skill with its name before you start and follow it. " +
      "Use read_skill_file for its references and run_skill_script for its scripts (scripts run in an isolated sandbox, never on the server). " +
      "A skill can only narrow your tools; it never gives you new ones.",
    ...lines,
  ].join("\n");
}

export interface LoadedSkill {
  name: string;
  description: string;
  instructions: string;
  files: string[];
  allowedTools: string[] | null;
}

export function toLoadedSkill(s: FileSkill): LoadedSkill {
  return { name: s.slug, description: s.description, instructions: s.body, files: s.files, allowedTools: s.allowedTools };
}

/** Read one file from inside a skill folder. Confined to the enumerated files of that skill. */
export async function readSkillFileContent(skill: FileSkill, relPath: string): Promise<{ path: string; content: string } | { error: string }> {
  if (!skill.dir) return { error: "This skill is a single file and has no extra files." };
  if (typeof relPath !== "string" || !relPath || relPath.includes("\0") || path.isAbsolute(relPath)) return { error: "Invalid path." };
  const norm = path.posix.normalize(relPath.replace(/\\/g, "/"));
  if (norm.startsWith("..") || norm.split("/").includes("..")) return { error: "Path must stay inside the skill folder." };
  if (norm === "SKILL.md") return { error: "SKILL.md is already returned by load_skill." };
  if (!skill.files.includes(norm)) return { error: `No such file in skill. Available: ${skill.files.slice(0, 50).join(", ") || "(none)"}` };

  const abs = path.resolve(skill.dir, norm);
  const real = await fs.realpath(abs);
  const realRoot = await fs.realpath(skill.dir);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return { error: "Path must stay inside the skill folder." };

  const st = await fs.stat(real);
  if (st.size > MAX_SKILL_FILE_BYTES) return { error: `File is ${st.size} bytes; the limit is ${MAX_SKILL_FILE_BYTES}.` };
  const buf = await fs.readFile(real);
  if (buf.includes(0)) return { error: "Binary file. Use it from a script in the sandbox instead." };
  return { path: norm, content: buf.toString("utf-8") };
}

/** Text of a skill that a reviewer should read: SKILL.md plus every text file, size capped. */
export async function collectSkillTextForReview(skill: FileSkill, maxBytes = 120_000): Promise<string> {
  const parts: string[] = [`=== ${skill.kind === "flat" ? path.basename(skill.entryFile) : "SKILL.md"} ===\n${await fs.readFile(skill.entryFile, "utf-8")}`];
  let used = parts[0].length;
  for (const rel of skill.files) {
    if (!skill.dir) break;
    const buf = await fs.readFile(path.join(skill.dir, rel));
    if (buf.includes(0)) {
      parts.push(`=== ${rel} === (binary, ${buf.length} bytes)`);
      continue;
    }
    const text = buf.toString("utf-8");
    if (used + text.length > maxBytes) {
      parts.push(`=== ${rel} === (omitted, over size budget)`);
      continue;
    }
    used += text.length;
    parts.push(`=== ${rel} ===\n${text}`);
  }
  return parts.join("\n\n");
}
