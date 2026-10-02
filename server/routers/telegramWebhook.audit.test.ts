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

// The parser and the shared chat lines stay real (the webhook is what this suite
// is about); only the part that pays for an image is replaced.
const chat = vi.hoisted(() => ({ runChatImage: vi.fn() }));

vi.mock("../lib/chatImage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/chatImage")>();
  return { ...actual, runChatImage: chat.runChatImage };
});

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

/**
 * The photo goes out as multipart, which JSON.parse cannot read, so this stub
 * keeps the raw init: `form` when the body was a FormData, `json` otherwise.
 */
type RawCall = { url: string; form: FormData | null; json: any };

function stubRawFetch(handler: (url: string, init: any) => Response | Promise<Response>) {
  const calls: RawCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init: any) => {
      const body = init?.body;
      calls.push({
        url: String(url),
        form: body instanceof FormData ? body : null,
        json: typeof body === "string" ? JSON.parse(body) : undefined,
      });
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

const ENV_NAMES = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "OPENCLAW_WEBHOOK_URL",
  "TELEGRAM_ALLOWED_USER_IDS",
  "CHAT_IMAGE_ENGINE",
];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  vi.resetModules();
  s1.blend.mockClear();
  chat.runChatImage.mockReset();
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

const hookHeaders = { "x-telegram-bot-api-secret-token": SECRET };

/** Waits for something that happens in the background, with room for a loaded CI worker. */
const settle = (check: () => void) => vi.waitFor(check, { timeout: 15_000, interval: 25 });

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

  it("logs only the numeric id of an ignored sender, never the message text", async () => {
    stubFetch(() => okJson({ ok: true }));
    const log = vi.spyOn(console, "log");
    const routes = await register();
    const { res } = fakeRes();
    await routes[0].handler(
      fakeReq({ update_id: 11, message: { from: { id: 4242 }, chat: { id: 4242 }, text: "secret words" } }, { "x-telegram-bot-api-secret-token": SECRET }),
      res
    );
    const lines = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(lines).toContain("4242");
    expect(lines).not.toContain("secret words");
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
    await routes[0].handler(fakeReq(update("hello"), hookHeaders), res);
    expect(out.json).toEqual({ ok: true });
    const urls = calls.map((c) => c.url);
    expect(urls.some((u) => u.includes(`bot${TOKEN}/sendChatAction`))).toBe(true);
    expect(urls.some((u) => u.includes("llm.test"))).toBe(true);
    const sent = calls.find((c) => c.url.includes(`bot${TOKEN}/sendMessage`));
    expect(sent?.body.chat_id).toBe(777);
    expect(sent?.body.text).toBe("S1 answer");
  });

  it("leaves a plain text message on the S1 path and never draws", async () => {
    stubFetch((url) => {
      if (url.includes("/chat/completions")) return okJson({ choices: [{ message: { content: "S1 answer" } }] });
      return okJson({ ok: true });
    });
    const routes = await register();
    const { res } = fakeRes();
    await routes[0].handler(fakeReq(update("hello"), hookHeaders), res);
    expect(s1.blend).toHaveBeenCalledTimes(1);
    expect(chat.runChatImage).not.toHaveBeenCalled();
  });

  it("processes the SAME update_id twice: there is no duplicate-update dedup for text", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("/chat/completions")) return okJson({ choices: [{ message: { content: "answer" } }] });
      return okJson({ ok: true });
    });
    const routes = await register();
    for (let i = 0; i < 2; i++) {
      const { res } = fakeRes();
      await routes[0].handler(fakeReq(update("hello", 42), hookHeaders), res);
    }
    // Telegram retries deliveries at-least-once; both passes call the LLM.
    expect(s1.blend).toHaveBeenCalledTimes(2);
    const sends = calls.filter((c) => c.url.includes("sendMessage"));
    expect(sends).toHaveLength(2);
  });

  it("answers any allowlisted telegram chat with NO Sutaeru user linkage or quota check", async () => {
    // getOrCreateTelegramUser (services/telegram.ts) is never called from the
    // webhook: an allowlisted Telegram account can consume LLM budget with no
    // Sutaeru user behind it.
    process.env.OPENCLAW_WEBHOOK_URL = "https://claw.test/hook";
    const calls = stubFetch(() => okJson({ response: "from openclaw" }));
    const routes = await register();
    const { res, out } = fakeRes();
    await routes[0].handler(
      fakeReq({ update_id: 3, message: { from: { id: 999 }, chat: { id: 999 }, text: "hi" } }, hookHeaders),
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
    await routes[0].handler(fakeReq(update("hi"), hookHeaders), res);
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
    await routes[0].handler(fakeReq(update("hi"), hookHeaders), res);
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
    await routes[0].handler(fakeReq(update("hi"), hookHeaders), res);
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
    await routes[0].handler(fakeReq(update("hi"), hookHeaders), res);
    expect(out.json).toEqual({ ok: false });
  });
});

