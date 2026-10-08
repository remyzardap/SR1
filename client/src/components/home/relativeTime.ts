/**
 * The time shown at the right of a RECENTLY UPDATED row. The prototype writes these
 * strings by hand ("Now", "Just now", "Yesterday", "2 days ago"), so the real clock
 * is phrased the same way instead of dropping in a timestamp.
 */
export function relativeTime(value: number | Date | null | undefined, now: number = Date.now()): string {
  if (value === null || value === undefined) return "";
  const at = typeof value === "number" ? value : value.getTime();
  if (!Number.isFinite(at)) return "";
  const diff = Math.max(0, now - at);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(at).toLocaleDateString();
}
