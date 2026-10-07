import { describe, expect, it } from "vitest";

import {
  describeInviteUsage,
  inviteCodeStatus,
  inviteUsageCount,
  sortCodesNewestFirst,
  type InviteCodeRow,
} from "./inviteCodes";

const NOW = new Date("2026-02-01T12:00:00.000Z");

function row(overrides: Partial<InviteCodeRow> = {}): InviteCodeRow {
  return {
    code: "AB3DEFGHIJKL",
    usageCount: 0,
    maxUses: null,
    usedBy: null,
    isActive: true,
    expiresAt: null,
    createdAt: new Date("2026-01-30T09:00:00.000Z"),
    ...overrides,
  };
}

describe("invite code status", () => {
  it("reads a link nobody has used yet as not used", () => {
    expect(inviteCodeStatus(row(), NOW)).toEqual({ state: "open", label: "Not used yet" });
  });

  it("reads a link that one person used as used", () => {
    expect(inviteCodeStatus(row({ usageCount: 1 }), NOW).state).toBe("used");
  });

  it("trusts usedBy when the counter did not catch up", () => {
    const link = row({ usageCount: 0, usedBy: 7 });
    expect(inviteUsageCount(link)).toBe(1);
    expect(inviteCodeStatus(link, NOW).state).toBe("used");
  });

  it("reports a switched-off link even if it was never used", () => {
    expect(inviteCodeStatus(row({ isActive: false }), NOW)).toEqual({
      state: "switchedOff",
      label: "Switched off",
    });
  });

  it("reports a link past its time as expired", () => {
    expect(inviteCodeStatus(row({ expiresAt: new Date("2026-01-31T00:00:00.000Z") }), NOW).state).toBe(
      "expired",
    );
  });

  it("reads an expiry given as text, not only as a date", () => {
    expect(inviteCodeStatus(row({ expiresAt: "2026-01-31T00:00:00.000Z" }), NOW).state).toBe("expired");
    expect(inviteCodeStatus(row({ expiresAt: "2026-03-01T00:00:00.000Z" }), NOW).state).toBe("open");
  });

  it("treats the exact moment a link runs out as already run out", () => {
    expect(inviteCodeStatus(row({ expiresAt: NOW }), NOW).state).toBe("expired");
  });

  it("switched off beats expired, which beats used", () => {
    const dead = row({ isActive: false, expiresAt: "2020-01-01", usageCount: 4 });
    expect(inviteCodeStatus(dead, NOW).state).toBe("switchedOff");
    const expired = row({ expiresAt: "2020-01-01", usageCount: 4 });
    expect(inviteCodeStatus(expired, NOW).state).toBe("expired");
  });

  it("copes with a missing counter", () => {
    expect(inviteCodeStatus(row({ usageCount: null }), NOW).state).toBe("open");
  });

  it("says the states in plain words", () => {
    const labels = [
      inviteCodeStatus(row(), NOW).label,
      inviteCodeStatus(row({ usageCount: 2 }), NOW).label,
      inviteCodeStatus(row({ expiresAt: "2020-01-01" }), NOW).label,
      inviteCodeStatus(row({ isActive: false }), NOW).label,
    ];
    expect(labels).toEqual(["Not used yet", "Used", "Expired", "Switched off"]);
    for (const label of labels) {
      expect(label.toLowerCase()).not.toMatch(/model|token|error|active|null|usage|expired code/);
    }
  });
});

describe("usage sentence", () => {
  it("says nobody has used a fresh link", () => {
    expect(describeInviteUsage(row())).toBe("nobody has used it yet");
  });

  it("counts people, and the limit when there is one", () => {
    expect(describeInviteUsage(row({ usageCount: 1 }))).toBe("1 person used it");
    expect(describeInviteUsage(row({ usageCount: 1, maxUses: 2 }))).toBe("1 person used it of 2");
    expect(describeInviteUsage(row({ usageCount: 3, maxUses: 5 }))).toBe("3 people used it of 5");
  });
});

describe("code list order", () => {
  it("puts the newest link first", () => {
    const older = row({ code: "OLDER1", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const newer = row({ code: "NEWER2", createdAt: new Date("2026-02-01T00:00:00.000Z") });
    expect(sortCodesNewestFirst([older, newer]).map((r) => r.code)).toEqual(["NEWER2", "OLDER1"]);
  });

  it("leaves the list it was given alone", () => {
    const older = row({ code: "OLDER1", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const newer = row({ code: "NEWER2", createdAt: new Date("2026-02-01T00:00:00.000Z") });
    const input = [older, newer];
    sortCodesNewestFirst(input);
    expect(input.map((r) => r.code)).toEqual(["OLDER1", "NEWER2"]);
  });

  it("still orders links without a date", () => {
    const dated = row({ code: "DATED", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const undated = row({ code: "UNDATED", createdAt: null });
    expect(sortCodesNewestFirst([undated, dated]).map((r) => r.code)).toEqual(["DATED", "UNDATED"]);
  });
});
