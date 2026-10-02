import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The engine layer is the only thing runChatImage talks to, so it is mocked with
// its real error classes and labels kept: the caption and the fault wording are
// what this suite checks. No provider, no database, no network.
const engine = vi.hoisted(() => ({
  engineAvailable: vi.fn((_engine: string) => true),
  generateImage: vi.fn(),
  storeImage: vi.fn(),
  logImageUsage: vi.fn(),
}));

vi.mock("./fnImage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fnImage")>();
  return {
    ...actual,
    engineAvailable: engine.engineAvailable,
    generateImage: engine.generateImage,
    storeImage: engine.storeImage,
    logImageUsage: engine.logImageUsage,
  };
});

// The fake answers only the select().from().where().orderBy().limit() chain the
// owner lookup uses, from a table of fake ids. Nothing connects anywhere.
const db = vi.hoisted(() => ({ available: true, rows: [{ id: 7 }] as Array<{ id: number }> }));

vi.mock("../db", () => ({
  getDb: vi.fn(async () =>
    db.available
      ? {
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => ({ limit: async () => db.rows }),
                limit: async () => db.rows,
              }),
            }),
          }),
        }
      : null
  ),
  createFile: vi.fn(async () => {}),
}));

import { ImageUpstreamError, type GeneratedImage } from "./fnImage";
import {
  CHAT_IMAGE_USAGE,
  MAX_CHAT_PROMPT_CHARS,
  chatImageAck,
  chatImageDefaultEngine,
  parseImageCommand,
  runChatImage,
  type ChatImageCommand,
} from "./chatImage";

const ENV_NAMES = ["CHAT_IMAGE_ENGINE", "CHAT_IMAGE_PER_HOUR", "CHAT_IMAGE_PER_DAY", "WHATSAPP_KEMMA_USER_ID"];
const saved = new Map<string, string | undefined>();
let chatSeq = 0;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

/** A chat no other test has drawn in, so the in-memory limits start clean. */
const freshChat = () => `telegram:chat-${(chatSeq += 1)}`;

const command = (overrides: Partial<ChatImageCommand> = {}): ChatImageCommand => ({
  kind: "image",
  prompt: "a lighthouse at dawn",
  engine: "forge",
  quality: "standard",
  aspectRatio: "1:1",
  ...overrides,
});

const generated = (overrides: Partial<GeneratedImage> = {}): GeneratedImage => ({
  engine: "forge",
  model: "realisticVision_v60B1.safetensors",
  mimeType: "image/png",
  width: 512,
  height: 512,
  buffer: Buffer.from("fake image bytes"),
  ...overrides,
});

const draw = (chatKey = freshChat(), parsed = command()) => runChatImage({ chatKey, parsed });
const ownerWarning = () => warnSpy.mock.calls.filter((call) => String(call[0]).includes("owner"));

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  db.available = true;
  db.rows = [{ id: 7 }];
  engine.engineAvailable.mockReturnValue(true);
  engine.generateImage.mockResolvedValue(generated());
  engine.storeImage.mockResolvedValue({ key: "users/7/images/a.png", url: "/files/users/7/images/a.png", sizeBytes: 16 });
  engine.logImageUsage.mockResolvedValue(undefined);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("parseImageCommand: the command itself", () => {
  it("takes the three command words with a prompt", () => {
    for (const word of ["/image", "/img", "/draw"]) {
      expect(parseImageCommand(`${word} a lighthouse at dawn`)).toEqual({
        kind: "image",
        prompt: "a lighthouse at dawn",
        engine: "forge",
        quality: "standard",
        aspectRatio: "1:1",
      });
    }
  });

  it("is case-insensitive and takes the Telegram /command@BotName form", () => {
    expect(parseImageCommand("/IMG a red fox")?.kind).toBe("image");
    expect(parseImageCommand("/Image@SutaeruBot a red fox")?.kind).toBe("image");
    expect(parseImageCommand("/Draw@Kemma_Bot2 a red fox")?.kind).toBe("image");
    expect(parseImageCommand("/iMaGe@SomeBot a red fox")).toMatchObject({ kind: "image", prompt: "a red fox" });
  });

  it("only counts a command at the very start of the message", () => {
    expect(parseImageCommand("please /img a red fox")).toBeNull();
    expect(parseImageCommand("hello")).toBeNull();
    expect(parseImageCommand("")).toBeNull();
  });

  it("does not match a longer word that only starts like a command", () => {
    expect(parseImageCommand("/images a cat")).toBeNull();
    expect(parseImageCommand("/imagecat a cat")).toBeNull();
    expect(parseImageCommand("/img_1 a cat")).toBeNull();
    expect(parseImageCommand("/drawing a cat")).toBeNull();
  });

  it("answers a bare command with help", () => {
    expect(parseImageCommand("/image")).toEqual({ kind: "help" });
    expect(parseImageCommand("/img@SutaeruBot")).toEqual({ kind: "help" });
    expect(parseImageCommand("/draw   ")).toEqual({ kind: "help" });
    expect(parseImageCommand("/img high wide")).toEqual({ kind: "help" });
  });
});

