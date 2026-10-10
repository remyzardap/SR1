/**
 * Fixtures for `/__lab/admin` and `/__lab/lists`.
 *
 * Lab-only: the app never imports this file. The admin screen and the list parts read
 * tRPC in the real app, so the lab brings its own people, links, events and numbers —
 * the shapes the queries return, with plausible values.
 */

import * as React from "react";

import type { AdminEvent, AdminHealth, AdminInvite, AdminPerson, AdminViewProps } from "@/components/admin/AdminView";
import type { RowProps, StripItem } from "@/components/list/ListView";
import { pickArt } from "@/lib/pickArt";

/* ── Admin ──────────────────────────────────────────────────────────────────────── */

const PEOPLE: AdminPerson[] = [
  { id: 1, name: "Rani Prameswari", email: "rani@sutaeru.app", role: "Admin", files: 42, joined: "12 JUL 2026", lastSeen: "NOW", live: true },
  { id: 2, name: "Bagus Wicaksono", email: "bagus@sutaeru.app", role: "Member", files: 17, joined: "3 AUG 2026", lastSeen: "12 MIN", live: true },
  { id: 3, name: "Sinta Halim", email: "sinta@studio.id", role: "Member", files: 0, joined: "19 AUG 2026", lastSeen: "YESTERDAY", live: false },
  { id: 4, name: "Dewi Lestari", email: "dewi@lestari.co.id", role: "Member", files: 5, joined: "2 SEP 2026", lastSeen: "3 H", live: false },
  { id: 5, name: "Adit Nugroho", email: "adit@example.com", role: "Member", files: 1, joined: "6 OCT 2026", lastSeen: "2 D", live: false },
];

const INVITES: AdminInvite[] = [
  { id: "c1", code: "KX7F-2M9Q", status: "Not used yet", state: "open", line: "nobody has used it yet", when: "Made 8 Oct 2026" },
  { id: "c2", code: "TR4B-88WD", status: "Used", state: "used", line: "2 people used it of 2", when: "Made 1 Oct 2026" },
  { id: "c3", code: "JJ2L-0P5X", status: "Expired", state: "expired", line: "1 person used it", when: "Made 14 SEP 2026 · runs out 4 OCT 2026" },
  { id: "c4", code: "QQ9V-3C1B", status: "Switched off", state: "switchedOff", line: "nobody has used it yet", when: "Made 22 SEP 2026" },
];

const EVENTS: AdminEvent[] = [
  { id: 1, when: "10 Oct 2026, 07:41", action: "user.login", user: "rani@sutaeru.app", severity: "info", ok: true },
  { id: 2, when: "10 Oct 2026, 07:12", action: "document.export", user: "bagus@sutaeru.app", severity: "info", ok: true },
  { id: 3, when: "9 Oct 2026, 22:03", action: "user.login", user: "unknown", severity: "warn", ok: false },
  { id: 4, when: "9 Oct 2026, 18:55", action: "connection.revoke", user: "sinta@studio.id", severity: "critical", ok: true },
  { id: 5, when: "9 Oct 2026, 11:20", action: "agent.run", user: "adit@example.com", severity: "info", ok: false },
];

const HEALTH: AdminHealth = { events: 1_284, failures: 17, critical: 2, last24h: 96 };

const STATS: StripItem[] = [
  { label: "Users", value: "5", meter: 4 / 5, meterLabel: "4 of 5 profiles set up" },
  { label: "Files", value: "65", meter: 3 / 5, meterLabel: "3 of 5 people have files" },
  { label: "Admins", value: "1", meter: 1 / 5, meterLabel: "1 of 5 are admins" },
  { label: "Active today", value: "2", meter: 2 / 5, meterLabel: "2 of 5 signed in today" },
];

export type AdminState = "default" | "loading" | "empty" | "failed";

const noop = () => {};

function adminFixtures(state: AdminState): AdminViewProps {
  const ready = state !== "loading";
  const rows = state === "empty" ? [] : undefined;
  const broken = state === "failed";
  return {
    stats: state === "empty" ? STATS.map((s) => ({ ...s, value: "0", meter: 0 })) : STATS,
    people: broken ? { status: "error" } : ready ? { status: "ready", data: rows ?? PEOPLE } : { status: "loading" },
    invites: broken ? { status: "error" } : ready ? { status: "ready", data: rows ?? INVITES } : { status: "loading" },
    activity: broken ? { status: "error" } : ready ? { status: "ready", data: rows ?? EVENTS } : { status: "loading" },
    health: broken ? { status: "error" } : ready ? { status: "ready", data: rows === undefined ? HEALTH : null } : { status: "loading" },
    actions: undefined,
    onRetryPeople: noop,
    onRetryInvites: noop,
    onRetryActivity: noop,
    onRetryHealth: noop,
  };
}

export const ADMIN_STATE_NAMES: AdminState[] = ["default", "loading", "empty", "failed"];

export function adminFixture(state: AdminState): AdminViewProps {
  return { ...adminFixtures(state), foldKey: `lab-admin-${state}` };
}

/* ── The list parts ─────────────────────────────────────────────────────────────── */

const el = React.createElement;
const tag = (text: string, cls = "tag") => el("span", { className: cls }, text);
const ghost = (text: string) => el("button", { type: "button", className: "btn ghost" }, text);

/** A picture row, an avatar row, an icon row, a status row, an action row, a link row. */
export const LIST_ROWS: RowProps[] = [
  {
    title: "Google Workspace",
    meta: "OAUTH 2 · CONNECTED · LAST USED 9 OCT 2026",
    art: pickArt("src-drive"),
    status: tag("Connected"),
    actions: ghost("Disconnect"),
  },
  {
    title: "Rani Prameswari",
    body: "rani@sutaeru.app",
    meta: "ADMIN · 42 FILES · JOINED 12 JUL 2026 · LAST SEEN NOW",
    initials: "R",
    status: tag("Live"),
  },
  {
    title: "Standing instruction Sutaeru follows",
    meta: "PROMPT · 12 USES",
    icon: "make",
    quiet: true,
    actions: ghost("Delete"),
  },
  { title: "Skills", meta: "ROUTINES", icon: "settings", chevron: true },
];

export const LIST_STRIP: StripItem[] = [
  { label: "Active", value: "3", meter: 3 / 4, meterLabel: "3 of 4 running" },
  { label: "Runs today", value: "6" },
  { label: "Next", value: "09:00" },
  { label: "Flagged", value: "1", meter: 0.1 },
];
