/**
 * Email tools for the Kemma agent (P1-12).
 *
 * Three tools over the user's already-connected Gmail: `email_search`, `email_read` and
 * `email_send`. Only the send changes anything outside Sutaeru, so only it carries an approval; the
 * two reads are ordinary reads whose content the engine fences as untrusted (P1-10 —
 * `isUntrustedTool` already matches `email_search` / `email_read`, so nothing here has to fence).
 *
 * Registration happens in `builtin/index.ts` behind `flag("ACTION_TOOLS")`, and every tool is offered
 * only while this account has Google connected: the same probe the Drive tools use, so a disconnected
 * user is never handed a tool that could only fail.
 */
import { z } from "zod";
import { registerTool } from "../registry";
import type { ToolContext } from "../types";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";
import {
  getConnectionStatus,
  getEmailContent,
  isGoogleConfigured,
  listEmails,
  sendEmail,
} from "../../../services/google";

/** How much of one email body reaches the model. Longer bodies come back cut, with `truncated`. */
const EMAIL_BODY_CHAR_LIMIT = 20_000;
/** `listEmails` default, kept here so the tool and the service agree out loud. */
const DEFAULT_SEARCH_MAX = 10;
/** A search never asks Gmail for more than this many messages. */
const MAX_SEARCH_MAX = 25;
/** G1-adjacent: a send is the one action here that leaves the building, so it is bounded. */
const MAX_RECIPIENTS = 10;

const EmailSearchArgs = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Gmail search syntax, e.g. 'from:acme.com subject:invoice newer_than:30d has:attachment'. Omit it to list the inbox."
    ),
  max: z
    .number()
    .int()
    .min(1)
    .max(MAX_SEARCH_MAX)
    .optional()
    .describe(`How many messages to return (default ${DEFAULT_SEARCH_MAX}, max ${MAX_SEARCH_MAX}).`),
});

const EmailReadArgs = z.object({
  id: z.string().min(1).describe("The message id from email_search."),
});

const EmailSendArgs = z.object({
  to: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_RECIPIENTS)
    .describe(
      `Recipient addresses, 1-${MAX_RECIPIENTS}. One address per entry; "Ada Lovelace <ada@example.com>" is accepted.`
    ),
  subject: z.string().min(1).describe("The subject line, exactly as it should be sent."),
  body: z.string().describe("The message text. Plain text."),
  reply_to_id: z
    .string()
    .optional()
    .describe(
      "Message id this answers. It puts the reply in the same conversation by making sure the subject starts with 'Re:'."
    ),
});

/**
 * Whether Gmail can actually be read for this account. Cheap on purpose: `available()` runs on every
 * tool listing, and `isGoogleConfigured()` is a settings check that answers false before any query.
 */
async function googleConnected(ctx: ToolContext): Promise<boolean> {
  if (!isGoogleConfigured()) return false;
  try {
    return (await getConnectionStatus(ctx.userId)).connected;
  } catch {
    return false;
  }
}

async function executeSearch(args: z.infer<typeof EmailSearchArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (args.query !== undefined && typeof args.query !== "string") {
    return createErrorResult('Missing or invalid "query" parameter', "INVALID_PARAMS");
  }
  if (args.max !== undefined && !Number.isInteger(args.max)) {
    return createErrorResult('Missing or invalid "max" parameter', "INVALID_PARAMS");
  }
  const max = typeof args.max === "number" ? Math.min(Math.max(args.max, 1), MAX_SEARCH_MAX) : DEFAULT_SEARCH_MAX;
  const messages = await listEmails(ctx.userId, max, typeof args.query === "string" ? args.query.trim() : undefined);

  // Only what a listing needs to answer "who wrote what, when": no label ids, no thread ids. The
  // snippet is Gmail's own short preview, and it is untrusted content the engine fences.
  return createSuccessResult(
    (messages ?? []).map((email) => ({
      id: email.id,
      from: email.from,
      subject: email.subject,
      date: email.date,
      snippet: email.snippet,
    }))
  );
}

async function executeRead(args: z.infer<typeof EmailReadArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  if (typeof args.id !== "string" || !args.id.trim()) {
    return createErrorResult('Missing or invalid "id" parameter', "INVALID_PARAMS");
  }
  const email = await getEmailContent(ctx.userId, args.id.trim());
  const body = typeof email.body === "string" ? email.body : "";
  const truncated = body.length > EMAIL_BODY_CHAR_LIMIT;

  return createSuccessResult({
    id: email.id,
    from: email.from,
    to: email.to,
    subject: email.subject,
    date: email.date,
    body: truncated ? body.slice(0, EMAIL_BODY_CHAR_LIMIT) : body,
    truncated,
  });
}

