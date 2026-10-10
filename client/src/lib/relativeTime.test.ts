import { describe, expect, it } from "vitest";
import { relativeTime } from "./relativeTime";

const NOW = new Date("2026-03-05T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("says unknown for nothing and for garbage", () => {
    expect(relativeTime(null, NOW)).toBe("unknown");
    expect(relativeTime(undefined, NOW)).toBe("unknown");
    expect(relativeTime("", NOW)).toBe("unknown");
    expect(relativeTime("not a date", NOW)).toBe("unknown");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(relativeTime(ago(5 * MINUTE).toISOString(), NOW)).toBe("5 min ago");
  });

  it("reads a clock that is ahead as just now", () => {
    expect(relativeTime(new Date(NOW.getTime() + 3 * HOUR), NOW)).toBe("just now");
    expect(relativeTime(NOW, NOW)).toBe("just now");
  });

  it("steps through minutes, hours, yesterday and days at the boundaries", () => {
    expect(relativeTime(ago(59_999), NOW)).toBe("just now");
    expect(relativeTime(ago(MINUTE), NOW)).toBe("1 min ago");
    expect(relativeTime(ago(59 * MINUTE), NOW)).toBe("59 min ago");
    expect(relativeTime(ago(HOUR), NOW)).toBe("1 h ago");
    expect(relativeTime(ago(23 * HOUR + 59 * MINUTE), NOW)).toBe("23 h ago");
    expect(relativeTime(ago(DAY), NOW)).toBe("yesterday");
    expect(relativeTime(ago(2 * DAY - 1), NOW)).toBe("yesterday");
    expect(relativeTime(ago(2 * DAY), NOW)).toBe("2 days ago");
    expect(relativeTime(ago(7 * DAY - 1), NOW)).toBe("6 days ago");
  });

  it("falls back to the plain date after a week, never days-count", () => {
    const old = new Date("2026-01-01T00:00:00.000Z");
    expect(relativeTime(old, NOW)).toBe(
      old.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    );
    expect(relativeTime(old, NOW)).not.toMatch(/ago/);
  });

  it("stamps the value's own date after a week, not a count of days", () => {
    const week = ago(7 * DAY);
    expect(relativeTime(week, NOW)).toBe(
      week.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    );
    expect(relativeTime(week, NOW)).not.toMatch(/7 days ago/);
  });
});
