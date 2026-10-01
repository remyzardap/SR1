import { describe, expect, it, beforeEach, vi } from "vitest";

const d = vi.hoisted(() => ({
  selectRows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(d.selectRows) }),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        d.inserted.push(row);
        return { returning: () => Promise.resolve([{ id: 42 }]) };
      },
    }),
  })),
}));

import { getOrCreateTelegramUser, verifyTelegramSignature } from "./telegram";
import crypto from "crypto";

beforeEach(() => {
  d.selectRows = [];
  d.inserted = [];
});

describe("getOrCreateTelegramUser (audit)", () => {
  it("returns the existing link without inserting", async () => {
    d.selectRows = [{ id: 7 }];
    await expect(getOrCreateTelegramUser(123, "someone")).resolves.toBe(7);
    expect(d.inserted).toHaveLength(0);
  });

  it("creates a passwordless telegram account and returns the new id", async () => {
    d.selectRows = [];
    await expect(getOrCreateTelegramUser(123)).resolves.toBe(42);
    expect(d.inserted[0]).toMatchObject({
      openId: "telegram_123",
      email: "telegram_123@sutaeru.local",
      loginMethod: "telegram",
      emailVerified: true,
    });
    // No passwordHash: these accounts cannot use password login (by design).
    expect("passwordHash" in (d.inserted[0] as object)).toBe(false);
  });

  it("throws when the db is unavailable", async () => {
    const dbMod = await import("../db");
    (dbMod.getDb as any).mockResolvedValueOnce(null);
    await expect(getOrCreateTelegramUser(1)).rejects.toThrow(/DB unavailable/);
  });
});

describe("verifyTelegramSignature (audit)", () => {
  it("accepts a correct HMAC and rejects a wrong one", () => {
    const data = JSON.stringify({ ok: 1 });
    const good = crypto.createHmac("sha256", "bot-token").update(data).digest("hex");
    expect(verifyTelegramSignature("bot-token", data, good)).toBe(true);
    expect(verifyTelegramSignature("bot-token", data, good.slice(0, -1) + (good.at(-1) === "0" ? "1" : "0"))).toBe(false);
    expect(verifyTelegramSignature("other-token", data, good)).toBe(false);
    expect(verifyTelegramSignature("bot-token", data, "")).toBe(false);
  });

  // DEAD CODE FINDING: nothing in server/ imports getOrCreateTelegramUser or
  // verifyTelegramSignature. The public webhook (routers/telegramWebhook.ts)
  // never links Telegram accounts to Sutaeru users, so these helpers and the
  // telegram connect flow they imply do not exist end to end.
});
