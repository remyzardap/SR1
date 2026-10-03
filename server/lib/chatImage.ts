/**
 * Drawing pictures from a chat: the `/image`, `/img` and `/draw` commands that
 * the Telegram webhook and the WhatsApp bridge hand to the image engines.
 *
 * The parser is pure (no engine, no database, no network) so every form of the
 * command is testable on its own. `runChatImage` does the part that costs money:
 * the per-chat limits, one job in flight per chat, and exactly the engine the
 * user asked for. An engine that is not configured is answered with a plain
 * "not available right now": the choice is the user's and every image costs
 * money, so there is never a quiet switch to another one (server/lib/fnImage.ts).
 *
 * Nothing a provider says reaches the chat. The reply is either an image with a
 * short caption or one line of plain, user-safe text.
 */

import { asc, eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  ENGINE_IDS,
  ENGINE_LABELS,
  ImageBlockedError,
  ImageNotConfiguredError,
  ImageTimeoutError,
  ImageUpstreamError,
  engineAvailable,
  generateImage,
  logImageUsage,
  resolveImageEngine,
  storeImage,
  type AspectRatio,
  type EngineId,
  type GeneratedImage,
  type ImageQuality,
} from "./fnImage";
import { BLOCKED_MESSAGE } from "./sensitive";
import { isAdminUser } from "../kemma/executors/vpsFiles";

export const MAX_CHAT_PROMPT_CHARS = 1000;
export const DEFAULT_CHAT_IMAGE_PER_HOUR = 6;
export const DEFAULT_CHAT_IMAGE_PER_DAY = 30;

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

export interface ChatImageCommand {
  kind: "image";
  prompt: string;
  engine: EngineId;
  quality: ImageQuality;
  aspectRatio: AspectRatio;
}

/** The command on its own, or a prompt the parser cannot use: answer with the usage line. */
export interface ChatImageHelp {
  kind: "help";
}

/** null means this message is not an image command and belongs to the chat model. */
export type ParsedChatImage = ChatImageCommand | ChatImageHelp | null;

/** `/image`, `/img`, `/draw`, optionally the Telegram `/command@BotName` form, then a space or nothing. */
const COMMAND_RE = /^\/(image|img|draw)(@[A-Za-z0-9_]+)?(?=$|\s)/i;

const QUALITY_WORDS: Record<string, ImageQuality> = { high: "high" };

/** `gpu` is the plain-language name for the forge engine, which is also the default. */
const ENGINE_WORDS: Record<string, EngineId> = { gpu: "forge", gemini: "gemini", qwen: "qwen", openai: "openai" };

const SHAPE_WORDS: Record<string, AspectRatio> = {
  square: "1:1",
  wide: "16:9",
  tall: "9:16",
  landscape: "4:3",
  portrait: "3:4",
};

/**
 * What the chat is told when the command carries no prompt. It states the limit
 * as well, because a prompt that is too long answers the same way.
 */
export const CHAT_IMAGE_USAGE =
  "Draw a picture: /img <what to draw>. Words you may put in front: high, gpu, gemini, qwen, openai, square, wide, tall, landscape, portrait. " +
  `For example: /img wide high a lighthouse at dawn. The prompt is up to ${MAX_CHAT_PROMPT_CHARS} characters.`;

/** The engine a chat command runs on when the message names none: CHAT_IMAGE_ENGINE, default forge. */
export function chatImageDefaultEngine(): EngineId {
  const fromEnv = (process.env.CHAT_IMAGE_ENGINE || "").trim().toLowerCase();
  return (ENGINE_IDS as readonly string[]).includes(fromEnv) ? (fromEnv as EngineId) : "forge";
}

/** One line telling the chat the work has started; a cold GPU needs warning. */
export function chatImageAck(engine: EngineId): string {
  return engine === "forge"
    ? "Starting the GPU. The first image can take a few minutes."
    : "Drawing...";
}

/**
 * One leading option word, matched from the three tables below so they stay the
 * only source of the grammar. A word is an option word only while the prompt has
 * not started, so the walk stops at the first word that is not one.
 */
const OPTION_WORD_RE = new RegExp(
  `^\\s*(${[...Object.keys(QUALITY_WORDS), ...Object.keys(ENGINE_WORDS), ...Object.keys(SHAPE_WORDS)].join("|")})(?=$|\\s)`,
  "i"
);

