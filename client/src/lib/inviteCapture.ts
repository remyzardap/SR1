/**
 * Invite-link capture (F-12 / T-74).
 *
 * An invite link is `https://<origin>/?invite=<CODE>`. The person opening it is usually
 * not signed in yet, and the sign-in form has no field for the code, so the code is kept
 * in sessionStorage: it survives the trip through the login page and disappears when the
 * tab closes, which is what an unredeemed code should do. localStorage is not used here —
 * a code that outlives the browser session can be handed to somebody else.
 *
 * Everything below is pure (search string in, string out) except the two `…FromWindow`
 * helpers, so the capture rules are testable in the node environment vitest is configured
 * with. Callers pass a storage object; nothing here assumes one exists.
 */

/** Query parameter an invite link carries the code in. */
export const INVITE_PARAM = "invite";

/** sessionStorage key the captured code lives under while the user signs in. */
export const INVITE_STORAGE_KEY = "sutaeru.inviteCode";

/** The part of the Web Storage API this module needs, so tests can pass a fake. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function toParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

/**
 * Codes are generated in uppercase but get typed and pasted out of chat apps, so every
 * read normalizes the same way `useBetaInviteCode` does on the server: trim + uppercase.
 * Returns null for blank/whitespace/absent input, which is how "no code" is represented
 * everywhere in this module.
 */
export function normalizeInviteCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return code.length > 0 ? code : null;
}

/** Reads the invite code out of a search string, with or without the leading "?". */
export function readInviteParam(search: string): string | null {
  if (!search) return null;
  return normalizeInviteCode(toParams(search).get(INVITE_PARAM));
}

/**
 * Builds the link an owner shares. `origin` is `window.location.origin` (scheme, host and
 * port, no trailing slash), so the link always points back at the deployment that issued
 * it instead of a hardcoded domain.
 */
export function inviteLinkFor(code: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/?${INVITE_PARAM}=${encodeURIComponent(code.trim())}`;
}

/**
 * The address-bar URL once the code has been captured: no `?invite=`, every other query
 * parameter kept in order. The code is a credential-ish string and a stale link reads as
 * "something went wrong", so it must not stay on screen or in the tab's history entry.
 */
export function urlWithoutInviteParam(pathname: string, search: string): string {
  const params = toParams(search);
  params.delete(INVITE_PARAM);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Storage is unavailable in some privacy modes and throws on quota errors. Losing the
 * invite is survivable; breaking the page is not, so failures are swallowed and read back
 * as "no code".
 */
function readStoredInvite(storage: StorageLike | null): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Stores a captured code. Returns the normalized code, or null if there was nothing to store. */
export function saveInviteCode(code: string, storage: StorageLike | null): string | null {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;
  try {
    storage?.setItem(INVITE_STORAGE_KEY, normalized);
  } catch {
    // Ignored on purpose: see readStoredInvite.
  }
  return normalized;
}

/** The code waiting to be redeemed, without consuming it. */
export function peekInviteCode(storage: StorageLike | null): string | null {
  return normalizeInviteCode(readStoredInvite(storage));
}

/** Drops the stored code — after a successful redeem, or once a code is known to be dead. */
export function clearInviteCode(storage: StorageLike | null): void {
  try {
    storage?.removeItem(INVITE_STORAGE_KEY);
  } catch {
    // Ignored on purpose: see readStoredInvite.
  }
}

export type InviteCaptureResult = {
  /** Code that was just captured from the URL, or null. */
  code: string | null;
  /** True when the URL carried an `invite` parameter at all, even an empty one. */
  hadParam: boolean;
};

/** Captures `?invite=` into storage. Does not touch the address bar — see captureInviteFromWindow. */
export function captureInviteCode(
  search: string,
  storage: StorageLike | null,
): InviteCaptureResult {
  if (!search) return { code: null, hadParam: false };
  const params = toParams(search);
  const code = normalizeInviteCode(params.get(INVITE_PARAM));
  if (code) saveInviteCode(code, storage);
  return { code, hadParam: params.has(INVITE_PARAM) };
}

/** sessionStorage of the current document, or null where there is none (SSR, tests). */
function windowStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Captures the code from the live URL and rewrites the address bar without it. Call this
 * once on mount of any page an invite link can land on.
 */
export function captureInviteFromWindow(): string | null {
  if (typeof window === "undefined") return null;
  const { code, hadParam } = captureInviteCode(window.location.search, windowStorage());
  if (hadParam) {
    const next = urlWithoutInviteParam(window.location.pathname, window.location.search);
    window.history.replaceState({}, "", next);
  }
  return code;
}
