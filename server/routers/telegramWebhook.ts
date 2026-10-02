import type { Express } from "express";
import crypto from "crypto";
import {
  CHAT_IMAGE_USAGE,
  chatImageAck,
  parseImageCommand,
  runChatImage,
  type ChatImageCommand,
  type ChatImageSuccess,
} from "../lib/chatImage";
import { s1Blend, buildS1SystemPrompt, resolveBearer } from "./s1Router";

/** Telegram chat actions expire after 5 s, so a long job refreshes the one it set. */
const CHAT_ACTION_MS = 4_000;
const CAPTION_MAX_CHARS = 1024;

/** A redelivered image update must not pay for the same picture twice. */
const SEEN_IMAGE_UPDATES = 200;
const seenImageUpdates = new Set<number>();

/**
 * Who may talk to the bot. TELEGRAM_ALLOWED_USER_IDS is a comma-separated list of numeric Telegram user ids.
 * Empty means nobody: the bot ignores everyone, so a stranger who finds it cannot spend model budget.
 */
export function isTelegramUserAllowed(userId: unknown, env: string | undefined = process.env.TELEGRAM_ALLOWED_USER_IDS): boolean {
  const id = String(userId ?? "").trim();
  if (!/^\d+$/.test(id)) return false;
  return (env ?? "").split(",").map((v) => v.trim()).filter(Boolean).includes(id);
}

export function registerTelegramWebhookRoute(app: Express) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
  const OPENCLAW_WEBHOOK = process.env.OPENCLAW_WEBHOOK_URL;

  if (!TELEGRAM_TOKEN || !WEBHOOK_SECRET) {
    console.log("[Telegram] Bot token or webhook secret not configured. Webhook disabled.");
    return;
  }

  app.post("/api/telegram/webhook", async (req, res) => {
    const provided = req.header("x-telegram-bot-api-secret-token") || "";
    let validSecret = false;
    try {
      const a = Buffer.from(provided);
      const b = Buffer.from(WEBHOOK_SECRET);
      validSecret = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      validSecret = false;
    }
    if (!validSecret) {
      res.status(401).json({ ok: false });
      return;
    }

    try {
      const update = req.body;

      if (!update.message || !update.message.text) {
        return res.json({ ok: true });
      }

      const telegramUserId = update.message.from.id;
      // Ignore anyone who is not on the allowlist: no reply, no model call, no message text in the log.
      if (!isTelegramUserAllowed(telegramUserId)) return res.json({ ok: true });
      const messageText = update.message.text;
      const chatId = update.message.chat.id;
      const username = update.message.from.username || `user_${telegramUserId}`;

      const command = parseImageCommand(messageText);
      if (command) {
        // A cold GPU can outlive the webhook timeout, and Telegram redelivers any
        // update that was not answered in time: answer first, draw in the background.
        res.json({ ok: true });
        if (!isRedeliveredImageUpdate(update.update_id)) {
          const drawing =
            command.kind === "image"
              ? drawForChat(chatId, command, TELEGRAM_TOKEN)
              : sendTelegramMessage(chatId, CHAT_IMAGE_USAGE, TELEGRAM_TOKEN);
          void drawing.catch((error) => console.error("[Telegram] Image command error:", error));
        }
        return;
      }

      console.log(`[Telegram] Message from ${username} (${telegramUserId}): ${messageText.substring(0, 50)}`);

      // Send typing indicator
      await sendTelegramAction(chatId, "typing", TELEGRAM_TOKEN);

      let s1Response: string;

      if (OPENCLAW_WEBHOOK) {
        // Route through OpenClaw on VPS
        console.log(`[Telegram] Forwarding to OpenClaw: ${OPENCLAW_WEBHOOK}`);
        const openclawResponse = await globalThis.fetch(OPENCLAW_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: telegramUserId,
            username,
            message: messageText,
            source: "telegram",
            chatId,
          }),
        });

        if (!openclawResponse.ok) {
          console.error(`[Telegram] OpenClaw error: ${openclawResponse.status}`);
          await sendTelegramMessage(chatId, "OpenClaw is thinking. Try again.", TELEGRAM_TOKEN);
          return res.json({ ok: true });
        }

        const openclawData = await openclawResponse.json();
        s1Response = openclawData.response || openclawData.message || "No response from OpenClaw.";
      } else {
        // Direct S1 routing (fallback)
        console.log("[Telegram] No OpenClaw configured. Using direct S1 routing.");
        const systemPrompt = buildS1SystemPrompt({ agent: "s1", label: "Kemma", reason: "chat", emoji: "🧠", color: "#E8442A" });

        const { config: agentConfig, messages: fullMessages } = await s1Blend(
          messageText,
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: messageText },
          ],
          { draftMaxTokens: 500 },
        );

        const llmResponse = await globalThis.fetch(`${agentConfig.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await resolveBearer(agentConfig)}`,
          },
          body: JSON.stringify({
            model: agentConfig.model,
            messages: fullMessages,
            max_tokens: 500,
          }),
        });

        if (!llmResponse.ok) {
          const errText = await llmResponse.text();
          console.error(`[Telegram] LLM error: ${llmResponse.status} ${errText}`);
          await sendTelegramMessage(chatId, "S1 is thinking. Try again.", TELEGRAM_TOKEN);
          return res.json({ ok: true });
        }

        const llmData = await llmResponse.json();
        s1Response = llmData.choices?.[0]?.message?.content || "No response.";
      }

      // Send response back to Telegram
      await sendTelegramMessage(chatId, s1Response, TELEGRAM_TOKEN);

      res.json({ ok: true });
    } catch (error) {
      console.error("[Telegram] Webhook error:", error);
      res.json({ ok: false });
    }
  });

  console.log("[Telegram] Webhook registered at /api/telegram/webhook");
}

