/**
 * Getting an invite link onto a phone's share sheet (T-74 / F-12).
 *
 * The owner is holding a phone, so the native share sheet is the one tap that finishes
 * the job. Not every browser offers it, and the person may close the sheet instead of
 * sharing — so this decides what happened and hands back plain words, without ever
 * pretending a link was sent.
 *
 * The browser APIs are passed in, so the rules are testable in the node environment
 * where there is no `navigator` at all.
 */

export const INVITE_SHARE_TITLE = "Sutaeru invite link";

/** Shown when neither the share sheet nor the clipboard would take the link. */
export const INVITE_SHARE_UNAVAILABLE_COPY =
  "That did not work here. Select the link above, then copy it yourself.";

type ShareFn = (data: { title: string; text?: string; url: string }) => Promise<void>;
type CopyFn = (text: string) => Promise<void>;

export type ShareOutcome =
  | { status: "shared" }
  /** The person opened the share sheet and walked away from it. Nothing is claimed. */
  | { status: "cancelled" }
  | { status: "copied" }
  | { status: "unavailable"; message: string };

function isCancelled(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}

/**
 * Share the link, or copy it, or say plainly that neither worked.
 *
 * A cancelled share is not a failure to fall back from: pasting the link into someone's
 * clipboard after they closed the sheet would be a surprise they did not ask for.
 */
export async function shareInviteLink(options: {
  url: string;
  share?: ShareFn;
  copy?: CopyFn;
  title?: string;
}): Promise<ShareOutcome> {
  const { url, share, copy, title = INVITE_SHARE_TITLE } = options;

  if (share) {
    try {
      await share({ title, url });
      return { status: "shared" };
    } catch (error) {
      if (isCancelled(error)) return { status: "cancelled" };
      // No share sheet, or it refused — fall through to the clipboard.
    }
  }

  if (copy) {
    try {
      await copy(url);
      return { status: "copied" };
    } catch {
      // Clipboard blocked (permissions, insecure origin) — report it below.
    }
  }

  return { status: "unavailable", message: INVITE_SHARE_UNAVAILABLE_COPY };
}

/** Copy the link with the browser's clipboard, when it has one. */
function windowCopy(): CopyFn | undefined {
  if (typeof window === "undefined") return undefined;
  const clipboard = window.navigator.clipboard;
  return clipboard && typeof clipboard.writeText === "function" ? (text) => clipboard.writeText(text) : undefined;
}

function unavailable(): ShareOutcome {
  return { status: "unavailable", message: INVITE_SHARE_UNAVAILABLE_COPY };
}

/** The same decision using this browser's APIs; outside a browser, nothing is offered. */
export function shareInviteLinkFromWindow(url: string): Promise<ShareOutcome> {
  if (typeof window === "undefined") return Promise.resolve(unavailable());
  const nav: Navigator = window.navigator;
  return shareInviteLink({
    url,
    share: typeof nav.share === "function" ? (data) => nav.share(data) : undefined,
    copy: windowCopy(),
  });
}

/** Copy only — for the button that says "Copy link", not the one that opens a share sheet. */
export function copyInviteLinkFromWindow(url: string): Promise<ShareOutcome> {
  if (typeof window === "undefined") return Promise.resolve(unavailable());
  return shareInviteLink({ url, copy: windowCopy() });
}
