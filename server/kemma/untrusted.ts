/**
 * Untrusted content fencing and heuristic prompt-injection detection (P1-10).
 *
 * Wraps content from external sources (web_search, browse, drive_read, email/calendar
 * reads, MCP tools) in XML-style `<untrusted_content>` tags, escapes closing tags inside
 * the content to prevent breakout, and detects suspected prompt injection heuristics.
 */

export const UNTRUSTED_TOOLS = [
  "web_search",
  "browse",
  "drive_read",
] as const;

export const DEFAULT_KNOWN_TOOLS: readonly string[] = [
  "safe_files",
  "web_search",
  "browse",
  "run_code",
  "generate_file",
  "phone_scan",
  "vps_files",
  "drive_search",
  "drive_read",
  "drive_create",
  "drive_edit",
  "drive_move",
  "load_skill",
  "read_skill_file",
  "run_skill_script",
  "email_search",
  "email_read",
  "email_send",
  "calendar_list",
  "calendar_create",
] as const;

/**
 * Determines whether a tool's output comes from outside sources and must be fenced.
 * Tools whose output comes from outside (web_search, browse, drive_read, email and calendar reads,
 * every mcp__* tool, read_skill_file excluded) are wrapped.
 */
export function isUntrustedTool(toolName: string): boolean {
  if (toolName === "read_skill_file") return false;
  if (toolName.startsWith("mcp__")) return true;
  if (toolName === "web_search" || toolName === "browse" || toolName === "drive_read") return true;
  if (
    toolName.startsWith("email_") &&
    (toolName.includes("read") || toolName.includes("search") || toolName.includes("get") || toolName.includes("list"))
  ) {
    return true;
  }
  if (
    toolName.startsWith("calendar_") &&
    (toolName.includes("read") || toolName.includes("list") || toolName.includes("get") || toolName.includes("search"))
  ) {
    return true;
  }
  return false;
}

/**
 * Escapes any occurrence of `</untrusted_content` inside the content to prevent breaking out of the fence.
 */
