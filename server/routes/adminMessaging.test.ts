import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const bridge = vi.hoisted(() => ({
  waStatus: { state: "off" as "off" | "waiting" | "connecting" | "open", pairingCode: undefined as string | undefined, number: undefined as string | undefined, note: undefined as string | undefined },
  start: vi.fn(),
}));
vi.mock("../services/whatsappBaileys", () => ({ waStatus: bridge.waStatus, startWhatsAppBaileys: bridge.start }));

import { adminMessagingRouter, normalizePairNumber, messagingStatus } from "./adminMessaging";

let server: import("http").Server;
let base = "";
let role: string | undefined = "admin";

async function boot() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (role) (req as any).user = { id: 1, role }; next(); });
  app.use("/api/admin/messaging", adminMessagingRouter);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/messaging`;
}

beforeEach(async () => {
  role = "admin";
  bridge.waStatus.state = "off"; bridge.waStatus.pairingCode = undefined; bridge.waStatus.number = undefined; bridge.waStatus.note = undefined;
  bridge.start.mockClear();
  vi.stubEnv("WHATSAPP_BAILEYS", ""); vi.stubEnv("WHATSAPP_PAIR_NUMBER", ""); vi.stubEnv("TELEGRAM_BOT_TOKEN", ""); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", ""); vi.stubEnv("TELEGRAM_ALLOWED_USER_IDS", "");
  await boot();
});
afterEach(async () => { await new Promise((r) => server.close(r)); vi.unstubAllEnvs(); });

const post = (body: unknown) => fetch(`${base}/link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("normalizePairNumber", () => {
  it("accepts digits with common punctuation", () => {
    expect(normalizePairNumber("+62 812-3456-7890")).toBe("6281234567890");
    expect(normalizePairNumber("(1) 415.555.2671")).toBe("14155552671");
  });
  it("rejects too short, too long, letters and empty", () => {
    for (const bad of ["", "1234567", "1234567890123456", "abc12345678", null, undefined, 62812345678.5]) expect(normalizePairNumber(bad)).toBeNull();
  });
});

describe("access", () => {
  it("refuses everyone who is not an admin", async () => {
    role = "user";
    expect((await fetch(`${base}/status`)).status).toBe(403);
    expect((await post({ number: "6281234567890" })).status).toBe(403);
    role = undefined;
    expect((await fetch(`${base}/status`)).status).toBe(403);
    expect(bridge.start).not.toHaveBeenCalled();
  });
});

describe("status", () => {
  it("reports states and shows the code only while waiting", async () => {
    bridge.waStatus.state = "connecting"; bridge.waStatus.pairingCode = "STALE000";
    expect((await (await fetch(`${base}/status`)).json()).whatsapp.pairingCode).toBeUndefined();
    bridge.waStatus.state = "waiting"; bridge.waStatus.pairingCode = "ABCD1234";
    const s = await (await fetch(`${base}/status`)).json();
    expect(s.whatsapp).toMatchObject({ state: "waiting", pairingCode: "ABCD1234" });
  });

  it("never leaks a token, secret, or a full number from settings", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:SECRET-TOKEN-VALUE"); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "hook-secret-value");
    vi.stubEnv("WHATSAPP_PAIR_NUMBER", "6281234567890"); vi.stubEnv("TELEGRAM_ALLOWED_USER_IDS", "111, 222");
    const text = JSON.stringify(messagingStatus());
    expect(text).not.toContain("SECRET-TOKEN-VALUE");
    expect(text).not.toContain("hook-secret-value");
    expect(text).not.toContain("6281234567890");
    expect(messagingStatus()).toMatchObject({ whatsapp: { pairNumberEnding: "7890" }, telegram: { connected: true, allowedUsers: 2 } });
  });

  it("says Telegram is not connected unless both the token and the secret are set", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "x");
    expect(messagingStatus().telegram.connected).toBe(false);
  });
});

describe("link", () => {
  it("rejects a bad number without touching the bridge or settings", async () => {
    const res = await post({ number: "12" });
    expect(res.status).toBe(400);
    expect(bridge.start).not.toHaveBeenCalled();
    expect(process.env.WHATSAPP_PAIR_NUMBER).toBe("");
  });

  it("sets the number, switches the bridge on and starts it when it is off", async () => {
    const res = await post({ number: "+62 812-3456-7890" });
    expect(res.status).toBe(200);
    expect((await res.json()).started).toBe(true);
    expect(process.env.WHATSAPP_PAIR_NUMBER).toBe("6281234567890");
    expect(process.env.WHATSAPP_BAILEYS).toBe("1");
    expect(bridge.start).toHaveBeenCalledTimes(1);
  });

  it.each(["connecting", "waiting"] as const)("does not start a second socket while the bridge is %s", async (state) => {
    bridge.waStatus.state = state;
    const res = await post({ number: "6281234567890" });
    expect((await res.json()).started).toBe(false);
    expect(bridge.start).not.toHaveBeenCalled();
    expect(process.env.WHATSAPP_PAIR_NUMBER).toBe("6281234567890");
  });

  it("refuses to relink an account that is already linked", async () => {
    bridge.waStatus.state = "open"; bridge.waStatus.number = "6281234567890";
    const res = await post({ number: "6289999999999" });
    expect(res.status).toBe(409);
    expect(bridge.start).not.toHaveBeenCalled();
    expect(process.env.WHATSAPP_PAIR_NUMBER).toBe("");
  });
});
