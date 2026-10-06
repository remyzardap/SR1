/**
 * Numbered citations (F-03).
 *
 * The answer text cites sources as `[2]`, `[2][5]` or `[2, 5]`. Since P1-07 only the *cited*
 * sources are sent and their ids are stable, so a list can read 2, 5, 9 and a chip must point at
 * the card with the same number — never at a position. Every number in the UI therefore comes
 * from `citationNumberFor`: the server's id, or `index + 1` for older payloads without ids.
 *
 * The rehype plugin runs on hast (after markdown has been parsed), so markdown links are already
 * `<a>` nodes and only their label text is ever seen here; `[n]` inside `code`/`pre`/`a` is left
 * exactly as written. Raw markdown is never regexed.
 */

import type { ActivityItem } from "@/components/ActivityFeed";
import type { Source } from "./streamReducer";

/** Same marker grammar as the server's citation parser (`server/kemma/sources.ts`), plus a guard
 *  so `[2](url)` — a markdown link whose label happens to be a number — is not turned into a chip. */
const MARKER = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\](?!\()/g;

/** The subtrees whose text is never a citation: code as written, and link labels — a chip inside an
 *  `<a>` would be a nested anchor, which is both invalid HTML and unreadable. */
const VERBATIM_TAGS = new Set(["code", "pre", "a"]);

export interface HastText {
  type: "text";
  value: string;
}

export interface HastElement {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
}

/** `root`, or any container node we walk into without caring about its kind. */
export interface HastParent {
  type: string;
  children: HastNode[];
}

export type HastNode = HastText | HastElement | HastParent;

export interface HastRoot extends HastParent {
  type: "root";
}

/** Props the plugin puts on a chip node; `CitationChip.tsx` reads them. Names stay single lowercase
 *  words: hast-util-to-jsx-runtime lowercases unrecognised property names, so camelCase would drift. */
export interface CitationChipProps {
  number: number;
  /** DOM id of the source card this chip jumps to. */
  anchor: string;
  href: string;
  title: string;
  host: string;
  snippet?: string;
}

export interface CitationOptions {
  sources: Source[];
  /** Scoped so two answers on screen cannot share an anchor. */
  messageId: string;
}

function isText(node: HastNode): node is HastText {
  return node.type === "text" && typeof (node as HastText).value === "string";
}

function isElement(node: HastNode): node is HastElement {
  return node.type === "element" && typeof (node as HastElement).tagName === "string";
}

function isContainer(node: HastNode): node is HastParent {
  return !isText(node) && Array.isArray((node as HastParent).children);
}

/** `hostname` without the `www.`, or "" when the url is unparseable. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The number a source is shown by: its stable id, else its position. */
export function citationNumberFor(source: Source, index: number): number {
  return source.id ?? index + 1;
}

/** Sources with their display number, ordered by it — cards and chips share this one list. */
export function numberedSources(sources: Source[]): Array<{ source: Source; number: number }> {
  return sources
    .map((source, index) => ({ source, number: citationNumberFor(source, index) }))
    .sort((a, b) => a.number - b.number);
}

export function sourceForNumber(sources: Source[], number: number): Source | undefined {
  const found = sources.findIndex((source, index) => citationNumberFor(source, index) === number);
  return found === -1 ? undefined : sources[found];
}

export function citationAnchorId(messageId: string, number: number): string {
  return `src-${messageId}-${number}`;
}

/** `"2, 5"` / `"3"` → `[2, 5]` / `[3]`; null when any part isn't a plain 1-3 digit number. */
export function parseCitationList(inner: string): number[] | null {
  const parts = inner.split(/[,;]/);
  const numbers: number[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!/^\d{1,3}$/.test(trimmed)) return null;
    numbers.push(Number(trimmed));
  }
  return numbers.length > 0 ? numbers : null;
}

export function citationChipProps(number: number, source: Source, messageId: string): CitationChipProps {
  const anchor = citationAnchorId(messageId, number);
  return {
    number,
    anchor,
    href: `#${anchor}`,
    title: source.title,
    host: hostOf(source.url),
    ...(source.snippet ? { snippet: source.snippet } : {}),
  };
}

function chipNode(number: number, source: Source, messageId: string): HastElement {
  const props = citationChipProps(number, source, messageId);
  return {
    type: "element",
    // Lowercase single word, so it resolves through Streamdown's `components` map rather than
    // shadowing an HTML tag (overriding `sup`/`a` would degrade every other superscript and link).
    tagName: "citationchip",
    properties: { ...props },
    children: [{ type: "text", value: String(number) }],
  };
}

