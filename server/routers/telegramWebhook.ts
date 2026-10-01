import type { Express } from "express";
import crypto from "crypto";
import { s1Blend, buildS1SystemPrompt, resolveBearer } from "./s1Router";

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
      const messageText = update.message.text;
      const chatId = update.message.chat.id;
      const username = update.message.from.username || `user_${telegramUserId}`;

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
