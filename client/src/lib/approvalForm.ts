/**
 * The argument editor inside an approval card (T-83).
 *
 * A person asked to approve `send_email` is shown a JSON blob today, and on a phone a JSON blob
 * means pinching sideways and editing quotes. This module turns the arguments object into one
 * labelled field per argument — the kind of control picked from the value that is actually there —
 * and answers the three questions the card cannot ask the server: is this field valid, did anything
 * change, how much time is left.
 *
 * Pure and given the clock, so every rule here is testable in the node test environment (there is no
 * jsdom in this repo, so the component itself cannot be rendered in a test).
 *
 * Nothing about *which* arguments exist is invented: the fields come from the server's `args`, so a
 * value the person never sees cannot be sent. Editing stays opt-in — `editedArgsIfChanged` returns
 * null when the form matches what arrived, and the card then posts a bare decision like it always did.
 */

/** Over this many characters a string argument is too long for one line on a phone. */
export const LONG_TEXT_CHARS = 80;

/**
 * Roughly how many characters fit on one line of a 390 px screen, and how many lines the card will
 * show before hiding the rest behind "Show more" (T-83: an email body must not push the card's
 * buttons off the bottom of the screen).
 */
export const CHARS_PER_LINE = 40;
export const COLLAPSE_LINES = 6;

/** Under a minute left the countdown turns amber: still decidable, but running out. */
export const URGENT_MS = 60_000;

/** What the card says once the deadline has passed. */
export const EXPIRED_COPY = "This request expired. Ask again.";

export type FieldKind = "text" | "number" | "boolean" | "chips" | "json";

interface FieldHead {
  /** The key in the arguments object. Never shown to the person — `label` is. */
  key: string;
  label: string;
}

export interface TextField extends FieldHead {
  kind: "text";
  value: string;
  /** Long or multi-line text gets a growing box instead of a single line. */
  multiline: boolean;
  /** An argument that arrived with text in it must not be sent blank. */
  hadValue: boolean;
}

export interface NumberField extends FieldHead {
  kind: "number";
  value: string;
  hadValue: boolean;
}

export interface BooleanField extends FieldHead {
  kind: "boolean";
  value: boolean;
}

export interface ChipsField extends FieldHead {
  kind: "chips";
  value: string[];
}

export interface JsonField extends FieldHead {
  kind: "json";
  value: string;
  /** Shape the raw text has to keep, so a nested object cannot become a string by accident. */
  expect: "object" | "array" | "any";
}

export type ApprovalField =
  | TextField
  | NumberField
  | BooleanField
  | ChipsField
  | JsonField;

/** What an editor control holds: text boxes and number boxes hold raw text so typing is not fought. */
export type FieldValue = string | boolean | string[];
export type FieldValues = Record<string, FieldValue>;

export type BuildResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

export interface CountdownView {
  /** False when the server sent no deadline at all: then there is nothing to count down. */
  hasDeadline: boolean;
  expired: boolean;
  urgent: boolean;
  /** "Expires in 4:32", or "" when there is no deadline or it has passed. */
  text: string;
}

// ─── Reading the arguments object ────────────────────────────────────────────

/**
 * The arguments as a plain object, or null when they are not one. The gate stores parsed objects but
 * an MCP server may hand back a JSON string, and the advanced editor hands back text, so both are
 * accepted here rather than in the card.
 */
export function toArgsObject(args: unknown): Record<string, unknown> | null {
  let value = args;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value as Record<string, unknown>;
}

/**
 * `recipient_addresses` and `dryRun` read better as "Recipient addresses" and "Dry run" than as a
 * column name. Sentence case, because a label shouting "Dry Run" looks like a button, not a hint.
 */
export function fieldLabel(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!spaced) return "Value";
  return spaced.replace(/^./, (first) => first.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One field per top-level argument, picked from the value that came from the server. */
export function deriveFields(args: unknown): ApprovalField[] {
  const object = toArgsObject(args);
  if (!object) return [];
  return Object.entries(object).map(([key, value]) => fieldFor(key, value));
}

function fieldFor(key: string, value: unknown): ApprovalField {
  const label = fieldLabel(key);

  if (typeof value === "string") {
    return {
      kind: "text",
      key,
      label,
      value,
      multiline: value.length > LONG_TEXT_CHARS || value.includes("\n"),
      hadValue: value.trim() !== "",
    };
  }
  if (typeof value === "number") {
    return {
      kind: "number",
      key,
      label,
      value: String(value),
      hadValue: Number.isFinite(value),
    };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean", key, label, value };
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      return { kind: "chips", key, label, value: value as string[] };
    }
    return {
      kind: "json",
      key,
      label,
      value: JSON.stringify(value, null, 2),
      expect: "array",
    };
  }
  if (isPlainObject(value)) {
    return {
      kind: "json",
      key,
      label,
      value: JSON.stringify(value, null, 2),
      expect: "object",
    };
  }
  // null and anything the tool sent that is not text, a number, a flag or a list keeps its raw form.
  return {
    kind: "json",
    key,
    label: label || "Value",
    value: JSON.stringify(value ?? null),
    expect: "any",
  };
}

/** The starting edit values for a set of fields. */
export function valuesFromFields(fields: ApprovalField[]): FieldValues {
  const values: FieldValues = {};
  for (const field of fields) values[field.key] = field.value;
  return values;
}

// ─── Turning edit values back into arguments ─────────────────────────────────

interface Coerced {
  value?: unknown;
  error?: string;
}

