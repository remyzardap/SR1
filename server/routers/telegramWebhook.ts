import type { Express } from "express";
import { getOrCreateTelegramUser } from "../services/telegram";
import { s1Route, buildS1SystemPrompt } from "./s1Router";

export function registerTelegramWebhookRoute(app: Express) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const OPENCLAW_WEBHOOK = process.env.OPENCLAW_WEBHOOK_URL;

  if (!TELEGRAM_TOKEN) {
    console.log("[Telegram] Bot token not configured. Webhook disabled.");
    return;
  }

  app.post(`/api/telegram/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
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
        const { config: agentConfig } = s1Route(messageText, false);
        const systemPrompt = buildS1SystemPrompt({ agent: "s1", label: "Kemma", reason: "chat", emoji: "🧠", color: "#E8442A" });

        const fullMessages = [
          { role: "system" as const, content: systemPrompt },
          { role: "user" as const, content: messageText },
        ];

        const llmResponse = await globalThis.fetch(`${agentConfig.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentConfig.apiKey}`,
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
      res.json({ ok: false, error: String(error) });
    }
  });

  console.log(`[Telegram] Webhook registered at /api/telegram/webhook/${TELEGRAM_TOKEN}`);
}

async function sendTelegramMessage(chatId: number | string, text: string, token: string) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.substring(0, 4096), // Telegram max message length
        parse_mode: "Markdown",
      }),
    });

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
