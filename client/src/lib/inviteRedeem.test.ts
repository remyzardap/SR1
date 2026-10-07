import { describe, expect, it } from "vitest";

import { INVITE_STORAGE_KEY, peekInviteCode, saveInviteCode, type StorageLike } from "./inviteCapture";
import {
  FRIENDLY_INVITE_COPY,
  INVITE_REDEEMED_COPY,
  inviteFailureFromReason,
  redeemInviteCode,
  redeemResultFromServer,
  runRedeemAfterSignIn,
  type RedeemResult,
} from "./inviteRedeem";

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** A storage that already holds a captured code, as the login page leaves it. */
function storageWithCode(code = "K7QM2PXT8RVZ") {
  const storage = fakeStorage();
  saveInviteCode(code, storage);
  return storage;
}

const ok = (): Promise<RedeemResult> => Promise.resolve({ ok: true });
const refused = (reason: string): Promise<RedeemResult> =>
  Promise.resolve({ ok: false, reason: inviteFailureFromReason(reason) });

describe("the redeem seam", () => {
  it("reports unavailable because the server has no redeem procedure yet", async () => {
    // If this starts returning ok:true, the server procedure landed and Login's wiring
    // should be re-read: the "unavailable" branch is a stopgap, not the design.
    await expect(redeemInviteCode("K7QM2PXT8RVZ")).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("keeps the code for a later sign-in when it could not be checked", async () => {
    const storage = storageWithCode();
    const outcome = await runRedeemAfterSignIn({ storage });
    expect(outcome.status).toBe("unavailable");
    expect(peekInviteCode(storage)).toBe("K7QM2PXT8RVZ");
  });

  it("keeps the code when the redeem request itself fails", async () => {
    const storage = storageWithCode();
    const outcome = await runRedeemAfterSignIn({
      storage,
      redeem: () => Promise.reject(new Error("network")),
    });
    expect(outcome).toEqual({ status: "unavailable", message: FRIENDLY_INVITE_COPY.unavailable });
    expect(peekInviteCode(storage)).toBe("K7QM2PXT8RVZ");
  });
});

describe("runRedeemAfterSignIn", () => {
  it("does nothing at all when no code was captured", async () => {
    const storage = fakeStorage();
    const outcome = await runRedeemAfterSignIn({
      storage,
      redeem: () => {
        throw new Error("must not ask the server without a code");
      },
    });
    expect(outcome).toEqual({ status: "none" });
    expect(storage.data.size).toBe(0);
  });

  it("consumes the stored code once the server accepts it", async () => {
    const storage = storageWithCode("AAAA1111BBBB");
    const seen: string[] = [];
    const outcome = await runRedeemAfterSignIn({
      storage,
      redeem: (code) => {
        seen.push(code);
        return ok();
      },
    });
    expect(outcome).toEqual({ status: "redeemed", message: INVITE_REDEEMED_COPY });
    expect(seen).toEqual(["AAAA1111BBBB"]);
    expect([...storage.data.keys()]).toEqual([]);
    expect(peekInviteCode(storage)).toBeNull();
  });

  it("tells a person in plain words when the code is invalid, used or expired", async () => {
    const cases: Array<[string, string]> = [
      ["Invalid invite code", "invalid"],
      ["Invite code has reached its usage limit", "used"],
      ["Invite code has expired", "expired"],
      ["Invite code is no longer active", "invalid"],
    ];
    for (const [serverReason, expectedKey] of cases) {
      const storage = storageWithCode();
      const outcome = await runRedeemAfterSignIn({ storage, redeem: () => refused(serverReason) });
      expect(outcome).toEqual({
        status: "failed",
        message: FRIENDLY_INVITE_COPY[expectedKey as keyof typeof FRIENDLY_INVITE_COPY],
      });
    }
  });

  it("drops a refused code so the same dead link cannot loop on every sign-in", async () => {
    const storage = storageWithCode();
    await runRedeemAfterSignIn({ storage, redeem: () => refused("Invalid invite code") });
    expect(storage.data.has(INVITE_STORAGE_KEY)).toBe(false);
    const second = await runRedeemAfterSignIn({ storage, redeem: () => refused("Invalid invite code") });
    expect(second).toEqual({ status: "none" });
  });

  it("says nothing technical in any of the invite messages", () => {
    const banned = [
      "gpt",
      "claude",
      "gemini",
      "llama",
      "mistral",
      "openai",
      "anthropic",
      "model",
      "token",
      "session",
      "error",
      "500",
      "403",
    ];
    for (const message of [...Object.values(FRIENDLY_INVITE_COPY), INVITE_REDEEMED_COPY]) {
      const lower = message.toLowerCase();
      expect(banned.filter((word) => lower.includes(word))).toEqual([]);
      expect(message.endsWith(".")).toBe(true);
    }
  });
});

describe("mapping the server's answer", () => {
  it("reads the four reason strings useBetaInviteCode returns", () => {
    expect(inviteFailureFromReason("Invalid invite code")).toBe("invalid");
    expect(inviteFailureFromReason("Invite code is no longer active")).toBe("invalid");
    expect(inviteFailureFromReason("Invite code has expired")).toBe("expired");
    expect(inviteFailureFromReason("Invite code has reached its usage limit")).toBe("used");
  });

  it("falls back to invalid for a reason it does not know", () => {
    expect(inviteFailureFromReason("")).toBe("invalid");
    expect(inviteFailureFromReason(null)).toBe("invalid");
    expect(inviteFailureFromReason("Something unexpected")).toBe("invalid");
  });

  it("turns a valid answer into a redeem success and a missing one into unavailable", () => {
    expect(redeemResultFromServer({ valid: true })).toEqual({ ok: true });
    expect(redeemResultFromServer({ valid: false, reason: "Invite code has expired" })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(redeemResultFromServer(null)).toEqual({ ok: false, reason: "unavailable" });
    expect(redeemResultFromServer(undefined)).toEqual({ ok: false, reason: "unavailable" });
    expect(redeemResultFromServer({} as { valid: boolean })).toEqual({ ok: false, reason: "unavailable" });
  });
});
