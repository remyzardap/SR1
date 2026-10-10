import { describe, expect, it } from "vitest";
import { cn, formatCurrency, formatDate, statusColor, statusLabel } from "./utils";

describe("cn", () => {
  it("drops falsy classes and resolves the last conflicting utility", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", false && "text-lg", "font-bold")).toBe("text-sm font-bold");
    expect(cn()).toBe("");
  });
});

describe("formatDate", () => {
  it("keeps an empty date readable as a dash", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
    expect(formatDate("")).toBe("-");
  });

  it("uses day-month-year order for a real date", () => {
    expect(formatDate("2026-03-05")).toBe("05 Mar 2026");
    expect(formatDate(new Date("2026-12-31T12:00:00Z"))).toBe("31 Dec 2026");
  });
});

describe("formatCurrency", () => {
  it("defaults to rupiah with no decimals", () => {
    expect(formatCurrency(1500).replace(/\s/g, "")).toBe("Rp1.500");
    expect(formatCurrency(1500.6).replace(/\s/g, "")).toBe("Rp1.501");
  });

  it("formats other currencies through en-US", () => {
    expect(formatCurrency(7.5, "USD")).toBe("$7.50");
  });
});

describe("statusColour", () => {
  it("maps every known review status to its own family", () => {
    expect(statusColor("approved")).toContain("green");
    expect(statusColor("needs_review")).toContain("amber");
    expect(statusColor("rejected")).toContain("red");
    expect(statusColor("auto")).toContain("blue");
  });

  it("falls back to grey for anything else", () => {
    expect(statusColor("draft")).toContain("gray");
    expect(statusColor("")).toContain("gray");
  });

  it("labels the statuses the UI shortens", () => {
    expect(statusLabel("needs_review")).toBe("Review");
    expect(statusLabel("approved")).toBe("Approved");
    expect(statusLabel("rejected")).toBe("Rejected");
    expect(statusLabel("auto")).toBe("Auto");
  });

  it("passes an unknown status through rather than hiding it", () => {
    expect(statusLabel("archived")).toBe("archived");
  });
});