async function sendTelegramMessage(chatId: number | string, text: string, token: string) {
  try {
    const body = {
      chat_id: chatId,
      text: text.substring(0, 4096), // Telegram max message length
      parse_mode: "Markdown",
    };
    let response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Telegram rejects unparseable Markdown (400 "can't parse entities") for
      // ordinary model output like "2 * 3 * 4". Retry as plain text so the
      // reply still reaches the user.
      console.warn(`[Telegram] Markdown send failed (${response.status}); retrying as plain text`);
      const { parse_mode: _drop, ...plainBody } = body;
      response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plainBody),
      });
    }

    if (!response.ok) {
      console.error(`[Telegram] Failed to send message: ${response.status}`);
    }
  } catch (error) {
    console.error("[Telegram] Send message error:", error);
  }
}

async function sendTelegramAction(chatId: number | string, action: string, token: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch (error) {
    console.error("[Telegram] Action error:", error);
  }
}

/**
 * True the second time the same image update arrives. Telegram answers an
 * unacknowledged webhook with a redelivery, and a redelivery of a drawing
 * request would pay for the picture again.
 */
function isRedeliveredImageUpdate(updateId: unknown): boolean {
  const id = Number(updateId);
  if (!Number.isInteger(id)) return false;
  if (seenImageUpdates.has(id)) return true;
  seenImageUpdates.add(id);
  if (seenImageUpdates.size > SEEN_IMAGE_UPDATES) {
    const oldest = seenImageUpdates.values().next().value;
    if (oldest !== undefined) seenImageUpdates.delete(oldest);
  }
  return false;
}

/** The whole drawing job, running after the webhook has already answered. */
async function drawForChat(chatId: number, command: ChatImageCommand, token: string) {
  await sendTelegramMessage(chatId, chatImageAck(command.engine), token);

  // upload_photo says what is coming; it is refreshed until the bytes are ready,
  // because the action itself expires after 5 seconds.
  void sendTelegramAction(chatId, "upload_photo", token);
  const keepAlive = setInterval(() => void sendTelegramAction(chatId, "upload_photo", token), CHAT_ACTION_MS);

  try {
    const result = await runChatImage({ chatKey: `telegram:${chatId}`, parsed: command });
    if (result.ok) await sendTelegramPhoto(chatId, result, token);
    else await sendTelegramMessage(chatId, result.message, token);
  } finally {
    clearInterval(keepAlive);
  }
}

async function sendTelegramPhoto(chatId: number, image: ChatImageSuccess, token: string) {
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("photo", new Blob([Uint8Array.from(image.buffer)], { type: image.mimeType }), `image.${extensionFor(image.mimeType)}`);
    form.append("caption", image.caption.substring(0, CAPTION_MAX_CHARS));

    const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
    if (!response.ok) {
      // Only the status: a Telegram body can quote the caption back at us.
      console.error(`[Telegram] Failed to send photo: ${response.status}`);
    }
  } catch (error) {
    console.error("[Telegram] Send photo error:", error);
  }
}

/** Telegram keeps the file under this name; the type still comes from the bytes. */
function extensionFor(mimeType: string): string {
  const subtype = (mimeType.split("/")[1] || "").split("+")[0].replace(/[^a-z0-9]/g, "");
  if (subtype === "jpeg") return "jpg";
  return subtype || "png";
}
