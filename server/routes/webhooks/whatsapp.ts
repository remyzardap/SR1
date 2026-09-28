import { Router, Request, Response } from "express";
import crypto from "crypto";
import { processIncomingMessage } from "../../services/message-processor";

const router = Router();

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN || "";
const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

/**
 * Validates the incoming webhook signature from Meta/WhatsApp.
 * Uses HMAC-SHA256 with the app secret.
 */
function validateWebhookSignature(req: Request): boolean {
  const signature = req.headers["x-hub-signature-256"] as string;
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!signature || !WHATSAPP_APP_SECRET || !rawBody) return false;

  const expectedSignature =
    "sha256=" +
    crypto
      .createHmac("sha256", WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * GET /webhooks/whatsapp
 * Webhook verification endpoint required by Meta during setup.
 */
router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.warn("[WhatsApp] Webhook verification failed");
  return res.status(403).json({ error: "Verification failed" });
});

/**
 * POST /webhooks/whatsapp
 * Receives incoming messages and events from WhatsApp.
 */
router.post("/", async (req: Request, res: Response) => {
  // Always respond 200 immediately to acknowledge receipt
  res.status(200).json({ status: "ok" });

  if (!validateWebhookSignature(req)) {
    console.warn("[WhatsApp] Invalid signature - ignoring payload");
    return;
  }

  const body = req.body;

  if (body.object !== "whatsapp_business_account") {
    console.warn("[WhatsApp] Unknown object type:", body.object);
    return;
  }

  try {
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== "messages") continue;

        const value = change.value;
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const message of messages) {
          const contact = contacts.find(
            (c: { wa_id: string }) => c.wa_id === message.from
          );
          const senderName =
            (contact as { profile?: { name?: string } })?.profile?.name ||
            message.from;

          console.log(
            `[WhatsApp] Incoming message from ${senderName} (${message.from}): type=${message.type}`
          );

          await processIncomingMessage({
            messageId: message.id,
            from: message.from,
            senderName,
            type: message.type,
            timestamp: parseInt(message.timestamp, 10),
            text: message.text?.body,
            image: message.image,
            phoneNumberId: value.metadata?.phone_number_id,
          });
        }
      }
    }
  } catch (err) {
    console.error("[WhatsApp] Error processing webhook payload:", err);
  }
});

/**
 * Sends a reply message back to a WhatsApp user.
 */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  text: string
): Promise<void> {
  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`WhatsApp API error: ${err}`);
  }
}

export default router;