describe("parseImageCommand: the option words", () => {
  it("reads the quality word", () => {
    expect(parseImageCommand("/img high a red fox")).toMatchObject({ quality: "high", prompt: "a red fox" });
    expect(parseImageCommand("/img HIGH a red fox")).toMatchObject({ quality: "high" });
    expect(parseImageCommand("/img a red fox")).toMatchObject({ quality: "standard" });
  });

  it("reads every engine word, gpu being the forge engine", () => {
    expect(parseImageCommand("/img gpu a red fox")).toMatchObject({ engine: "forge" });
    expect(parseImageCommand("/img gemini a red fox")).toMatchObject({ engine: "gemini" });
    expect(parseImageCommand("/img qwen a red fox")).toMatchObject({ engine: "qwen" });
    expect(parseImageCommand("/img openai a red fox")).toMatchObject({ engine: "openai" });
    expect(parseImageCommand("/img a red fox")).toMatchObject({ engine: "forge" });
  });

  it("reads every shape word onto one of the engine ratios", () => {
    expect(parseImageCommand("/img square a red fox")).toMatchObject({ aspectRatio: "1:1" });
    expect(parseImageCommand("/img wide a red fox")).toMatchObject({ aspectRatio: "16:9" });
    expect(parseImageCommand("/img tall a red fox")).toMatchObject({ aspectRatio: "9:16" });
    expect(parseImageCommand("/img landscape a red fox")).toMatchObject({ aspectRatio: "4:3" });
    expect(parseImageCommand("/img portrait a red fox")).toMatchObject({ aspectRatio: "3:4" });
  });

  it("takes the option words in any order and as many as are typed", () => {
    expect(parseImageCommand("/img high wide gemini a red fox")).toEqual({
      kind: "image",
      prompt: "a red fox",
      engine: "gemini",
      quality: "high",
      aspectRatio: "16:9",
    });
    expect(parseImageCommand("/img portrait high qwen a red fox")).toMatchObject({
      engine: "qwen",
      quality: "high",
      aspectRatio: "3:4",
      prompt: "a red fox",
    });
  });

  it("lets the last word of a kind decide when two are typed", () => {
    expect(parseImageCommand("/img wide tall a red fox")).toMatchObject({ aspectRatio: "9:16" });
    expect(parseImageCommand("/img gemini openai a red fox")).toMatchObject({ engine: "openai" });
  });

  it("starts the prompt at the first word that is not an option word and keeps it as typed", () => {
    expect(parseImageCommand("/img a tall cat")).toMatchObject({ prompt: "a tall cat", aspectRatio: "1:1" });
    expect(parseImageCommand("/img high a very high wall")).toMatchObject({ prompt: "a very high wall" });
    expect(parseImageCommand("/img wide A Fox, urgently!")).toMatchObject({ prompt: "A Fox, urgently!" });
    expect(parseImageCommand("/img highly detailed fox")).toMatchObject({ prompt: "highly detailed fox", quality: "standard" });
    expect(parseImageCommand("/img toString of a cat")).toMatchObject({ prompt: "toString of a cat" });
  });

  it("keeps the rest of the message as it was typed", () => {
    expect(parseImageCommand("/img a fox,   then a lane")).toMatchObject({ prompt: "a fox,   then a lane" });
  });
});

