import { sendWhatsAppMessage } from "../routes/webhooks/whatsapp";
import { nanoid } from "nanoid";

export interface IncomingWhatsAppMessage {
  messageId: string;
  from: string;
  senderName: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "document"
    | "video"
    | "sticker"
    | "location";
  timestamp: number;
  text?: string;
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  phoneNumberId: string;
}

// ---------------------------------------------------------------------------
// OCR Placeholder — wire up real OCR integration here (Google Vision, etc.)
// ---------------------------------------------------------------------------
async function processReceiptWithOCR(_imageData: {
  mediaId: string;
  mimeType: string;
}): Promise<{
  merchantName?: string;
  total?: number;
  items?: string[];
  rawText: string;
}> {
  console.log("[OCR] Processing image:", _imageData.mediaId);
  // TODO: Replace with actual OCR service call
  return { rawText: "" };
}

// ---------------------------------------------------------------------------
// User lookup — find a Sutaeru user by their WhatsApp number
// Note: users table doesn't have a phone column yet — this is a placeholder
// ---------------------------------------------------------------------------
async function findUserByPhone(_phone: string) {
  // TODO: Once phone column is added to users table, query by phone
  // For now, return null (user not found) to trigger the signup prompt
  return null;
}

// ---------------------------------------------------------------------------
// Command parsing
// ---------------------------------------------------------------------------
interface ParsedCommand {
  intent: "list_tasks" | "help" | "create_task" | "unknown";
  content: string;
}

function parseTextCommand(text: string): ParsedCommand {
  const lower = text.trim().toLowerCase();

  if (/^(list|show tasks?|my tasks?)/.test(lower)) {
    return { intent: "list_tasks", content: text };
  }

  if (/^(help|\?)/.test(lower)) {
    return { intent: "help", content: text };
  }

  const cleanedContent = text
    .replace(/^(task:|todo:|remind me to)/i, "")
    .trim();

  return { intent: "create_task", content: cleanedContent };
}

// ---------------------------------------------------------------------------
// Reply helpers
// ---------------------------------------------------------------------------
function helpMessage(): string {
  return [
    "👋 *Sutaeru WhatsApp Bot*",
    "",
    "Here's what you can do:",
    '• Send any text to create a task (e.g. "Buy groceries")',
    "• Send a photo of a receipt to log it automatically",
    "• Type *list* to see your pending tasks",
    "• Type *help* to see this message again",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function processIncomingMessage(
  msg: IncomingWhatsAppMessage
): Promise<void> {
  const { from, senderName, type, text, image, phoneNumberId } = msg;

  async function reply(replyText: string) {
    try {
      await sendWhatsAppMessage(phoneNumberId, from, replyText);
    } catch (err) {
      console.error("[MessageProcessor] Failed to send reply:", err);
    }
  }

  const user = await findUserByPhone(from);

  if (!user) {
    await reply(
      `Hi ${senderName}! 👋 It looks like your number isn't linked to a Sutaeru account yet.\n\n` +
        `Please sign up at https://sutaeru.com and add your WhatsApp number in your profile settings.`
    );
    return;
  }

  if (type === "text" && text) {
    const command = parseTextCommand(text);

    if (command.intent === "help") {
      await reply(helpMessage());
      return;
    }

    if (command.intent === "list_tasks") {
      await reply(
        "📋 Task listing coming soon! Check your dashboard at https://sutaeru.com"
      );
      return;
    }

    if (command.intent === "create_task") {
      if (!command.content) {
        await reply(
          'I couldn\'t quite catch that. Try sending a task like: "Buy milk" or "Call the accountant".'
        );
        return;
      }

      const taskId = nanoid();
      await reply(
        `✅ Got it! I've noted *"${command.content}"*.\n\nReference ID: ${taskId}\n\nVisit https://sutaeru.com to manage your tasks.`
      );
      return;
    }

    await reply(helpMessage());
    return;
  }

  if (type === "image" && image) {
    await reply(
      "📸 Got your image! I'm processing your receipt now, give me a moment..."
    );

    try {
      const ocrResult = await processReceiptWithOCR({
        mediaId: image.id,
        mimeType: image.mime_type,
      });

      const title = ocrResult.merchantName
        ? `Receipt from ${ocrResult.merchantName}`
        : "Receipt (WhatsApp)";

      const totalStr = ocrResult.total ? ` Total: *${ocrResult.total}*` : "";
      const taskId = nanoid();
      await reply(
        `🧾 Receipt processed!${totalStr}\n\nLogged as: *${title}*\nReference ID: ${taskId}\n\n` +
          `You can review and categorize this receipt at https://sutaeru.com/business`
      );
    } catch (err) {
      console.error("[MessageProcessor] OCR processing failed:", err);
      await reply(
        "⚠️ Sorry, I had trouble reading that receipt. Please try again or upload it manually at https://sutaeru.com/business"
      );
    }
    return;
  }

  await reply(
    `Sorry, I can only handle text messages and receipt images right now. Type *help* to see what I can do.`
  );
}