const IMAGE_NOUN = "(?:image|images|picture|pictures|photo|photos|pic|pics|illustration|drawing|painting|artwork|wallpaper|portrait|render|logo)";
const POLITE = "(?:(?:hey|hi|yo|ok|okay|please|pls|kindly)[,!]?\\s+)*(?:(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?)?(?:(?:please|pls)\\s+)?";
/** "draw / paint / sketch / illustrate (me) <something>": the verb alone is enough. */
const DRAW_VERB_RE = new RegExp(`^${POLITE}(?:draw|paint|sketch|illustrate)\\s+(?:me\\s+|us\\s+)?(.+)$`, "is");
/** "generate / create / make / render / design (me) a <image noun> of <something>": needs the picture word. */
const MAKE_VERB_RE = new RegExp(
  `^${POLITE}(?:generate|create|make|render|design|produce)\\s+(?:me\\s+|us\\s+)?(?:an?\\s+|some\\s+|the\\s+)?(?:\\w+\\s+){0,2}?${IMAGE_NOUN}\\s*(?:of|showing|with|about|:)?\\s*(.+)$`,
  "is"
);

/**
 * A plain sentence that clearly asks for a picture ("draw me a cat", "make a picture of a lighthouse").
 * Deliberately narrow: it must start with the request, so a question about drawing, or a sentence that
 * only mentions a picture, stays with the chat model. CHAT_IMAGE_NATURAL=0 turns it off.
 */
export function naturalImagePrompt(text: string): string | null {
  if ((process.env.CHAT_IMAGE_NATURAL || "").trim() === "0") return null;
  const message = (text || "").trim().replace(/\s+/g, " ");
  if (!message || message.length > MAX_CHAT_PROMPT_CHARS + 60) return null;
  const hit = DRAW_VERB_RE.exec(message) ?? MAKE_VERB_RE.exec(message);
  if (!hit) return null;
  const prompt = hit[1].trim().replace(/^[:,\-\s]+/, "").trim();
  // Need a real subject: at least two words, so "draw it" or "make a picture" is not enough.
  if (prompt.split(" ").length < 2 || prompt.length > MAX_CHAT_PROMPT_CHARS) return null;
  // "draw a conclusion", "draw the line" and similar are not pictures.
  if (/^(?:a\s+)?(?:conclusion|line|blank|attention|breath|inference|comparison|parallel|distinction)\b/i.test(prompt)) return null;
  return prompt;
}

/**
 * Reads the image command out of a chat message. Option words may come in any
 * order in front of the prompt; from the first word that is not one, the rest of
 * the message is the prompt exactly as it was typed.
 */
export function parseImageCommand(text: string): ParsedChatImage {
  const message = (text || "").trim();
  const head = COMMAND_RE.exec(message);
  if (!head) {
    const prompt = naturalImagePrompt(message);
    return prompt ? { kind: "image", prompt, engine: chatImageDefaultEngine(), quality: "standard", aspectRatio: "1:1" } : null;
  }

  const body = message.slice(head[0].length).trim();
  if (!body) return { kind: "help" };

  let engine = chatImageDefaultEngine();
  let quality: ImageQuality = "standard";
  let aspectRatio: AspectRatio = "1:1";

  let cursor = 0;
  for (;;) {
    const match = OPTION_WORD_RE.exec(body.slice(cursor));
    const key = match?.[1].toLowerCase();
    if (!match || !key) break;
    if (Object.hasOwn(QUALITY_WORDS, key)) quality = QUALITY_WORDS[key];
    else if (Object.hasOwn(ENGINE_WORDS, key)) engine = ENGINE_WORDS[key];
    else if (Object.hasOwn(SHAPE_WORDS, key)) aspectRatio = SHAPE_WORDS[key];
    else break;
    cursor += match[0].length;
  }

  const prompt = body.slice(cursor).trim();
  if (!prompt || prompt.length > MAX_CHAT_PROMPT_CHARS) return { kind: "help" };
  return { kind: "image", prompt, engine, quality, aspectRatio };
}

export interface ChatImageSuccess {
  ok: true;
  buffer: Buffer;
  mimeType: string;
  caption: string;
}

export interface ChatImageFault {
  ok: false;
  /** Plain text for the chat: never a provider body, a status or a stack. */
  message: string;
}

export type ChatImageResult = ChatImageSuccess | ChatImageFault;

/** Started jobs per chat, in memory only: a restart clears them. */
const startedAt = new Map<string, number[]>();
const inFlight = new Set<string>();

/**
 * Draws one picture for a chat. `chatKey` is the conversation (`telegram:<chat
 * id>` or `whatsapp:<jid>`) and is what both limits and the in-flight lock are
 * counted per.
 */
