/**
 * Build mode: the model edits a small in-browser project (Sandpack).
 *
 * The model answers in a tagged format rather than JSON, so code never has to be
 * escaped inside a string:
 *
 *   <reply>One or two sentences for the person.</reply>
 *   <file path="/App.js">whole new file</file>
 *   <edit path="/App.js"><find>exact old text</find><replace>new text</replace></edit>
 *   <delete path="/old.js" />
 *
 * Edits are applied here on the server against the files the browser sent, and only
 * the changed files go back, so the browser just writes them into the editor.
 */

export type ProjectFiles = Record<string, string>;

export type BuildOp =
  | { type: "write"; path: string; content: string }
  | { type: "replace"; path: string; find: string; replace: string }
  | { type: "delete"; path: string };

export interface ParsedReply {
  reply: string;
  ops: BuildOp[];
}

export interface ApplyResult {
  /** Changed files: new content, or null when the file was deleted. */
  changed: Record<string, string | null>;
  /** Edits that could not be applied, in plain words. */
  skipped: string[];
}

export const LIMITS = {
  maxFiles: 60,
  maxFileBytes: 200_000,
  maxTotalBytes: 400_000,
  maxPathLength: 120,
};

/** Sandpack paths start with "/". Rejects anything that climbs out or looks odd. */
export function normalizePath(raw: string): string | null {
  let p = raw.trim().replace(/\\/g, "/");
  if (!p) return null;
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > LIMITS.maxPathLength) return null;
  if (p.split("/").some((seg) => seg === ".." || seg === ".")) return null;
  if (!/^[\w./@-]+$/.test(p)) return null;
  if (p.endsWith("/")) return null;
  return p;
}

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`)) ?? tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`));
  return m ? m[1] : null;
};

/** Drops one leading and one trailing newline, which models add around block content. */
function trimBlock(text: string): string {
  return text.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

/** Removes a markdown fence the model may wrap around a whole file. */
function unfence(text: string): string {
  const m = text.match(/^\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```\s*$/);
  return m ? m[1] : text;
}

export function parseBuildReply(raw: string): ParsedReply {
  const ops: BuildOp[] = [];
  // Ignore anything inside <think> blocks some models emit.
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "");

  const re = /<file\b([^>]*)>([\s\S]*?)<\/file>|<edit\b([^>]*)>([\s\S]*?)<\/edit>|<delete\b([^>]*?)\/?>(?:\s*<\/delete>)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) {
      const path = normalizePath(attr(m[1], "path") ?? "");
      if (path) ops.push({ type: "write", path, content: unfence(trimBlock(m[2])) });
    } else if (m[3] !== undefined) {
      const path = normalizePath(attr(m[3], "path") ?? "");
      const find = m[4].match(/<find>([\s\S]*?)<\/find>/);
      const replace = m[4].match(/<replace>([\s\S]*?)<\/replace>/);
      if (path && find && replace) ops.push({ type: "replace", path, find: trimBlock(find[1]), replace: trimBlock(replace[1]) });
    } else if (m[5] !== undefined) {
      const path = normalizePath(attr(m[5], "path") ?? "");
      if (path) ops.push({ type: "delete", path });
    }
  }

  const replyMatch = text.match(/<reply>([\s\S]*?)<\/reply>/);
  let reply = replyMatch ? replyMatch[1].trim() : "";
  if (!reply) {
    // No reply tag: use whatever prose sits outside the tags.
    reply = text.replace(re, "").replace(/<\/?reply>/g, "").trim();
  }
  if (!reply) reply = ops.length ? "Done." : "I couldn't make a change from that. Try saying it another way.";
  return { reply: reply.slice(0, 4000), ops };
}

/** Collapses runs of spaces and tabs so small indentation slips still match. */
function looseIndex(haystack: string, needle: string): { start: number; end: number } | null {
  const esc = needle
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  if (!esc) return null;
  const re = new RegExp(esc, "g");
  const first = re.exec(haystack);
  if (!first) return null;
  if (re.exec(haystack)) return null; // ambiguous
  return { start: first.index, end: first.index + first[0].length };
}

export function applyOps(files: ProjectFiles, ops: BuildOp[]): ApplyResult {
  const work: Record<string, string | null> = { ...files };
  const changed: Record<string, string | null> = {};
  const skipped: string[] = [];

  for (const op of ops) {
    if (op.type === "write") {
      if (op.content.length > LIMITS.maxFileBytes) {
        skipped.push(`${op.path} is too large to write.`);
        continue;
      }
      work[op.path] = op.content;
      changed[op.path] = op.content;
    } else if (op.type === "delete") {
      if (work[op.path] == null) continue;
      work[op.path] = null;
      changed[op.path] = null;
    } else {
      const current = work[op.path];
      if (current == null) {
        skipped.push(`${op.path} doesn't exist, so the edit was skipped.`);
        continue;
      }
      const first = current.indexOf(op.find);
      if (op.find && first !== -1 && current.indexOf(op.find, first + 1) === -1) {
        const next = current.slice(0, first) + op.replace + current.slice(first + op.find.length);
        work[op.path] = next;
        changed[op.path] = next;
        continue;
      }
      const loose = looseIndex(current, op.find);
      if (loose) {
        const next = current.slice(0, loose.start) + op.replace + current.slice(loose.end);
        work[op.path] = next;
        changed[op.path] = next;
        continue;
      }
      skipped.push(`An edit to ${op.path} didn't match the current code.`);
    }
  }
  return { changed, skipped };
}

export function buildSystemPrompt(): string {
  return `You are the coding partner in Sutaeru's Build mode. The person describes what they want and you change a small React project that runs live in their browser (Sandpack). They see your changes in a preview straight away.

How to answer:
- Start with <reply>...</reply>: one or two plain sentences saying what you changed. No code in the reply.
- Then the changes, using only these tags:
  <file path="/App.js">the whole new file</file>  for new files or big rewrites
  <edit path="/App.js"><find>exact text copied from the current file</find><replace>new text</replace></edit>  for small changes
  <delete path="/old.js" />
- Prefer <edit> for small changes: it is faster. The <find> text must appear exactly once in the file; include a few surrounding lines to make it unique.
- Never wrap code in markdown fences. Never write anything after the last tag.
- Paths start with "/". The entry is /index.js, which renders /App.js. Styles go in /styles.css.
- To use an npm package, add it to "dependencies" in /package.json (write the whole file) and import it.
- This runs in the browser only: no server, no database, no secrets, no Node APIs. Use fetch against public APIs, or fake data, when the person asks for backend features, and say so in the reply.
- Make it look good by default: clean layout, real spacing, readable type, works on a phone.
- If the person only asks a question, answer in <reply> and change nothing.`;
}

export function buildUserPrompt(files: ProjectFiles, instruction: string, active?: string): string {
  const listing = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, code]) => `<current path="${path}">\n${code}\n</current>`)
    .join("\n\n");
  return `Current project files:\n\n${listing}\n\n${active ? `The person has ${active} open.\n\n` : ""}Request: ${instruction}`;
}
