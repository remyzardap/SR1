import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import type { Request, Response } from "express";

// whatsapp.ts webhook auth. The env vars are captured at MODULE LOAD, so each
// scenario re-imports the router after setting process.env. The handlers are
// pulled straight off the express Router stack and driven with fake req/res.

const mp = vi.hoisted(() => ({ processIncomingMessage: vi.fn(async () => {}) }));
vi.mock("../../services/message-processor", () => mp);

const SECRET = "app-secret";
const VERIFY = "verify-token";

async function freshRouter(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_API_TOKEN"]) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  const mod = await import("./whatsapp");
  return mod.default;
}

function handlerFor(router: any, method: "get" | "post") {
  for (const layer of router.stack) {
    const route = layer.route;
    if (route && route.methods[method] && route.path === "/") return route.stack[0].handle;
  }
  throw new Error(`no ${method} / handler on router`);
}

function fakeRes() {
  const res: any = {
    statusCode: 200,
    body: null as unknown,
    sent: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
    send(b: unknown) {
      res.sent = b;
      return res;
    },
  };
  return res;
}

function sign(secret: string, raw: Buffer): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

const PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "pn-1" },
            contacts: [{ wa_id: "8521", profile: { name: "Ana" } }],
            messages: [{ id: "wamid.1", from: "8521", type: "text", timestamp: "1755000000", text: { body: "hello" } }],
          },
        },
      ],
    },
  ],
};

function flush() {
  return new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  mp.processIncomingMessage.mockReset();
});

describe("GET /webhooks/whatsapp (Meta setup handshake)", () => {
  const warn = { fn: () => {} };
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(warn.fn);
  });
  afterEach(() => vi.restoreAllMocks());

  it("correct verify token echoes hub.challenge", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: SECRET });
    const get = handlerFor(router, "get");
    const res = fakeRes();
    get({ query: { "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "CHL-123" } } as any, res as any);
    expect(res.sent).toBe("CHL-123");
  });

  it("wrong token => 403", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: SECRET });
    const get = handlerFor(router, "get");
    const res = fakeRes();
    get({ query: { "hub.mode": "subscribe", "hub.verify_token": "guess", "hub.challenge": "X" } } as any, res as any);
    expect(res.statusCode).toBe(403);
  });

  it("FIXED: with WHATSAPP_VERIFY_TOKEN unset, even an empty-string token is rejected (was echoed = verification bypass)", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: undefined, WHATSAPP_APP_SECRET: SECRET });
    const get = handlerFor(router, "get");
    const res = fakeRes();
    get({ query: { "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "OWNED" } } as any, res as any);
    expect(res.statusCode).toBe(403);
    expect(res.sent).toBeUndefined();
  });
});