/** Turns one edited value back into the argument, or says in plain words why it cannot be used. */
function coerceField(
  field: ApprovalField,
  raw: FieldValue | undefined,
): Coerced {
  switch (field.kind) {
    case "text": {
      const text = typeof raw === "string" ? raw : String(raw ?? "");
      if (field.hadValue && text.trim() === "") {
        return {
          error: `${field.label} is empty. Put the original text back, or write what to send instead.`,
        };
      }
      return { value: text };
    }
    case "number": {
      const text = (typeof raw === "string" ? raw : String(raw ?? "")).trim();
      if (text === "")
        return { error: `${field.label} needs a number, not an empty box.` };
      const parsed = Number(text);
      if (!Number.isFinite(parsed))
        return { error: `${field.label} must be a number, like 12 or 3.5.` };
      return { value: parsed };
    }
    case "boolean":
      return { value: raw === true };
    case "chips": {
      const items = Array.isArray(raw) ? raw : [];
      return {
        value: items
          .map((item) => String(item).trim())
          .filter((item) => item !== ""),
      };
    }
    case "json": {
      const text = (typeof raw === "string" ? raw : "").trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text === "" ? "null" : text);
      } catch {
        return {
          error: `${field.label} is not valid JSON. Check the brackets, the quotes and the commas.`,
        };
      }
      if (field.expect === "object" && !isPlainObject(parsed)) {
        return {
          error: `${field.label} has to stay an object, like {"key": "value"}.`,
        };
      }
      if (field.expect === "array" && !Array.isArray(parsed)) {
        return {
          error: `${field.label} has to stay a list, like ["one", "two"].`,
        };
      }
      return { value: parsed };
    }
  }
}

/**
 * The edited arguments, ready to send — or every problem, keyed by field, so the card can print each
 * one under its own box. Nothing is sent while any field is broken.
 */
export function buildArgs(
  fields: ApprovalField[],
  values: FieldValues,
): BuildResult {
  const args: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const coerced = coerceField(field, values[field.key]);
    if (coerced.error) errors[field.key] = coerced.error;
    else args[field.key] = coerced.value;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, args };
}

/**
 * The text for "Advanced: edit as JSON". A field that cannot be read as a value yet keeps whatever
 * the server sent rather than dropping it, so switching modes never loses an argument the person
 * can fix afterwards.
 */
export function formToJsonText(
  fields: ApprovalField[],
  values: FieldValues,
  original: Record<string, unknown>,
): string {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const coerced = coerceField(field, values[field.key]);
    args[field.key] = coerced.error ? original[field.key] : coerced.value;
  }
  return JSON.stringify(args, null, 2);
}

export type JsonToFieldsResult =
  | { ok: true; fields: ApprovalField[]; values: FieldValues }
  | { ok: false; error: string };

/** Coming back from the advanced editor: re-derive the fields from the edited object. */
export function fieldsFromJsonText(text: string): JsonToFieldsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error:
        "That is not valid JSON. Check the brackets, the quotes and the commas.",
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      error:
        'The arguments have to be one object, like {"to": "ada@example.com"}.',
    };
  }
  const fields = deriveFields(parsed);
  return { ok: true, fields, values: valuesFromFields(fields) };
}

/** Did the person change anything? Returns null when the built object matches the original. */
export function editedArgsIfChanged(
  original: Record<string, unknown>,
  built: Record<string, unknown>,
): Record<string, unknown> | null {
  return deepEqual(original, built) ? null : built;
}

/** Order-insensitive for object keys, positional for arrays, so an unchanged form is not a change. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        deepEqual(a[key], b[key]),
    );
  }
  return false;
}

// ─── Countdown ───────────────────────────────────────────────────────────────

/** The server's deadline as milliseconds on the clock, or null when it did not send one. */
export function toExpiresAtMs(
  expiresAt: string | number | null | undefined,
): number | null {
  if (typeof expiresAt === "number")
    return Number.isFinite(expiresAt) ? expiresAt : null;
  if (typeof expiresAt === "string" && expiresAt.trim() !== "") {
    const parsed = Date.parse(expiresAt);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** "4:32" from a millisecond remainder — minutes are not padded, seconds always are. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Where the deadline stands *now*. Driven by the `expiresAt` the server sent, never by a timer the
 * card started when it mounted, so a card restored after a reload counts down the time that is left
 * rather than a fresh ten minutes.
 */
export function countdownFor(
  expiresAt: string | number | null | undefined,
  nowMs: number,
): CountdownView {
  const expiresAtMs = toExpiresAtMs(expiresAt);
  if (expiresAtMs === null) {
    return { hasDeadline: false, expired: false, urgent: false, text: "" };
  }
  const remaining = expiresAtMs - nowMs;
  if (remaining <= 0) {
    return { hasDeadline: true, expired: true, urgent: false, text: "" };
  }
  return {
    hasDeadline: true,
    expired: false,
    urgent: remaining < URGENT_MS,
    text: `Expires in ${formatRemaining(remaining)}`,
  };
}

/**
 * Text that would run past about six lines on a phone screen, so the card should hide the rest
 * behind "Show more" instead of growing into a wall. Measured in wrapped lines, not characters: a
 * 230-character email body is already six lines at 390px wide.
 */
export function isLongText(text: string): boolean {
  const lines = text.replace(/\n$/, "").split("\n");
  let used = 0;
  for (const line of lines) {
    used += Math.max(1, Math.ceil(line.length / CHARS_PER_LINE));
    if (used > COLLAPSE_LINES) return true;
  }
  return false;
}

/**
 * Approvals that came back from the server after a reload, joined with any the stream already
 * delivered. The live copy wins: it arrived from the run that is still open, and a card must not
 * appear twice for one request.
 */
export function mergeApprovals<T extends { id: string }>(
  live: T[],
  restored: T[],
): T[] {
  const seen = new Set(live.map((item) => item.id));
  const additions = restored.filter((item) => !seen.has(item.id));
  return additions.length === 0 ? live : [...live, ...additions];
}
