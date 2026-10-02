import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Express } from "express";

const s1 = vi.hoisted(() => ({
  blend: vi.fn(async () => ({
    config: { baseUrl: "https://llm.test/v1", model: "m", apiKey: "k" },
    messages: [{ role: "user", content: "hi" }],
  })),
  buildPrompt: vi.fn(() => "sys"),
  resolveBearer: vi.fn(async () => "bearer"),
}));

vi.mock("./s1Router", () => ({
  s1Blend: s1.blend,
  buildS1SystemPrompt: s1.buildPrompt,
  resolveBearer: s1.resolveBearer,
}));

import { registerTelegramWebhookRoute } from "./telegramWebhook";

const SECRET = "hook-secret-123";
const TOKEN = "fake-telegram-token";

function fakeApp() {
  const routes: Array<{ path: string; handler: (req: any, res: any) => Promise<void> | void }> = [];
  const app = {
    post(path: string, handler: any) {
      routes.push({ path, handler });
    },
  } as unknown as Express;
  return { app, routes };
}

function fakeReq(body: unknown, headers: Record<string, string> = {}) {
  return { body, headers: {}, header: (name: string) => headers[name.toLowerCase()] };
}

function fakeRes() {
  const out: { status: number | null; json: unknown } = { status: null, json: null };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(payload: unknown) {
      out.json = payload;
      return this;
    },
  };
  return { res, out };
}

type FetchCall = { url: string; body: any };

function stubFetch(handler: (url: string, init: any) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init: any) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return handler(String(url), init);
    })
  );
  return calls;
}

const okJson = (obj: unknown) =>
  new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });

const update = (text: string, updateId = 1) => ({
  update_id: updateId,
  message: {
    message_id: 55,
    from: { id: 777, username: "someone" },
    chat: { id: 777 },
    text,
  },
});

const ENV_NAMES = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "OPENCLAW_WEBHOOK_URL", "TELEGRAM_ALLOWED_USER_IDS"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  vi.resetModules();
  s1.blend.mockClear();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

async function register() {
  const { registerTelegramWebhookRoute: reg } = await import("./telegramWebhook");
  const { app, routes } = fakeApp();
  reg(app);
  return routes;
}

describe("telegram webhook registration (audit)", () => {
  it("does not register the route when the webhook secret is unset", async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(await register()).toHaveLength(0);
  });

  it("does not register the route when the bot token is unset", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(await register()).toHaveLength(0);
  });

  it("registers exactly one public POST /api/telegram/webhook when configured", async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    const routes = await register();
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/api/telegram/webhook");
  });
});