describe("telegram webhook image commands", { timeout: 30_000 }, () => {
  const photo = { ok: true as const, buffer: Buffer.from("fake png bytes"), mimeType: "image/png", caption: "Stable Diffusion · realisticVision_v60B1.safetensors" };

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    process.env.TELEGRAM_ALLOWED_USER_IDS = "777";
    chat.runChatImage.mockResolvedValue(photo);
  });

  it("answers the webhook at once and sends the photo when the drawing is done", async () => {
    let finish: (value: typeof photo) => void = () => {};
    chat.runChatImage.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const calls = stubRawFetch(() => okJson({ ok: true }));
    const routes = await register();
    const { res, out } = fakeRes();

    await routes[0].handler(fakeReq(update("/img a red fox"), hookHeaders), res);

    // The update is answered while the job is still running.
    expect(out.json).toEqual({ ok: true });
    expect(calls.some((c) => c.url.includes("sendPhoto"))).toBe(false);
    await settle(() => expect(chat.runChatImage).toHaveBeenCalledTimes(1));

    finish(photo);
    await settle(() => expect(calls.some((c) => c.url.includes("sendPhoto"))).toBe(true));
  });

  it("sends the picture as multipart to the same chat with the engine caption", async () => {
    const calls = stubRawFetch(() => okJson({ ok: true }));
    const routes = await register();
    const { res } = fakeRes();

    await routes[0].handler(fakeReq(update("/img wide a red fox"), hookHeaders), res);
    await settle(() => expect(calls.some((c) => c.url.includes("sendPhoto"))).toBe(true));

    const sent = chat.runChatImage.mock.calls[0][0];
    expect(sent.chatKey).toBe("telegram:777");
    expect(sent.parsed).toEqual({ kind: "image", prompt: "a red fox", engine: "forge", quality: "standard", aspectRatio: "16:9" });

    const photoCall = calls.find((c) => c.url.includes(`bot${TOKEN}/sendPhoto`));
    expect(photoCall?.form).toBeInstanceOf(FormData);
    expect(photoCall?.form?.get("chat_id")).toBe("777");
    expect(photoCall?.form?.get("caption")).toBe("Stable Diffusion · realisticVision_v60B1.safetensors");
    const file = photoCall?.form?.get("photo") as File;
    expect(file.name).toBe("image.png");
    expect(file.type).toBe("image/png");
  });

  it("warns about the cold GPU on forge and just says Drawing for the rest", async () => {
    const calls = stubRawFetch(() => okJson({ ok: true }));
    const routes = await register();
    const { res } = fakeRes();
    await routes[0].handler(fakeReq(update("/img a red fox"), hookHeaders), res);
    await settle(() => expect(calls.some((c) => c.url.includes("sendPhoto"))).toBe(true));

    const ack = calls.find((c) => c.url.includes("sendMessage"));
    expect(ack?.json?.text).toBe("Starting the GPU. The first image can take a few minutes.");
    expect(ack?.json?.chat_id).toBe(777);

    process.env.CHAT_IMAGE_ENGINE = "gemini";
    const other = stubRawFetch(() => okJson({ ok: true }));
    const { res: res2 } = fakeRes();
    await routes[0].handler(fakeReq(update("/img a blue fox", 500), hookHeaders), res2);
    await settle(() => expect(other.some((c) => c.url.includes("sendPhoto"))).toBe(true));
    expect(other.find((c) => c.url.includes("sendMessage"))?.json?.text).toBe("Drawing...");
  });

  it("keeps the upload_photo action alive every 4 seconds until the photo is sent", async () => {
    vi.useFakeTimers();
    try {
      let finish: (value: typeof photo) => void = () => {};
      chat.runChatImage.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      const calls: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: unknown) => {
          calls.push(String(url));
          return okJson({ ok: true });
        })
      );
      const routes = await register();
      const { res } = fakeRes();
      void routes[0].handler(fakeReq(update("/img a red fox"), hookHeaders), res);
      await vi.advanceTimersByTimeAsync(0);
      expect(calls.some((u) => u.includes("sendChatAction"))).toBe(true);

      const actions = () => calls.filter((u) => u.includes("sendChatAction")).length;
      const before = actions();
      await vi.advanceTimersByTimeAsync(4_000);
      await vi.advanceTimersByTimeAsync(4_000);
      expect(actions()).toBe(before + 2);

      finish(photo);
      await vi.advanceTimersByTimeAsync(12_000);
      expect(actions()).toBe(before + 2); // the loop stopped with the job
      expect(calls.filter((u) => u.includes("sendPhoto"))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dedupes a redelivered update_id and never draws it twice", async () => {
    const calls = stubRawFetch(() => okJson({ ok: true }));
    const routes = await register();

    for (let i = 0; i < 2; i++) {
      const { res, out } = fakeRes();
      await routes[0].handler(fakeReq(update("/img a red fox", 900), hookHeaders), res);
      expect(out.json).toEqual({ ok: true });
    }
    await settle(() => expect(calls.some((c) => c.url.includes("sendPhoto"))).toBe(true));

    expect(chat.runChatImage).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.url.includes("sendPhoto"))).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes("sendMessage"))).toHaveLength(1);
  });

  it("answers a bare command with the usage line and draws nothing", async () => {
    const calls = stubRawFetch(() => okJson({ ok: true }));
    const routes = await register();
    const { res, out } = fakeRes();

    await routes[0].handler(fakeReq(update("/img", 901), hookHeaders), res);

    expect(out.json).toEqual({ ok: true });
    await settle(() => expect(calls.filter((c) => c.url.includes("sendMessage"))).toHaveLength(1));
    expect(String(calls.find((c) => c.url.includes("sendMessage"))?.json?.text)).toContain("Draw a picture");
    expect(chat.runChatImage).not.toHaveBeenCalled();
  });

  it("answers a failed draw with one short line and sends no photo", async () => {
    chat.runChatImage.mockResolvedValueOnce({ ok: false, message: "Stable Diffusion is not available right now." });
    const calls = stubRawFetch(() => okJson({ ok: true }));
    const routes = await register();
    const { res } = fakeRes();

    await routes[0].handler(fakeReq(update("/img a red fox", 902), hookHeaders), res);
    await settle(() => expect(calls.filter((c) => c.url.includes("sendMessage"))).toHaveLength(2));

    const failure = calls.filter((c) => c.url.includes("sendMessage"))[1];
    expect(failure?.json?.text).toBe("Stable Diffusion is not available right now.");
    expect(calls.filter((c) => c.url.includes("sendPhoto"))).toHaveLength(0);
  });

  it("ignores an image command from a user who is not allowlisted", async () => {
    const calls = stubRawFetch(() => okJson({ ok: true }));
    const routes = await register();
    const { res, out } = fakeRes();

    await routes[0].handler(
      fakeReq({ update_id: 903, message: { from: { id: 555 }, chat: { id: 555 }, text: "/img a red fox" } }, hookHeaders),
      res
    );

    expect(out.json).toEqual({ ok: true });
    expect(chat.runChatImage).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("still acks the update when the background job throws", async () => {
    chat.runChatImage.mockRejectedValueOnce(new Error("gpu manager exploded"));
    const calls = stubRawFetch(() => okJson({ ok: true }));
    const routes = await register();
    const { res, out } = fakeRes();

    await routes[0].handler(fakeReq(update("/img a red fox", 904), hookHeaders), res);

    expect(out.json).toEqual({ ok: true });
    await settle(() => expect(chat.runChatImage).toHaveBeenCalledTimes(1));
    expect(calls.filter((c) => c.url.includes("sendPhoto"))).toHaveLength(0);
  });
});