describe("parseImageCommand: the prompt length", () => {
  it("takes a prompt of exactly the limit", () => {
    const prompt = "x".repeat(MAX_CHAT_PROMPT_CHARS);
    expect(parseImageCommand(`/img ${prompt}`)).toMatchObject({ kind: "image", prompt });
  });

  it("answers help when the prompt is over the limit, and the usage states it", () => {
    expect(parseImageCommand(`/img ${"x".repeat(MAX_CHAT_PROMPT_CHARS + 1)}`)).toEqual({ kind: "help" });
    expect(CHAT_IMAGE_USAGE).toContain(String(MAX_CHAT_PROMPT_CHARS));
  });

  it("counts the limit on the prompt, not on the option words", () => {
    const prompt = "x".repeat(MAX_CHAT_PROMPT_CHARS);
    expect(parseImageCommand(`/img high wide ${prompt}`).kind).toBe("image");
  });
});

describe("chatImageDefaultEngine and the acknowledgement", () => {
  it("takes the default engine from CHAT_IMAGE_ENGINE", () => {
    expect(chatImageDefaultEngine()).toBe("forge");
    process.env.CHAT_IMAGE_ENGINE = "gemini";
    expect(chatImageDefaultEngine()).toBe("gemini");
    expect(parseImageCommand("/img a red fox")).toMatchObject({ engine: "gemini" });
  });

  it("falls back to the GPU engine on anything unknown", () => {
    process.env.CHAT_IMAGE_ENGINE = "Midjourney";
    expect(chatImageDefaultEngine()).toBe("forge");
    expect(parseImageCommand("/img a red fox")).toMatchObject({ engine: "forge" });
  });

  it("warns about the cold GPU and says nothing else for the other engines", () => {
    expect(chatImageAck("forge")).toBe("Starting the GPU. The first image can take a few minutes.");
    expect(chatImageAck("gemini")).toBe("Drawing...");
    expect(chatImageAck("qwen")).toBe("Drawing...");
    expect(chatImageAck("openai")).toBe("Drawing...");
  });
});