export async function runChatImage(opts: { chatKey: string; parsed: ChatImageCommand }): Promise<ChatImageResult> {
  const { chatKey } = opts;

  // Blocked prompts are refused before anything else; a sensitive one moves to Venice (the chat owner is an admin).
  const resolved = await resolveImageEngine({
    prompt: opts.parsed.prompt,
    engine: opts.parsed.engine,
    isAdmin: async () => {
      const owner = await chatImageOwnerUserId();
      return owner ? isAdminUser(owner) : false;
    },
  });
  if (resolved.blocked) return { ok: false, message: BLOCKED_MESSAGE };
  const parsed: ChatImageCommand = { ...opts.parsed, engine: resolved.engine };

  if (!engineAvailable(parsed.engine)) {
    return { ok: false, message: `${ENGINE_LABELS[parsed.engine]} is not available right now.` };
  }
  if (inFlight.has(chatKey)) {
    return { ok: false, message: "Still drawing your last image." };
  }

  const overLimit = takeSlot(chatKey);
  if (overLimit) return { ok: false, message: overLimit };

  inFlight.add(chatKey);
  try {
    const image = await generateImage({
      prompt: parsed.prompt,
      engine: parsed.engine,
      quality: parsed.quality,
      aspectRatio: parsed.aspectRatio,
    });
    // The copy for the owner's library is best effort: it must never delay or
    // replace the picture the chat is waiting for.
    await saveForOwner(parsed.prompt, image);
    return {
      ok: true,
      buffer: image.buffer,
      mimeType: image.mimeType,
      // The caption never names the engine or model: the picture is simply Kemma's.
      caption: "Kemma",
    };
  } catch (err) {
    return { ok: false, message: userSafeMessage(err) };
  } finally {
    inFlight.delete(chatKey);
  }
}

/**
 * Counts this attempt against both windows and returns the line to answer with
 * when the chat has used one of them up. Attempts are counted, successes as
 * well as failures, so a broken engine cannot be hammered for free.
 */
function takeSlot(chatKey: string): string | null {
  const now = Date.now();
  const perHour = envLimit("CHAT_IMAGE_PER_HOUR", DEFAULT_CHAT_IMAGE_PER_HOUR);
  const perDay = envLimit("CHAT_IMAGE_PER_DAY", DEFAULT_CHAT_IMAGE_PER_DAY);
  const marks = (startedAt.get(chatKey) ?? []).filter((at) => now - at < DAY_MS);

  if (marks.length >= perDay) {
    startedAt.set(chatKey, marks);
    return `You can draw ${perDay} images per day here. Please try again tomorrow.`;
  }
  if (marks.filter((at) => now - at < HOUR_MS).length >= perHour) {
    return `You can draw ${perHour} images per hour here. Please try again later.`;
  }

  marks.push(now);
  startedAt.set(chatKey, marks);
  return null;
}

function envLimit(name: string, fallback: number): number {
  const raw = Number((process.env[name] ?? "").trim());
  return Number.isInteger(raw) && raw > 0 ? raw : fallback;
}

/** The engine faults already carry a user-safe line; anything else gets the general one. */
function userSafeMessage(err: unknown): string {
  if (err instanceof ImageNotConfiguredError || err instanceof ImageTimeoutError || err instanceof ImageBlockedError) return err.message;
  if (err instanceof ImageUpstreamError) {
    console.error(`[chatImage] generation failed upstream${err.providerStatus ? ` (status ${err.providerStatus})` : ""}`);
    return "The image engine failed. Please try again.";
  }
  console.error("[chatImage] unexpected image fault:", err);
  return "The image engine failed. Please try again.";
}

/**
 * Stores the picture under the owner's own files and logs the cost, so a chat
 * image shows up in the same library as one drawn in the app. A missing account,
 * a missing database or a refused write only costs the copy, never the reply.
 */
async function saveForOwner(prompt: string, image: GeneratedImage): Promise<void> {
  try {
    const owner = await chatImageOwnerUserId();
    if (!owner) {
      console.warn("[chatImage] no owner account to save the image for");
      return;
    }
    await storeImage(owner, prompt, image);
    await logImageUsage(owner, image);
  } catch (err) {
    console.warn("[chatImage] could not save the image for the owner:", String(err));
  }
}

/**
 * The account a chat image belongs to, the same rule the WhatsApp bridge runs
 * under (server/services/whatsappBaileys.ts): WHATSAPP_KEMMA_USER_ID when it is
 * set, otherwise the lowest-id admin.
 */
export async function chatImageOwnerUserId(): Promise<number | null> {
  const database = await getDb();
  if (!database) return null;

  const forced = Number(process.env.WHATSAPP_KEMMA_USER_ID);
  const rows =
    Number.isInteger(forced) && forced > 0
      ? await database.select({ id: users.id }).from(users).where(eq(users.id, forced)).limit(1)
      : await database
          .select({ id: users.id })
          .from(users)
          .where(eq(users.role, "admin"))
          .orderBy(asc(users.id))
          .limit(1);
  return rows[0]?.id ?? null;
}
