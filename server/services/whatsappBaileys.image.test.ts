import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// The Baileys socket is a mock: this suite never opens a WhatsApp connection.
// Only the image command hook inside handle() is under test, so the real
// chatImage parser runs and only the engine call is replaced.
const socket = vi.hoisted(() => ({
  handlers: {} as Record<string, (arg: any) => void>,
  sendMessage: vi.fn(async () => ({ key: { id: "own-1" } })),
  sendPresenceUpdate: vi.fn(async () => {}),
}));

vi.mock("@whiskeysockets/baileys", () => ({
  default: () => ({
    ev: {
      on: (name: string, cb: (arg: any) => void) => {
        socket.handlers[name] = cb;
      },
      removeAllListeners: () => {},
    },
    user: { id: "19999999999@s.whatsapp.net" },
    authState: { creds: { registered: true } },
    sendMessage: socket.sendMessage,
    sendPresenceUpdate: socket.sendPresenceUpdate,
    end: () => {},
    requestPairingCode: async () => "ABCDEFGH",
  }),
  useMultiFileAuthState: async () => ({ state: { creds: {} }, saveCreds: async () => {} }),
  DisconnectReason: { loggedOut: 500 },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
  Browsers: { macOS: () => ["x", "y", "z"] },
}));

const chat = vi.hoisted(() => ({ runChatImage: vi.fn() }));

vi.mock("../lib/chatImage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/chatImage")>();
  return { ...actual, runChatImage: chat.runChatImage };
});

const kemma = vi.hoisted(() => ({ execute: vi.fn(async () => ({ response: "text answer" })) }));

vi.mock("../kemma/engine", () => ({ kemmaExecute: kemma.execute }));

// A table of fake ids behind the same select().from().where().orderBy().limit()
// chain the bridge's resolveUser() uses. Nothing connects anywhere.
vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => [{ id: 7, name: "Admin" }] }),
          limit: async () => [{ id: 7, name: "Admin" }],
        }),
      }),
    }),
  })),
}));

import type { ChatImageSuccess } from "../lib/chatImage";

const OWNED_NUMBER = "15550001111";
const JID = `${OWNED_NUMBER}@s.whatsapp.net`;
const ENV_NAMES = ["WHATSAPP_BAILEYS", "WHATSAPP_ALLOWED_NUMBERS", "WHATSAPP_PAIR_NUMBER", "WHATSAPP_KEMMA_USER_ID", "CHAT_IMAGE_ENGINE"];
const saved = new Map<string, string | undefined>();
let messageId = 0;

const drawn = (): ChatImageSuccess => ({
  ok: true,
  buffer: Buffer.from("fake png bytes"),
  mimeType: "image/png",
  caption: "Stable Diffusion · realisticVision_v60B1.safetensors",
});

const message = (text: string, from = JID) => ({
  key: { remoteJid: from, fromMe: false, id: `m${(messageId += 1)}` },
  message: { conversation: text },
});

const payloads = () => socket.sendMessage.mock.calls.map((call) => call[1]);

/**
 * Feeds one message to the mocked socket and waits until the bridge has sent
 * what the check asks for. The wait is generous: importing the bridge pulls the
 * whole engine chain, which is slow on a loaded CI worker.
 */
async function receive(text: string, until: (sent: any[]) => boolean, from = JID) {
  socket.handlers["messages.upsert"]?.({ type: "notify", messages: [message(text, from)] });
  await vi.waitFor(
    () => {
      if (!until(payloads())) throw new Error("still waiting for the WhatsApp reply");
    },
    { timeout: 15_000, interval: 25 }
  );
  return payloads();
}

async function boot() {
  const wa = await import("./whatsappBaileys");
  wa.startWhatsAppBaileys();
  await vi.waitFor(() => expect(socket.handlers["messages.upsert"]).toBeTruthy(), { timeout: 15_000, interval: 25 });
  return wa;
}

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.WHATSAPP_BAILEYS = "1";
  process.env.WHATSAPP_ALLOWED_NUMBERS = OWNED_NUMBER;
  socket.handlers = {};
  socket.sendMessage.mockClear();
  socket.sendPresenceUpdate.mockClear();
  chat.runChatImage.mockReset();
  chat.runChatImage.mockResolvedValue(drawn());
  kemma.execute.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("whatsapp image command hook", { timeout: 30_000 }, () => {
  it("acknowledges, draws and sends the picture back as an image message", async () => {
    await boot();

    const sends = await receive("/img wide a red fox", (sent) => sent.some((p) => p.image));

    expect(chat.runChatImage).toHaveBeenCalledTimes(1);
    expect(chat.runChatImage.mock.calls[0][0]).toEqual({
      chatKey: `whatsapp:${JID}`,
      parsed: { kind: "image", prompt: "a red fox", engine: "forge", quality: "standard", aspectRatio: "16:9" },
    });
    expect(sends[0]).toEqual({ text: "Starting the GPU. The first image can take a few minutes." });
    expect(sends[1]).toEqual({ image: Buffer.from("fake png bytes"), caption: "Stable Diffusion · realisticVision_v60B1.safetensors" });
    expect(socket.sendMessage.mock.calls[1][0]).toBe(JID);
  });

  it("says Drawing for an engine that is not the GPU", async () => {
    process.env.CHAT_IMAGE_ENGINE = "gemini";
    await boot();

    await receive("/img a red fox", (sent) => sent.some((p) => p.image));

    expect(payloads()[0]).toEqual({ text: "Drawing..." });
  });

  it("answers a bare command with the usage line and draws nothing", async () => {
    await boot();

    const sends = await receive("/draw", (sent) => String(sent[0]?.text ?? "").includes("Draw a picture"));

    expect(String(sends[0].text)).toContain("Draw a picture");
    expect(chat.runChatImage).not.toHaveBeenCalled();
  });

  it("answers a failed draw with one plain line and sends no image", async () => {
    chat.runChatImage.mockResolvedValueOnce({ ok: false, message: "Stable Diffusion is not available right now." });
    await boot();

    const sends = await receive("/img a red fox", (sent) => String(sent[1]?.text ?? "").includes("not available right now"));

    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual({ text: "Stable Diffusion is not available right now." });
    expect(sends.some((payload) => payload.image)).toBe(false);
  });

  it("leaves an ordinary message on the Kemma path", async () => {
    await boot();

    const sends = await receive("how is the weather", (sent) => String(sent[0]?.text ?? "") === "text answer");

    expect(chat.runChatImage).not.toHaveBeenCalled();
    expect(kemma.execute).toHaveBeenCalledTimes(1);
    expect(sends[0]).toEqual({ text: "text answer" });
  });

  it("never draws for a number that is not allowlisted", async () => {
    await boot();

    socket.handlers["messages.upsert"]?.({
      type: "notify",
      messages: [message("/img a red fox", "15559998888@s.whatsapp.net")],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(chat.runChatImage).not.toHaveBeenCalled();
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });
});