describe("runChatImage", () => {
  it("draws on the engine it was given and captions it with the model that ran", async () => {
    engine.generateImage.mockResolvedValueOnce(generated({ model: "flux1-dev-bnb-nf4-v2.safetensors" }));

    const out = await draw(freshChat(), command({ quality: "high" }));

    expect(engine.generateImage).toHaveBeenCalledWith({
      prompt: "a lighthouse at dawn",
      engine: "forge",
      quality: "high",
      aspectRatio: "1:1",
    });
    expect(out).toEqual({
      ok: true,
      buffer: Buffer.from("fake image bytes"),
      mimeType: "image/png",
      caption: "Stable Diffusion · flux1-dev-bnb-nf4-v2.safetensors",
    });
  });

  it("says the engine is not available and never switches to another one", async () => {
    engine.engineAvailable.mockImplementation((id: string) => id !== "forge");

    expect(await draw(freshChat(), command({ engine: "forge" }))).toEqual({
      ok: false,
      message: "Stable Diffusion is not available right now.",
    });
    expect(await draw(freshChat(), command({ engine: "gemini" }))).toMatchObject({ ok: true });
    expect(engine.generateImage).toHaveBeenCalledTimes(1);
    expect(engine.generateImage.mock.calls[0][0].engine).toBe("gemini");
  });

  it("holds the per-chat hourly limit and not another chat", async () => {
    process.env.CHAT_IMAGE_PER_HOUR = "2";
    process.env.CHAT_IMAGE_PER_DAY = "10";
    const chatKey = freshChat();

    expect((await draw(chatKey)).ok).toBe(true);
    expect((await draw(chatKey)).ok).toBe(true);
    expect(await draw(chatKey)).toEqual({
      ok: false,
      message: "You can draw 2 images per hour here. Please try again later.",
    });
    expect(engine.generateImage).toHaveBeenCalledTimes(2);
    expect((await draw()).ok).toBe(true);
  });

  it("holds the per-chat daily limit", async () => {
    process.env.CHAT_IMAGE_PER_HOUR = "99";
    process.env.CHAT_IMAGE_PER_DAY = "2";
    const chatKey = freshChat();

    await draw(chatKey);
    await draw(chatKey);

    expect(await draw(chatKey)).toEqual({
      ok: false,
      message: "You can draw 2 images per day here. Please try again tomorrow.",
    });
    expect(engine.generateImage).toHaveBeenCalledTimes(2);
  });

  it("defaults to 6 an hour and 30 a day on rolling windows", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const chatKey = freshChat();

      for (let hour = 0; hour < 4; hour++) {
        for (let i = 0; i < 6; i++) expect((await draw(chatKey)).ok).toBe(true);
        expect(await draw(chatKey)).toEqual({
          ok: false,
          message: "You can draw 6 images per hour here. Please try again later.",
        });
        vi.advanceTimersByTime(61 * 60_000);
      }

      // The fifth hour fills the day without filling any hour again.
      for (let i = 0; i < 6; i++) expect((await draw(chatKey)).ok).toBe(true);
      vi.advanceTimersByTime(61 * 60_000);

      expect(await draw(chatKey)).toEqual({
        ok: false,
        message: "You can draw 30 images per day here. Please try again tomorrow.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts a failed attempt too, so a broken engine cannot be hammered for free", async () => {
    process.env.CHAT_IMAGE_PER_HOUR = "1";
    const chatKey = freshChat();
    engine.generateImage.mockRejectedValueOnce(new ImageUpstreamError(503));

    expect(await draw(chatKey)).toMatchObject({ ok: false });
    expect(await draw(chatKey)).toEqual({
      ok: false,
      message: "You can draw 1 images per hour here. Please try again later.",
    });
  });

  it("draws one job at a time per chat and never blocks another chat", async () => {
    let release: (image: GeneratedImage) => void = () => {};
    engine.generateImage.mockImplementationOnce(
      () =>
        new Promise<GeneratedImage>((resolve) => {
          release = resolve;
        })
    );
    const chatKey = freshChat();

    const first = draw(chatKey);
    expect(await draw(chatKey)).toEqual({ ok: false, message: "Still drawing your last image." });
    expect((await draw()).ok).toBe(true);

    release(generated());
    expect(await first).toMatchObject({ ok: true });
    // The lock is gone once the job is done, even for the same chat.
    expect(await draw(chatKey)).toMatchObject({ ok: true });
  });

  it("releases the lock when the engine fails", async () => {
    const chatKey = freshChat();
    engine.generateImage.mockRejectedValueOnce(new ImageUpstreamError(503));

    expect(await draw(chatKey)).toMatchObject({ ok: false });
    expect(await draw(chatKey)).toMatchObject({ ok: true });
  });

  it("answers an engine fault with one plain line and keeps the provider out", async () => {
    engine.generateImage.mockRejectedValueOnce(new ImageUpstreamError(503));

    const out = await draw();

    expect(out).toEqual({ ok: false, message: "The image engine failed. Please try again." });
    expect(JSON.stringify(out)).not.toContain("503");
    expect(JSON.stringify(out)).not.toContain("realisticVision");
  });

  it("keeps an unexpected fault message out of the reply", async () => {
    engine.generateImage.mockRejectedValueOnce(new Error("connect to fake-host.test failed with fake-key"));

    const out = await draw();

    expect(out).toEqual({ ok: false, message: "The image engine failed. Please try again." });
    expect(JSON.stringify(out)).not.toContain("fake-key");
    expect(JSON.stringify(out)).not.toContain("fake-host");
  });

  it("saves the picture and the usage row for the owner", async () => {
    const image = generated();
    engine.generateImage.mockResolvedValueOnce(image);

    expect(await draw()).toMatchObject({ ok: true });
    expect(engine.storeImage).toHaveBeenCalledWith(7, "a lighthouse at dawn", image);
    expect(engine.logImageUsage).toHaveBeenCalledWith(7, image);
  });

  it("takes the owner from WHATSAPP_KEMMA_USER_ID when it is set", async () => {
    process.env.WHATSAPP_KEMMA_USER_ID = "42";
    db.rows = [{ id: 42 }];

    await draw();

    expect(engine.storeImage.mock.calls[0][0]).toBe(42);
  });

  it("still sends the picture when there is no owner account to save it for", async () => {
    db.rows = [];

    const out = await draw();

    expect(out).toMatchObject({ ok: true, caption: "Stable Diffusion · realisticVision_v60B1.safetensors" });
    expect(engine.storeImage).not.toHaveBeenCalled();
    expect(ownerWarning()).toHaveLength(1);
  });

  it("still sends the picture when storage refuses the write", async () => {
    engine.storeImage.mockRejectedValueOnce(new Error("Database not available"));

    const out = await draw();

    expect(out).toMatchObject({ ok: true });
    expect(ownerWarning()).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("draws without a database at all", async () => {
    db.available = false;

    const out = await draw();

    expect(out).toMatchObject({ ok: true });
    expect(engine.storeImage).not.toHaveBeenCalled();
    expect(ownerWarning()).toHaveLength(1);
  });
});
