/**
 * Live activity feed for Kemma runs.
 *
 * Turns raw tool start/end events into human-readable timeline entries that the
 * chat UI can render while the agent works (SSE event "activity"). Pure functions,
 * no I/O, so they are cheap to test.
 */

export type ActivityKind = "search" | "read" | "code" | "file" | "drive" | "skill" | "think" | "write" | "tool";
export type ActivityStatus = "running" | "done" | "error";

export interface ActivitySource {
  title: string;
  url: string;
  host: string;
}

export interface ActivityEvent {
  /** Stable per tool call so the client can update the same row from running to done. */
  id: string;
  kind: ActivityKind;
  status: ActivityStatus;
  label: string;
  detail?: string;
  sources?: ActivitySource[];
  durationMs?: number;
}

const MAX_SOURCES = 8;
const MAX_DETAIL = 140;

function clip(text: string, max = MAX_DETAIL): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function str(input: unknown, key: string): string {
  const v = (input as Record<string, unknown> | null)?.[key];
  return typeof v === "string" ? v : "";
}

/** Entry shown the moment a tool starts. */
export function describeToolStart(id: string, tool: string, input: unknown): ActivityEvent {
  switch (tool) {
    case "web_search":
      return { id, kind: "search", status: "running", label: "Searching the web", detail: clip(str(input, "query")) };
    case "browse": {
      const url = str(input, "url");
      return { id, kind: "read", status: "running", label: `Reading ${hostOf(url) || "page"}`, detail: clip(url) };
    }
    case "run_code":
      return { id, kind: "code", status: "running", label: `Running ${str(input, "language") === "nodejs" ? "Node.js" : "Python"} code` };
    case "generate_file":
      return { id, kind: "file", status: "running", label: "Creating file", detail: clip(str(input, "filename")) };
    case "safe_files":
      return { id, kind: "file", status: "running", label: "Working with files" };
    case "load_skill":
    case "read_skill_file":
    case "run_skill_script":
      return { id, kind: "skill", status: "running", label: "Using a skill", detail: clip(str(input, "name")) };
    default:
      if (tool.startsWith("drive_")) {
        return { id, kind: "drive", status: "running", label: "Checking Google Drive" };
      }
      return { id, kind: "tool", status: "running", label: `Running ${tool}` };
  }
}

function unwrap(result: unknown): { ok: boolean; data: unknown; error?: string } {
  const r = result as { success?: boolean; data?: unknown; error?: unknown } | null;
  if (r && typeof r === "object" && "success" in r) {
    return { ok: r.success !== false, data: r.data, error: typeof r.error === "string" ? r.error : undefined };
  }
  const err = r && typeof r === "object" && typeof (r as { error?: unknown }).error === "string" ? (r as { error: string }).error : undefined;
  return { ok: !err, data: result, error: err };
}

function toSources(tool: string, data: unknown): ActivitySource[] {
  if (tool === "web_search" && Array.isArray(data)) {
    return data
      .filter((item: any) => item?.url)
      .slice(0, MAX_SOURCES)
      .map((item: any) => ({ title: clip(String(item.title || hostOf(item.url) || "Result"), 90), url: String(item.url), host: hostOf(String(item.url)) }));
  }
  if (tool === "browse") {
    const r = data as { url?: string; title?: string } | null;
    if (r?.url) return [{ title: clip(String(r.title || hostOf(r.url) || "Page"), 90), url: r.url, host: hostOf(r.url) }];
  }
  return [];
}

/** Entry shown when a tool finishes (same id as its start entry). */
export function describeToolEnd(id: string, tool: string, input: unknown, result: unknown, durationMs: number): ActivityEvent {
  const start = describeToolStart(id, tool, input);
  const { ok, data, error } = unwrap(result);
  if (!ok) {
    return { ...start, status: "error", detail: clip(error || "Failed"), durationMs };
  }
  const sources = toSources(tool, data);
  const total = tool === "web_search" && Array.isArray(data) ? data.filter((item: any) => item?.url).length : sources.length;
  const label =
    tool === "web_search" ? (total > 0 ? `Found ${total} source${total === 1 ? "" : "s"}` : "Search finished") : start.label;
  return { ...start, status: "done", label, ...(sources.length > 0 ? { sources } : {}), durationMs };
}

/** Entry for the model thinking between tool calls, and for the final write-up. */
export function describePhase(id: string, kind: "think" | "write", status: ActivityStatus = "running"): ActivityEvent {
  return kind === "think"
    ? { id, kind, status, label: "Thinking" }
    : { id, kind, status, label: "Writing the answer" };
}