describe("POST /webhooks/whatsapp (x-hub-signature-256)", () => {
  let warnSpy: any;
  let errSpy: any;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("valid HMAC signature over rawBody is accepted and routed to the processor", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: SECRET });
    const post = handlerFor(router, "post");
    const raw = Buffer.from(JSON.stringify(PAYLOAD));
    const res = fakeRes();
    await post(
      {
        headers: { "x-hub-signature-256": sign(SECRET, raw) },
        rawBody: raw,
        body: PAYLOAD,
      } as unknown as Request,
      res as unknown as Response,
    );
    await flush();
    expect(res.statusCode).toBe(200); // acked first regardless
    expect(mp.processIncomingMessage).toHaveBeenCalledTimes(1);
    expect(mp.processIncomingMessage).toHaveBeenCalledWith({
      messageId: "wamid.1",
      from: "8521",
      senderName: "Ana",
      type: "text",
      timestamp: 1755000000,
      text: "hello",
      image: undefined,
      phoneNumberId: "pn-1",
    });
  });

  it("tampered body (valid sig for a different payload) is rejected", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: SECRET });
    const post = handlerFor(router, "post");
    const raw = Buffer.from(JSON.stringify(PAYLOAD));
    const evil = { ...PAYLOAD, object: "whatsapp_business_account" };
    await post(
      { headers: { "x-hub-signature-256": sign(SECRET, raw) }, rawBody: Buffer.from(JSON.stringify({ ...evil, entry: [] })), body: evil } as any,
      fakeRes() as any,
    );
    await flush();
    expect(mp.processIncomingMessage).not.toHaveBeenCalled();
  });

  it("missing signature header => acked but ignored", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: SECRET });
    const post = handlerFor(router, "post");
    const raw = Buffer.from(JSON.stringify(PAYLOAD));
    await post({ headers: {}, rawBody: raw, body: PAYLOAD } as any, fakeRes() as any);
    await flush();
    expect(mp.processIncomingMessage).not.toHaveBeenCalled();
  });

  it("no WHATSAPP_APP_SECRET configured => every payload is ignored (fail closed)", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: undefined });
    const post = handlerFor(router, "post");
    const raw = Buffer.from(JSON.stringify(PAYLOAD));
    await post({ headers: { "x-hub-signature-256": sign("whatever", raw) }, rawBody: raw, body: PAYLOAD } as any, fakeRes() as any);
    await flush();
    expect(mp.processIncomingMessage).not.toHaveBeenCalled();
  });

  it("missing rawBody => rejected even with a correct-looking signature", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: SECRET });
    const post = handlerFor(router, "post");
    const raw = Buffer.from(JSON.stringify(PAYLOAD));
    await post({ headers: { "x-hub-signature-256": sign(SECRET, raw) }, body: PAYLOAD } as any, fakeRes() as any);
    await flush();
    expect(mp.processIncomingMessage).not.toHaveBeenCalled();
  });

  it("wrong object type is skipped; non-messages fields are skipped", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: SECRET });
    const post = handlerFor(router, "post");
    const p1 = { object: "page", entry: [] };
    let raw = Buffer.from(JSON.stringify(p1));
    await post({ headers: { "x-hub-signature-256": sign(SECRET, raw) }, rawBody: raw, body: p1 } as any, fakeRes() as any);
    const p2 = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "statuses", value: { messages: [{ id: "x", from: "1", type: "text", timestamp: "1" }] } }] }],
    };
    raw = Buffer.from(JSON.stringify(p2));
    await post({ headers: { "x-hub-signature-256": sign(SECRET, raw) }, rawBody: raw, body: p2 } as any, fakeRes() as any);
    await flush();
    expect(mp.processIncomingMessage).not.toHaveBeenCalled();
  });

  it("FINDING (idempotency): duplicate delivery of the same wamid calls the processor twice - no dedupe", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: SECRET });
    const post = handlerFor(router, "post");
    const raw = Buffer.from(JSON.stringify(PAYLOAD));
    for (let i = 0; i < 2; i++) {
      await post({ headers: { "x-hub-signature-256": sign(SECRET, raw) }, rawBody: raw, body: PAYLOAD } as any, fakeRes() as any);
      await flush();
    }
    expect(mp.processIncomingMessage).toHaveBeenCalledTimes(2);
  });

  it("a throwing processor does not crash the handler (caught, 200 already sent)", async () => {
    const router = await freshRouter({ WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_APP_SECRET: SECRET });
    const post = handlerFor(router, "post");
    mp.processIncomingMessage.mockRejectedValue(new Error("db down"));
    const raw = Buffer.from(JSON.stringify(PAYLOAD));
    const res = fakeRes();
    await post({ headers: { "x-hub-signature-256": sign(SECRET, raw) }, rawBody: raw, body: PAYLOAD } as any, res as any);
    await flush();
    expect(res.statusCode).toBe(200);
  });
});

describe("mounting", () => {
  it("the router is mounted by _core/index.ts at /webhooks/whatsapp", async () => {
    const indexSrc = await import("fs/promises").then((fs) => fs.readFile(new URL("../../_core/index.ts", import.meta.url), "utf-8"));
    expect(indexSrc).toMatch(/import whatsappWebhookRouter from ['"]\.\.\/routes\/webhooks\/whatsapp['"]/);
    expect(indexSrc).toMatch(/app\.use\(['"]\/webhooks\/whatsapp['"], whatsappWebhookRouter\)/);
  });
});