/** Replaces citation markers in one text node; unmatched numbers stay plain text. */
function splitCitations(node: HastText, options: CitationOptions): HastNode[] {
  const out: HastNode[] = [];
  let copied = 0;
  let last = 0;

  for (const match of node.value.matchAll(MARKER)) {
    const numbers = parseCitationList(match[1]);
    if (!numbers) continue;
    const sources = numbers.map((number) => sourceForNumber(options.sources, number));
    // One unknown number keeps the whole marker as written: a half-linked "[2, 7]" reads worse
    // than plain text, and the answer's own punctuation stays intact.
    if (sources.some((source) => source === undefined)) continue;

    if (match.index > last) out.push({ type: "text", value: node.value.slice(last, match.index) });
    numbers.forEach((number, i) => out.push(chipNode(number, sources[i] as Source, options.messageId)));
    copied += 1;
    last = match.index + match[0].length;
  }

  if (copied === 0) return [node];
  if (last < node.value.length) out.push({ type: "text", value: node.value.slice(last) });
  return out;
}

function walk(parent: HastParent, options: CitationOptions, verbatim: boolean): void {
  const next: HastNode[] = [];

  for (const node of parent.children) {
    if (isText(node)) {
      if (verbatim) {
        next.push(node);
      } else {
        next.push(...splitCitations(node, options));
      }
      continue;
    }

    if (isContainer(node)) {
      walk(node, options, verbatim || (isElement(node) && VERBATIM_TAGS.has(node.tagName)));
    }
    next.push(node);
  }

  parent.children = next;
}

/**
 * Rehype plugin factory: turn `[n]` markers into `<citationchip>` nodes linking to the cards.
 *
 * With no sources it is a no-op, which is what keeps a streaming answer's numbers as plain text
 * until the `sources` event arrives, so nothing reflows.
 */
export function createCitationPlugin(options: CitationOptions) {
  return function citations(tree: HastRoot): void {
    if (!options.sources || options.sources.length === 0) return;
    walk(tree, options, false);
  };
}

/** What P1-07 persists per message; only the two fields the chat UI can render are read here. */
export interface HistoryMetadata {
  sources?: unknown;
  activity?: unknown;
}

export interface HistoryMessage {
  sources?: Source[];
  activity?: ActivityItem[];
}

function decodedSources(value: unknown): Source[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources: Source[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.url !== "string") continue;
    sources.push({
      title: typeof raw.title === "string" ? raw.title : "",
      url: raw.url,
      ...(typeof raw.id === "number" ? { id: raw.id } : {}),
      ...(typeof raw.snippet === "string" && raw.snippet ? { snippet: raw.snippet } : {}),
    });
  }
  return sources;
}

/** Persisted activity is the compact `{ tool, label, status, ms }` row, not a live ActivityItem. */
function decodedActivity(value: unknown): ActivityItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: ActivityItem[] = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const tool = typeof raw.tool === "string" ? raw.tool : "";
    const label = typeof raw.label === "string" ? raw.label : tool;
    if (!label) return;
    items.push({
      id: `history-${index}`,
      kind: activityKindForTool(tool),
      status: raw.status === "error" ? "error" : "done",
      label,
      ...(typeof raw.ms === "number" ? { durationMs: raw.ms } : {}),
    });
  });
  return items;
}

/** The saved row keeps the tool name, which is enough to pick the icon the live feed would use. */
function activityKindForTool(tool: string): ActivityItem["kind"] {
  switch (tool) {
    case "web_search":
      return "search";
    case "browse":
      return "read";
    case "run_code":
      return "code";
    case "generate_file":
    case "vps_files":
    case "files":
      return "file";
    case "drive":
    case "gdrive":
      return "drive";
    case "skill":
      return "skill";
    default:
      return "tool";
  }
}

/**
 * Restores sources and activity onto a history message (F-03 item 4).
 *
 * Messages saved before P1-07 have no metadata and are returned untouched — same object, so the
 * caller can tell nothing changed.
 */
export function applyHistoryMetadata<T extends HistoryMessage>(
  message: T,
  metadata: HistoryMetadata | null | undefined
): T {
  if (!metadata) return message;
  const sources = decodedSources(metadata.sources);
  const activity = decodedActivity(metadata.activity);
  if (!sources && !activity) return message;

  return {
    ...message,
    ...(sources ? { sources } : {}),
    ...(activity ? { activity } : {}),
  };
}
