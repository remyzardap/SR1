/**
 * What an admin needs to know about the invite links they made (T-74 / F-12).
 *
 * The router's `admin.betaInvites.listCodes` hands back raw rows: counters, a foreign
 * key and two timestamps. A person sharing links cannot read a `usageCount` and decide
 * whether to send that link again, so the rows are turned into one plain word here.
 *
 * Pure, and given the clock, so the rules can be tested in the node test environment.
 * The checks follow the same order the server uses when it accepts a code
 * (active, then time, then usage), so the screen and the server never disagree.
 */

/** The fields this module reads from a code row — everything else is ignored. */
export interface InviteCodeRow {
  code: string;
  usageCount: number | null;
  maxUses?: number | null;
  usedBy?: number | null;
  isActive?: boolean | null;
  expiresAt?: Date | string | null;
  createdAt?: Date | string | null;
}

/** The one word an admin sees, plus the tone that colour is applied to it. */
export type InviteCodeState = "open" | "used" | "expired" | "switchedOff";

export interface InviteCodeStatus {
  state: InviteCodeState;
  /** Plain words for the screen. Never a counter, never a column name. */
  label: string;
}

const STATUSES: Record<InviteCodeState, InviteCodeStatus> = {
  open: { state: "open", label: "Not used yet" },
  used: { state: "used", label: "Used" },
  expired: { state: "expired", label: "Expired" },
  switchedOff: { state: "switchedOff", label: "Switched off" },
};

function toTime(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * How many people got in with this link.
 *
 * `usedBy` is set by the server at the same time as the counter, but an older row can
 * carry one without the other, so the honest reading is whichever is greater.
 */
export function inviteUsageCount(row: InviteCodeRow): number {
  return Math.max(row.usageCount ?? 0, row.usedBy != null ? 1 : 0);
}

/**
 * The status of one code, as of `now`.
 *
 * A code that someone has already used reads as "Used" even when it has uses left,
 * because the question an admin is asking is "can I still send this one?"
 */
export function inviteCodeStatus(row: InviteCodeRow, now: Date = new Date()): InviteCodeStatus {
  if (row.isActive === false) return STATUSES.switchedOff;

  const expiresAt = toTime(row.expiresAt);
  if (expiresAt !== null && expiresAt <= now.getTime()) return STATUSES.expired;

  return inviteUsageCount(row) > 0 ? STATUSES.used : STATUSES.open;
}

/**
 * How much of the link has been used, in a sentence: "nobody has used it yet",
 * "1 person used it of 2", "3 people used it".
 */
export function describeInviteUsage(row: InviteCodeRow): string {
  const used = inviteUsageCount(row);
  if (used === 0) return "nobody has used it yet";
  const people = used === 1 ? "1 person" : `${used} people`;
  const limit = row.maxUses == null ? null : row.maxUses;
  return limit != null ? `${people} used it of ${limit}` : `${people} used it`;
}

/** Newest first — the link you just made is the one you want to send. */
export function sortCodesNewestFirst<T extends InviteCodeRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const aTime = toTime(a.createdAt) ?? 0;
    const bTime = toTime(b.createdAt) ?? 0;
    return bTime - aTime;
  });
}
