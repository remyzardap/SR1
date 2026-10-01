import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const ENV_NAMES = ["TELEGRAM_BOT_TOKEN"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

async function makeCaller(user: Record<string, unknown> | null) {
  const { telegramRouter } = await import("./telegramRouter");
  const ctx = {
    user: user ?? null,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as any;
  return { caller: telegramRouter.createCaller(ctx), telegramRouter };
}

const alice = { id: 1, role: "user", name: "Alice" };
const root = { id: 2, role: "admin", name: "Root" };

describe("telegramRouter webhookInfo (audit)", () => {
  it("rejects anonymous callers", async () => {
    const { caller } = await makeCaller(null);
    await expect(caller.webhookInfo()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects non-admin callers", async () => {
    const { caller } = await makeCaller(alice);
    await expect(caller.webhookInfo()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reports configured=false for an admin when TELEGRAM_BOT_TOKEN is unset", async () => {
    const { caller } = await makeCaller(root);
    await expect(caller.webhookInfo()).resolves.toEqual({ configured: false, status: "Token not set" });
  });

  it("reports configured=true for an admin when the token is set (never leaks it)", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "fake-telegram-token";
    const { caller } = await makeCaller(root);
    const info = await caller.webhookInfo();
    expect(info).toEqual({ configured: true, status: "Ready" });
    expect(JSON.stringify(info)).not.toContain("fake-telegram-token");
  });
});

describe("telegramRouter surface (audit)", () => {
  it("exposes webhookInfo only: there is NO connect/disconnect flow for Telegram", async () => {
    const procedures = Object.keys((await import("./telegramRouter")).telegramRouter._def.procedures ?? {});
    expect(procedures.sort()).toEqual(["webhookInfo"]);
    // The client never calls trpc.telegram.* either (grep of client/src finds
    // zero references), so Telegram has no account-linking UI path at all.
  });
});