describe("telegram webhook bot secret gate (audit)", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  });

  it("rejects a missing secret header with 401 and no processing", async () => {
    const calls = stubFetch(() => okJson({}));
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(fakeReq(update("hi"), {}), res);
    expect(out.status).toBe(401);
    expect(calls).toHaveLength(0);
    expect(s1.blend).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret with 401", async () => {
    const calls = stubFetch(() => okJson({}));
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(
      fakeReq(update("hi"), { "x-telegram-bot-api-secret-token": "not-the-secret" }),
      res
    );
    expect(out.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("rejects a length-mismatched secret (prefix of the real one) without crashing", async () => {
    const calls = stubFetch(() => okJson({}));
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(
      fakeReq(update("hi"), { "x-telegram-bot-api-secret-token": SECRET.slice(0, 4) }),
      res
    );
    expect(out.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("rejects an empty secret header", async () => {
    const calls = stubFetch(() => okJson({}));
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(fakeReq(update("hi"), { "x-telegram-bot-api-secret-token": "" }), res);
    expect(out.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("accepts the correct secret and acks non-text updates without LLM work", async () => {
    const calls = stubFetch(() => okJson({}));
    const routes = await register();
    const { res, out } = fakeRes();
    const req = fakeReq(
      { update_id: 2, message: { from: { id: 1 }, chat: { id: 1 } } },
      { "x-telegram-bot-api-secret-token": SECRET }
    );
    await routes[0].handler(req, res);
    expect(out.json).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
    expect(s1.blend).not.toHaveBeenCalled();
  });
});

describe("telegram webhook message flow (audit)", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    // The test chats (777 and 999) are on the allowlist; everyone else is ignored.
    process.env.TELEGRAM_ALLOWED_USER_IDS = "777,999";
  });

  it("ignores a Telegram account that is not on the allowlist: no model call, no reply", async () => {
    const calls = stubFetch(() => okJson({ ok: true }));
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(
      fakeReq({ update_id: 9, message: { from: { id: 555 }, chat: { id: 555 }, text: "hi" } }, { "x-telegram-bot-api-secret-token": SECRET }),
      res
    );
    expect(out.json).toEqual({ ok: true });
    expect(s1.blend).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("ignores everyone when the allowlist is empty", async () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = "";
    const calls = stubFetch(() => okJson({ ok: true }));
    const routes = await register();
    const { res } = fakeRes();
    await routes[0].handler(fakeReq(update("hello"), { "x-telegram-bot-api-secret-token": SECRET }), res);
    expect(s1.blend).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("answers a text message via S1 and posts it back to the same chat", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("/chat/completions")) return okJson({ choices: [{ message: { content: "S1 answer" } }] });
      return okJson({ ok: true });
    });
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(fakeReq(update("hello"), { "x-telegram-bot-api-secret-token": SECRET }), res);
    expect(out.json).toEqual({ ok: true });
    const urls = calls.map((c) => c.url);
    expect(urls.some((u) => u.includes(`bot${TOKEN}/sendChatAction`))).toBe(true);
    expect(urls.some((u) => u.includes("llm.test"))).toBe(true);
    const sent = calls.find((c) => c.url.includes(`bot${TOKEN}/sendMessage`));
    expect(sent?.body.chat_id).toBe(777);
    expect(sent?.body.text).toBe("S1 answer");
  });

  it("processes the SAME update_id twice: there is no duplicate-update dedup", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("/chat/completions")) return okJson({ choices: [{ message: { content: "answer" } }] });
      return okJson({ ok: true });
    });
    const routes = await register();
    for (let i = 0; i < 2; i++) {
      const { res } = fakeRes();
      await routes[0].handler(
        fakeReq(update("hello", 42), { "x-telegram-bot-api-secret-token": SECRET }),
        res
      );
    }
    // Telegram retries deliveries at-least-once; both passes call the LLM.
    expect(s1.blend).toHaveBeenCalledTimes(2);
    const sends = calls.filter((c) => c.url.includes("sendMessage"));
    expect(sends).toHaveLength(2);
  });

  it("answers an allowlisted chat with NO Sutaeru user linkage or quota check", async () => {
    // getOrCreateTelegramUser (services/telegram.ts) is never called from the webhook, so an allowlisted
    // chat is not tied to a Sutaeru account or its quota. The allowlist is what keeps strangers out.
    process.env.OPENCLAW_WEBHOOK_URL = "https://claw.test/hook";
    const calls = stubFetch(() => okJson({ response: "from openclaw" }));
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(
      fakeReq({ update_id: 3, message: { from: { id: 999 }, chat: { id: 999 }, text: "hi" } }, { "x-telegram-bot-api-secret-token": SECRET }),
      res
    );
    expect(out.json).toEqual({ ok: true });
    const fwd = calls.find((c) => c.url === "https://claw.test/hook");
    expect(fwd?.body.userId).toBe(999);
    expect(fwd?.body.source).toBe("telegram");
  });

  it("reports an OpenClaw failure but still acks the update", async () => {
    process.env.OPENCLAW_WEBHOOK_URL = "https://claw.test/hook";
    const calls = stubFetch((url) => (url.includes("claw.test") ? new Response("boom", { status: 503 }) : okJson({ ok: true })));
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(fakeReq(update("hi"), { "x-telegram-bot-api-secret-token": SECRET }), res);
    expect(out.json).toEqual({ ok: true });
    const sent = calls.find((c) => c.url.includes("sendMessage"));
    expect(sent?.body.text).toContain("OpenClaw is thinking");
  });

  it("truncates the reply at Telegram's 4096-char limit", async () => {
    s1.blend.mockResolvedValueOnce({
      config: { baseUrl: "https://llm.test/v1", model: "m", apiKey: "k" },
      messages: [],
    } as any);
    const calls = stubFetch((url) => {
      if (url.includes("/chat/completions")) return okJson({ choices: [{ message: { content: "x".repeat(6000) } }] });
      return okJson({ ok: true });
    });
    const routes = await register();
    const { res } = fakeRes();
    await routes[0].handler(fakeReq(update("hi"), { "x-telegram-bot-api-secret-token": SECRET }), res);
    const sent = calls.find((c) => c.url.includes("sendMessage"));
    expect(sent?.body.text).toHaveLength(4096);
  });

  it("retries an unparseable Markdown reply as plain text so it still arrives", async () => {
    // Telegram returns 400 "can't parse entities" for unbalanced Markdown;
    // without a plain-text retry the user silently receives nothing.
    let sendAttempts = 0;
    const calls = stubFetch((url) => {
      if (url.includes("/chat/completions")) return okJson({ choices: [{ message: { content: "2 * 3 * 4 = 24" } }] });
      if (url.includes("sendMessage")) {
        sendAttempts++;
        return sendAttempts === 1 ? new Response("bad Markdown entity offset", { status: 400 }) : okJson({ ok: true });
      }
      return okJson({ ok: true });
    });
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(fakeReq(update("hi"), { "x-telegram-bot-api-secret-token": SECRET }), res);
    expect(out.json).toEqual({ ok: true });
    const sends = calls.filter((c) => c.url.includes("sendMessage"));
    expect(sends.length).toBeGreaterThanOrEqual(2);
    expect(sends[0].body.parse_mode).toBe("Markdown");
    expect(sends[sends.length - 1].body.parse_mode).toBeUndefined();
    expect(sends[sends.length - 1].body.text).toBe("2 * 3 * 4 = 24");
  });

  it("acknowledges ok:false when internal handling throws (no crash, but signals retry)", async () => {
    s1.blend.mockRejectedValueOnce(new Error("no provider configured"));
    stubFetch(() => okJson({ ok: true }));
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(fakeReq(update("hi"), { "x-telegram-bot-api-secret-token": SECRET }), res);
    expect(out.json).toEqual({ ok: false });
  });
});