export function escapeClosingTag(content: string): string {
  return content.replace(/<\/\s*untrusted_content/gi, "&lt;/untrusted_content");
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Derives a human-readable / URI source descriptor for a tool call.
 */
export function extractToolSource(toolName: string, args: unknown, result?: unknown): string {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const r = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;

  if (typeof a.url === "string" && a.url.trim()) return a.url.trim();
  if (typeof r.url === "string" && r.url.trim()) return r.url.trim();
  if (typeof r.finalUrl === "string" && r.finalUrl.trim()) return r.finalUrl.trim();

  if (typeof a.query === "string" && a.query.trim()) return a.query.trim();

  if (typeof a.fileId === "string" && a.fileId.trim()) return a.fileId.trim();
  if (typeof a.id === "string" || typeof a.id === "number") return String(a.id);

  if (typeof a.uri === "string" && a.uri.trim()) return a.uri.trim();
  if (typeof a.path === "string" && a.path.trim()) return a.path.trim();

  if (typeof r.fileId === "string" && r.fileId.trim()) return r.fileId.trim();
  if (typeof r.name === "string" && r.name.trim()) return r.name.trim();

  return toolName;
}

const INJECTION_PATTERNS: RegExp[] = [
  // 1. "ignore (all|previous) instructions", disregard, forget, bypass
  /\b(?:ignore|disregard|forget|bypass)\s+(?:all\s+|previous\s+|prior\s+|above\s+|system\s+|your\s+)*(?:instructions|rules|prompts|directives|commands)\b/i,
  // 2. "you are now", "act as", "from now on you are"
  /\byou\s+are\s+now\b/i,
  /\bfrom\s+now\s+on\s*,\s*(?:you\s+are|act\s+as)\b/i,
  /\bact\s+as\s+(?:a|an)?\s*(?:unrestricted|dan|jailbreak|developer|admin|system)\b/i,
  // 3. "system prompt", "system instructions", "system message", "developer instructions"
  /\bsystem\s+prompt\b/i,
  /\bsystem\s+instructions\b/i,
  /\bdeveloper\s+mode\b/i,
  // 4. "call the tool", "call a tool", "execute the tool", "run the tool", "invoke the tool", "use the tool"
  /\b(?:call|run|execute|use|invoke|trigger)\s+(?:the\s+|a\s+)?tool\b/i,
];

export interface InjectionDetectionResult {
  injectionSuspected: boolean;
  match?: string;
  reason?: string;
}

/**
 * Heuristic detector for prompt injection in external content.
 * Checks for phrases like "ignore (all|previous) instructions", "you are now",
 * "system prompt", "call the tool", or imperative verbs next to registered tools.
 */
export function detectInjection(
  text: string,
  options?: { knownTools?: readonly string[] }
): InjectionDetectionResult {
  if (!text || typeof text !== "string") {
    return { injectionSuspected: false };
  }

  // 1. Check fixed injection phrases
  for (const pattern of INJECTION_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      return { injectionSuspected: true, match: m[0], reason: `Matched pattern: ${m[0]}` };
    }
  }

  // 2. Check imperative verbs next to registered tools
  const tools = options?.knownTools ?? DEFAULT_KNOWN_TOOLS;
  const toolPattern = tools
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const toolRegex = new RegExp(
    `\\b(?:call|run|execute|invoke|trigger)\\s+(?:the\\s+)?(?:tool\\s+)?(${toolPattern}|mcp__\\w+)\\b`,
    "i"
  );
  const toolMatch = text.match(toolRegex);
  if (toolMatch) {
    return { injectionSuspected: true, match: toolMatch[0], reason: `Imperative verb next to tool: ${toolMatch[0]}` };
  }

  const useToolRegex = new RegExp(
    `\\buse\\s+(?:the\\s+)?tool\\s+(${toolPattern}|mcp__\\w+)\\b`,
    "i"
  );
  const useToolMatch = text.match(useToolRegex);
  if (useToolMatch) {
    return { injectionSuspected: true, match: useToolMatch[0], reason: `Imperative use of tool: ${useToolMatch[0]}` };
  }

  return { injectionSuspected: false };
}

export interface WrapUntrustedOptions {
  tool: string;
  source: string;
  content: unknown;
  injectionSuspected?: boolean;
}

/**
 * Wraps content in `<untrusted_content tool="..." source="..."[ injection_suspected="true"]>...</untrusted_content>`.
 * Escapes any `</untrusted_content` inside the content.
 */
export function wrapUntrustedContent(options: WrapUntrustedOptions): string {
  const { tool, source, content, injectionSuspected } = options;
  const rawString = typeof content === "string" ? content : JSON.stringify(content);
  const escaped = escapeClosingTag(rawString);
  const toolAttr = escapeXmlAttr(tool);
  const sourceAttr = escapeXmlAttr(source);
  const suspectedAttr = injectionSuspected ? ' injection_suspected="true"' : "";
  return `<untrusted_content tool="${toolAttr}" source="${sourceAttr}"${suspectedAttr}>${escaped}</untrusted_content>`;
}

export interface UnwrappedContent {
  isFenced: boolean;
  tool?: string;
  source?: string;
  injectionSuspected?: boolean;
  content: string;
}

/**
 * Unwraps an `<untrusted_content>` block, extracting attributes and inner content.
 */
export function unwrapUntrustedContent(fencedText: string): UnwrappedContent {
  const match = fencedText.match(
    /^<untrusted_content\s+tool="([^"]*)"\s+source="([^"]*)"(?:\s+injection_suspected="([^"]*)")?>([\s\S]*?)<\/untrusted_content>$/
  );
  if (!match) {
    return { isFenced: false, content: fencedText };
  }
  const [, tool, source, suspected, innerContent] = match;
  return {
    isFenced: true,
    tool,
    source,
    injectionSuspected: suspected === "true",
    content: innerContent,
  };
}