/**
 * One recipient entry as it will be sent. A display name is allowed because that is the shape
 * `email_read` returns in the `From:` header, so a reply is usually copied straight from a message.
 * A comma is refused: `sendEmail` joins the list with commas, so one entry holding two addresses would
 * quietly double the recipient count past the cap.
 */
function recipientAddress(entry: unknown): string | undefined {
  if (typeof entry !== "string") return undefined;
  const trimmed = entry.trim();
  if (!trimmed || trimmed.includes(",")) return undefined;
  const bare = trimmed.match(/<([^<>]+)>/)?.[1]?.trim() ?? trimmed;
  return /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(bare) ? trimmed : undefined;
}

/** The addresses to send to, deduplicated, in the order the caller gave them. */
function resolveRecipients(to: unknown): { ok: true; list: string[] } | { ok: false; message: string } {
  const entries = Array.isArray(to) ? to : [];
  const list: string[] = [];
  for (const entry of entries) {
    const address = recipientAddress(entry);
    if (!address) return { ok: false, message: "One of the recipients is not a single email address." };
    if (!list.includes(address)) list.push(address);
  }
  if (list.length === 0) return { ok: false, message: "email_send needs at least one recipient." };
  if (list.length > MAX_RECIPIENTS) {
    return { ok: false, message: `email_send takes at most ${MAX_RECIPIENTS} recipients.` };
  }
  return { ok: true, list };
}

/**
 * The subject that goes out. A reply needs the `Re:` prefix because that is all Gmail threads on here:
 * `sendEmail` builds the message from To/Subject/body and has no thread id to attach. Both the card and
 * the send call this, so what the human approves is what is sent.
 */
function outgoingSubject(subject: string, replyToId?: string): string {
  if (!replyToId) return subject;
  return /^\s*re:/i.test(subject) ? subject : `Re: ${subject}`;
}

async function executeSend(args: z.infer<typeof EmailSendArgs>, ctx: ToolContext): Promise<LegacyToolResult> {
  // Re-checked here and not only by zod: after an approval the arguments come back from the stored
  // card, which a decision route may have edited (P1-11), so the send validates what it is given.
  const recipients = resolveRecipients(args.to);
  if (!recipients.ok) return createErrorResult(recipients.message, "INVALID_PARAMS");
  if (typeof args.subject !== "string" || !args.subject.trim()) {
    return createErrorResult('Missing or invalid "subject" parameter', "INVALID_PARAMS");
  }
  if (typeof args.body !== "string" || !args.body.trim()) {
    return createErrorResult('Missing or invalid "body" parameter', "INVALID_PARAMS");
  }

  const sent = await sendEmail(
    ctx.userId,
    recipients.list.join(", "),
    outgoingSubject(args.subject, args.reply_to_id),
    args.body
  );

  // The body and the addresses stay out of the result: it is journalled with the approval row, and the
  // caller wrote both a moment ago. The Gmail ids are the part worth keeping — `threadId` is what lets
  // a later turn reply inside the same conversation.
  return createSuccessResult({
    id: sent.id,
    threadId: sent.threadId,
    recipientCount: recipients.list.length,
  });
}

/** The list as the caller wrote it, for the card. Validation happens at send time, not here. */
function displayRecipients(to: unknown): string[] {
  const entries = Array.isArray(to) ? to : [];
  return entries.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export function registerEmailTools(): void {
  registerTool({
    name: "email_search",
    description:
      "Search the user's Gmail for messages and return id, from, subject, date and snippet for each. Read-only.",
    args: EmailSearchArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 15_000,
    maxModelChars: 10_000,
    available: googleConnected,
    execute: executeSearch,
  });

  registerTool({
    name: "email_read",
    description:
      "Read one Gmail message in full by its id, including the recipient list. Read-only; the body is cut off after 20,000 characters and says so.",
    args: EmailReadArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 20_000,
    maxModelChars: 20_000,
    available: googleConnected,
    execute: executeRead,
  });

  registerTool({
    name: "email_send",
    description:
      "Send an email from the user's Gmail account to up to 10 recipients. The user approves the card first, which lists every recipient.",
    args: EmailSendArgs,
    risk: "write",
    requiresApproval: true,
    // The one thing the human has to see in full is the list of people this reaches. The body is
    // deliberately absent: it is the user's own text, already in the chat, and the card is journalled.
    preview: (args) => ({
      title: "Send an email",
      detail: `To: ${displayRecipients(args.to).join(", ")}`,
      subject: outgoingSubject(String(args.subject ?? ""), args.reply_to_id),
      bodyChars: typeof args.body === "string" ? args.body.length : 0,
      replyTo: args.reply_to_id,
    }),
    parallelSafe: false,
    timeoutMs: 20_000,
    maxModelChars: 4_000,
    available: googleConnected,
    execute: executeSend,
  });
}
