/**
 * Short, locale-aware "edited 2 h ago" stamps for the list pages (Files, Memories).
 * Dates older than a week fall back to the plain date so an old row never reads
 * "edited 400 days ago".
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function relativeTime(value: Date | string | null | undefined, now: Date = new Date()): string {
  if (!value) return "unknown";
  const date = typeof value === "string" ? new Date(value) : value;
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return "unknown";

  const diff = now.getTime() - ms;
  // A future timestamp (clock skew) reads as "just now" rather than "-3 h ago".
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 2 * DAY) return "yesterday";
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
  return formatDate(date);
}
