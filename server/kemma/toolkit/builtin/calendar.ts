/**
 * Calendar tools for the Kemma agent (P1-12).
 *
 * `calendar_list` reads the user's primary calendar and `calendar_create` puts one event on it. The
 * create is the only action that reaches outside Sutaeru — and, once attendees are named, other
 * people's calendars — so it carries the approval, and its card is where the human sees who is being
 * invited.
 *
 * Registered in `builtin/index.ts` behind `flag("ACTION_TOOLS")`, and offered only while Google is
 * connected. `calendar_list`'s content comes from outside and is fenced by the engine (P1-10:
 * `isUntrustedTool` matches `calendar_*` reads).
 *
 * Times: `createCalendarEvent` in server/services/google.ts labels every event it writes as UTC, so a
 * time that carries no offset is read as UTC here and converted before it is sent. A time written with
 * an offset or `Z` names an instant and is converted to that instant in UTC. There is no user
 * timezone setting in this repo to consult, so the tool says which reading it uses.
 */
import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolContext } from "../types";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";
import {
  createCalendarEvent,
  getConnectionStatus,
  isGoogleConfigured,
  listCalendarEvents,
} from "../../../services/google";

/** How many events one listing returns when the model does not say. */
const DEFAULT_LIST_MAX = 10;
/** And the most it will ever ask Google for, however the model counts. */
const MAX_LIST_MAX = 50;
/** The same bound as `email_send`: one approved card must not fill a room with strangers. */
const MAX_ATTENDEES = 10;
/** Event descriptions are other people's text; a listing carries the first screenful of them. */
const DESCRIPTION_CHAR_LIMIT = 1_000;

/**
 * An ISO 8601 date-time, with or without an offset, optionally date-only. Deliberately permissive:
 * Google's own error for a bad time is opaque, and a shape check here turns it into one the model can
 * act on. Whether the value is a real moment is the `isoInstant` check below.
 */
const ISO_DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** The field text the model sees when it gets the shape wrong. */
const ISO_HINT =
  "An ISO 8601 date-time, e.g. '2026-10-08T09:00:00Z'. A time with no offset is read as UTC. Add an offset ('2026-10-08T09:00:00+02:00') to name a local time.";

const CalendarListArgs = z.object({
  from: z
    .string()
    .optional()
    .describe(`First moment of the window to read. ${ISO_HINT} Defaults to now.`),
  to: z
    .string()
    .optional()
    .describe(`Last moment of the window; events starting after it are left out. ${ISO_HINT}`),
  max: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIST_MAX)
    .optional()
    .describe(`How many events to return (default ${DEFAULT_LIST_MAX}, max ${MAX_LIST_MAX}).`),
});

const CalendarCreateArgsSchema = z.object({
  title: z.string().min(1).describe("What the event is called."),
  start: z
    .string()
    .refine((value) => ISO_DATE_TIME_RE.test(value.trim()), `start: ${ISO_HINT}`)
    .describe(`When it begins. ${ISO_HINT}`),
  end: z
    .string()
    .refine((value) => ISO_DATE_TIME_RE.test(value.trim()), `end: ${ISO_HINT}`)
    .describe(`When it ends. ${ISO_HINT}`),
  attendees: z
    .array(z.string().min(1))
    .max(MAX_ATTENDEES)
    .optional()
    .describe(`Addresses to invite, at most ${MAX_ATTENDEES}. They are named on the approval card.`),
  location: z.string().optional().describe("Where the event is, as free text."),
  description: z.string().optional().describe("Notes attached to the event."),
});

/**
 * An event that ends before it starts is refused before a card exists, so no human is ever asked to
 * approve an event Google would reject. The check reads the two times the same way the send does.
 */
const CalendarCreateArgs = CalendarCreateArgsSchema.refine(
  (event) => {
    const start = isoInstant(event.start);
    const end = isoInstant(event.end);
    return !!start && !!end && end > start;
  },
  { message: `end must name a moment after start. ${ISO_HINT}` }
);

/** Whether Google can be reached for this account — the same probe the Drive and email tools use. */
async function googleConnected(ctx: ToolContext): Promise<boolean> {
  if (!isGoogleConfigured()) return false;
  try {
    return (await getConnectionStatus(ctx.userId)).connected;
  } catch {
    return false;
  }
}

/**
 * One time as a UTC instant, or `undefined` when it names none. A value with an offset or `Z` is
 * already an instant and is simply moved to UTC; a value without one is read as UTC, because that is
 * how Google will label it. Date-only values get midnight.
 */
function isoInstant(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || !ISO_DATE_TIME_RE.test(trimmed)) return undefined;

  const withTime = trimmed.length === 10 ? `${trimmed}T00:00:00` : trimmed;
  const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(withTime);
  const parsed = Date.parse(naive ? `${withTime}Z` : withTime);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/**
 * One attendee entry as it will be sent. A comma is refused for the same reason `email_send` refuses
 * one: the list is joined with commas, so an entry holding two addresses would double the count the
 * card showed the human.
 */
function attendeeAddress(entry: unknown): string | undefined {
  if (typeof entry !== "string") return undefined;
  const trimmed = entry.trim();
  if (!trimmed || trimmed.includes(",")) return undefined;
  const bare = trimmed.match(/<([^<>]+)>/)?.[1]?.trim() ?? trimmed;
  return /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(bare) ? trimmed : undefined;
}

