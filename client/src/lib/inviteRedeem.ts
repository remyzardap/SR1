/**
 * Redeeming an invite code after sign-in (F-12 / T-74).
 *
 * THE SEAM LIVES HERE, AND IT IS EMPTY ON PURPOSE. The client cannot ask the server to
 * consume an invite code: `server/db/betaInvites.ts` has `useBetaInviteCode`, but it is
 * not exposed by any tRPC procedure — `admin.betaInvites` only generates, lists and
 * deactivates codes, `auth.login` takes no invite code, and `auth.register` rejects every
 * request outright. T-74 is scoped to the client side, so this module holds every decision
 * the redeem step needs (what to ask, what the answer means, what to say in plain words)
 * and `redeemInviteCode` is the single place that will gain the network call when the
 * server procedure exists. Nothing else has to change.
 *
 * Until then `redeemInviteCode` reports "unavailable", the code stays in sessionStorage,
 * and no message claims a code was accepted when it was not.
 */

import {
  clearInviteCode,
  peekInviteCode,
  type StorageLike,
} from "./inviteCapture";

/** Why a code was not redeemed. "unavailable" means we could not ask, not that it is wrong. */
export type InviteFailure = "invalid" | "used" | "expired" | "unavailable";

export type RedeemResult = { ok: true } | { ok: false; reason: InviteFailure };

/**
 * What to show a person who is not a technical user: what happened, and the one thing they
 * can do about it. No technical words, no model or product names.
 */
export const FRIENDLY_INVITE_COPY: Record<InviteFailure, string> = {
  invalid: "That invite link does not work. Please ask the person who sent it for a new one.",
  used: "That invite link has already been used. Please ask the person who sent it for a new one.",
  expired: "That invite link has run out its time. Please ask the person who sent it for a new one.",
  unavailable:
    "We could not check your invite link just now. Nothing else changed — your account is working.",
};

/**
 * Maps the server's reason text to one of the cases above. The strings are the ones
 * `useBetaInviteCode` returns ("Invalid invite code", "Invite code is no longer active",
 * "Invite code has expired", "Invite code has reached its usage limit"). A deactivated
 * code reads as "invalid" because the reader's next step is identical: get a new link.
 */
export function inviteFailureFromReason(reason: string | null | undefined): InviteFailure {
  const text = (reason ?? "").trim().toLowerCase();
  if (text.includes("expired")) return "expired";
  if (text.includes("usage limit")) return "used";
  return "invalid";
}

/** The one invite message that is good news. */
export const INVITE_REDEEMED_COPY = "Your invite link worked. Welcome aboard.";

/** Turns the server's `{ valid, reason }` answer into a `RedeemResult`. */
export function redeemResultFromServer(
  response: { valid: boolean; reason?: string } | null | undefined,
): RedeemResult {
  if (!response || typeof response.valid !== "boolean") return { ok: false, reason: "unavailable" };
  if (response.valid) return { ok: true };
  return { ok: false, reason: inviteFailureFromReason(response.reason) };
}

/**
 * TODO(T-74): replace the body with a call to a redeem procedure. The server side needs a
 * `betaInvites.redeem`-style mutation that runs `useBetaInviteCode(code, ctx.user.id)` for
 * the signed-in user and returns `{ valid, reason }`; the body below then becomes
 * `redeemResultFromServer(await mutateAsync({ code }))`.
 */
export async function redeemInviteCode(_code: string): Promise<RedeemResult> {
  return { ok: false, reason: "unavailable" };
}

export type RedeemOutcome =
  | { status: "none" }
  | { status: "redeemed"; message: string }
  | { status: "failed"; message: string }
  | { status: "unavailable"; message: string };

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Runs once, right after a successful sign-in, when a session exists for the server to
 * attach the code to. Returns "none" when nothing was captured, so a normal sign-in is
 * untouched by this code path.
 *
 * A code that was refused is dropped from storage — it would only fail again on the next
 * sign-in, and the person has already been told. A code we could not check is kept, so the
 * next sign-in can try once more.
 */
export async function runRedeemAfterSignIn(
  deps: {
    storage?: StorageLike | null;
    redeem?: (code: string) => Promise<RedeemResult>;
  } = {},
): Promise<RedeemOutcome> {
  const storage = deps.storage === undefined ? browserStorage() : deps.storage;
  const redeem = deps.redeem ?? redeemInviteCode;

  const code = peekInviteCode(storage);
  if (!code) return { status: "none" };

  let result: RedeemResult;
  try {
    result = await redeem(code);
  } catch {
    // A failed request says nothing about the code, so it must not read as a wrong link.
    return { status: "unavailable", message: FRIENDLY_INVITE_COPY.unavailable };
  }

  if (result.ok) {
    clearInviteCode(storage);
    return { status: "redeemed", message: INVITE_REDEEMED_COPY };
  }
  if (result.reason === "unavailable") {
    return { status: "unavailable", message: FRIENDLY_INVITE_COPY.unavailable };
  }
  clearInviteCode(storage);
  return { status: "failed", message: FRIENDLY_INVITE_COPY[result.reason] };
}
