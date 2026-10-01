/**
 * vps_files executor: admin-only, read-only access to the host filesystem
 * directories mounted into the container (see docker-compose.yml).
 *
 * Roots come from VPS_FILES_ROOTS (comma-separated container paths, default /vps).
 * Every path is realpath-resolved and must stay inside a root, so ../ and
 * symlink escapes fail. Secret-looking paths are refused outright.
 */

import { promises as fs } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { users } from "../../../drizzle/schema";

const MAX_READ_BYTES = 200_000;
const MAX_LIST_ENTRIES = 300;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCH_VISITS = 20_000;

const DENIED_SEGMENT =
  /^(\.ssh|\.gnupg|\.aws|\.config|\.claude|\.anthropic_key|\.env(\..*)?|secrets|backups|wa-auth|\.git-credentials|\.netrc|\.npmrc|\.docker|\.kube|id_(rsa|ed25519|ecdsa)(\.pub)?|credentials(\..*)?)$|\.(pem|key|p12|pfx|sql|dump)$/i;

export class VpsFilesError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "VpsFilesError";
  }
}

export function getRoots(): string[] {
  return (process.env.VPS_FILES_ROOTS ?? "/vps")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => path.resolve(r));
}

function isDenied(p: string): boolean {
  return p.split(path.sep).some((seg) => seg && DENIED_SEGMENT.test(seg));
}

function within(root: string, p: string): boolean {
  return p === root || p.startsWith(root + path.sep);
}

/** Resolve a user-supplied path to a real path inside an allowed root, or throw. */
async function resolveSafe(input: unknown): Promise<string> {
  if (typeof input !== "string" || input.trim() === "" || input.includes("\0")) {
    throw new VpsFilesError('Missing or invalid "path" parameter', "INVALID_PARAMS");
  }
  const roots = getRoots();
  const candidate = path.resolve(roots[0], input);
  let real: string;
  try {
    real = await fs.realpath(candidate);
  } catch {
    throw new VpsFilesError(`Not found: ${input}`, "NOT_FOUND");
  }
  const rootReals = await Promise.all(roots.map((r) => fs.realpath(r).catch(() => r)));
  const root = rootReals.find((r) => within(r, real));
  if (!root) throw new VpsFilesError("Path is outside the allowed roots", "FORBIDDEN_PATH");
  if (isDenied(path.relative(root, real)) || isDenied(path.relative(roots[0], candidate))) {
    throw new VpsFilesError("Path is blocked because it may contain secrets", "FORBIDDEN_PATH");
  }
  return real;
}

export async function isAdminUser(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0]?.role === "admin";
}

export type VpsFilesAction = "list" | "read" | "stat" | "search";

export async function runVpsFiles(userId: number, action: unknown, args: Record<string, unknown>) {
  if (!(await isAdminUser(userId))) throw new VpsFilesError("vps_files is admin-only", "FORBIDDEN");

  switch (action) {
    case "list": {
      const dir = await resolveSafe(args.path ?? ".");
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const visible = entries.filter((e) => !isDenied(e.name)).sort((a, b) => a.name.localeCompare(b.name));
      const out = await Promise.all(
        visible.slice(0, MAX_LIST_ENTRIES).map(async (e) => {
          const st = await fs.stat(path.join(dir, e.name)).catch(() => null);
          return { name: e.name, type: e.isDirectory() ? "dir" : e.isSymbolicLink() ? "symlink" : "file", size: st?.size ?? null, modified: st?.mtime.toISOString() ?? null };
        })
      );
      return { path: dir, entries: out, truncated: visible.length > MAX_LIST_ENTRIES };
    }
    case "stat": {
      const p = await resolveSafe(args.path);
      const st = await fs.stat(p);
      return { path: p, type: st.isDirectory() ? "dir" : "file", size: st.size, modified: st.mtime.toISOString() };
    }
    case "read": {
      const p = await resolveSafe(args.path);
      const st = await fs.stat(p);
      if (!st.isFile()) throw new VpsFilesError("Not a file", "INVALID_PARAMS");
      const offset = typeof args.offset === "number" && args.offset > 0 ? Math.floor(args.offset) : 0;
      const handle = await fs.open(p, "r");
      try {
        const buf = Buffer.alloc(Math.min(MAX_READ_BYTES, Math.max(0, st.size - offset)));
        const { bytesRead } = await handle.read(buf, 0, buf.length, offset);
        const slice = buf.subarray(0, bytesRead);
        if (slice.includes(0)) throw new VpsFilesError("Binary file; only text files can be read", "BINARY_FILE");
        return { path: p, size: st.size, offset, content: slice.toString("utf8"), truncated: offset + bytesRead < st.size };
      } finally {
        await handle.close();
      }
    }
    case "search": {
      const start = await resolveSafe(args.path ?? ".");
      const needle = typeof args.query === "string" ? args.query.toLowerCase() : "";
      if (!needle) throw new VpsFilesError('Missing or invalid "query" parameter', "INVALID_PARAMS");
      const matches: string[] = [];
      let visits = 0;
      const walk = async (dir: string): Promise<void> => {
        if (matches.length >= MAX_SEARCH_RESULTS || visits > MAX_SEARCH_VISITS) return;
        for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
          if (matches.length >= MAX_SEARCH_RESULTS || ++visits > MAX_SEARCH_VISITS) return;
          if (isDenied(e.name) || e.name === "node_modules" || e.name === ".git") continue;
          const full = path.join(dir, e.name);
          if (e.name.toLowerCase().includes(needle)) matches.push(full);
          if (e.isDirectory()) await walk(full);
        }
      };
      await walk(start);
      return { query: needle, matches, truncated: matches.length >= MAX_SEARCH_RESULTS || visits > MAX_SEARCH_VISITS };
    }
    default:
      throw new VpsFilesError(`Unknown vps_files action: ${String(action)}`, "UNKNOWN_ACTION");
  }
}