function resolveAttendees(attendees: unknown): { ok: true; list: string[] } | { ok: false; message: string } {
  const entries = Array.isArray(attendees) ? attendees : [];
  const list: string[] = [];
  for (const entry of entries) {
    const address = attendeeAddress(entry);
    if (!address) return { ok: false, message: "One of the attendees is not a single email address." };
    if (!list.includes(address)) list.push(address);
  }
  if (list.length > MAX_ATTENDEES) {
    return { ok: false, message: `calendar_create invites at most ${MAX_ATTENDEES} attendees.` };
  }
  return { ok: true, list };
}

async function executeList(args: z.infer<typeof CalendarListArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  const from = args.from === undefined ? undefined : isoInstant(args.from);
  if (args.from !== undefined && !from) {
    return createErrorResult(`Missing or invalid "from" parameter: ${ISO_HINT}`, "INVALID_PARAMS");
  }
  const to = args.to === undefined ? undefined : isoInstant(args.to);
  if (args.to !== undefined && !to) {
    return createErrorResult(`Missing or invalid "to" parameter: ${ISO_HINT}`, "INVALID_PARAMS");
  }
  if (args.max !== undefined && !Number.isInteger(args.max)) {
    return createErrorResult('Missing or invalid "max" parameter', "INVALID_PARAMS");
  }
  const max = typeof args.max === "number" ? Math.min(Math.max(args.max, 1), MAX_LIST_MAX) : DEFAULT_LIST_MAX;

  // The service takes one bound only (`timeMin`), so the far end of the window is cut here. Google
  // returns events in start order; an event whose start cannot be read is kept rather than dropped.
  const events = await listCalendarEvents(ctx.userId, max, from);

  return createSuccessResult(
    (events ?? [])
      .filter((event) => {
        if (!to) return true;
        const starts = isoInstant(event.start);
        return !starts || starts <= to;
      })
      .map((event) => ({
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        location: event.location,
        status: event.status,
        attendees: (event.attendees ?? []).map((attendee) => attendee.email),
        htmlLink: event.htmlLink,
        description:
          typeof event.description === "string" && event.description.length > DESCRIPTION_CHAR_LIMIT
            ? `${event.description.slice(0, DESCRIPTION_CHAR_LIMIT)}…`
            : event.description,
      }))
  );
}

async function executeCreate(
  args: z.infer<typeof CalendarCreateArgs>,
  ctx: ToolContext
): Promise<LegacyToolResult> {
  // Re-checked here because the arguments of an approved call come back from the stored card, which a
  // decision route may have edited (P1-11).
  if (typeof args.title !== "string" || !args.title.trim()) {
    return createErrorResult('Missing or invalid "title" parameter', "INVALID_PARAMS");
  }
  const start = isoInstant(args.start);
  if (!start) return createErrorResult(`Missing or invalid "start" parameter: ${ISO_HINT}`, "INVALID_PARAMS");
  const end = isoInstant(args.end);
  if (!end) return createErrorResult(`Missing or invalid "end" parameter: ${ISO_HINT}`, "INVALID_PARAMS");
  if (end <= start) {
    return createErrorResult("The event ends before it starts. Check the two times.", "INVALID_PARAMS");
  }
  const attendees = resolveAttendees(args.attendees);
  if (!attendees.ok) return createErrorResult(attendees.message, "INVALID_PARAMS");

  const location = typeof args.location === "string" ? args.location.trim() : undefined;
  const description = typeof args.description === "string" ? args.description.trim() : undefined;

  const created = await createCalendarEvent(
    ctx.userId,
    args.title.trim(),
    start,
    end,
    description || undefined,
    location || undefined,
    attendees.list.length > 0 ? attendees.list : undefined
  );

  // The summary is not repeated back: the caller wrote it a moment ago, and this result is journalled
  // with the approval row. The event's own link is the part worth keeping.
  return createSuccessResult({
    id: created.id,
    start: created.start,
    end: created.end,
    htmlLink: created.htmlLink,
    attendeeCount: attendees.list.length,
  });
}

/** The two times and the guest list as the card shows them — the same strings the send uses. */
function eventWhen(start: unknown, end: unknown): string {
  const fromShown = isoInstant(start) ?? String(start ?? "");
  const toShown = isoInstant(end) ?? String(end ?? "");
  return `${fromShown} to ${toShown} (UTC)`;
}

function displayAttendees(attendees: unknown): string[] {
  const entries = Array.isArray(attendees) ? attendees : [];
  return entries.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export function registerCalendarTools(): void {
  registerTool({
    name: "calendar_list",
    description:
      "List events on the user's primary calendar between two times, in start order. Read-only; with no window it returns what is coming up next.",
    args: CalendarListArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 15_000,
    maxModelChars: 12_000,
    available: googleConnected,
    execute: executeList,
  });

  registerTool({
    name: "calendar_create",
    description:
      "Create one event on the user's primary calendar, optionally inviting up to 10 attendees. The user approves the card first, which shows the times and every attendee.",
    args: CalendarCreateArgs,
    risk: "write",
    requiresApproval: true,
    // Who is invited is the thing a human has to check, so the full list is on the card. The
    // description stays off it: it is the user's own note, already in the chat, and the card is kept.
    preview: (args) => ({
      title: "Add a calendar event",
      detail: `${String(args.title ?? "").trim()}: ${eventWhen(args.start, args.end)}`,
      attendees: displayAttendees(args.attendees),
      location: typeof args.location === "string" ? args.location.trim() : undefined,
      descriptionChars: typeof args.description === "string" ? args.description.length : 0,
    }),
    parallelSafe: false,
    timeoutMs: 20_000,
    maxModelChars: 4_000,
    available: googleConnected,
    execute: executeCreate,
  });
}
