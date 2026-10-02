import { Router, type NextFunction, type Request, type Response } from "express";
import { waStatus, startWhatsAppBaileys } from "../services/whatsappBaileys";

/**
 * Owner-only controls for the messaging bridges, so linking WhatsApp does not mean reading server logs.
 * Built only on what the WhatsApp bridge already exports, so it does not depend on its internals.
 * Mounted at /api/admin/messaging behind the session gate.
 */

/** Digits with country code, 8 to 15 of them. Accepts "+62 812-3456-7890" style input. */
export function normalizePairNumber(raw: unknown): string | null {
  if (typeof raw === "number") { if (!Number.isSafeInteger(raw) || raw < 0) return null; raw = String(raw); }
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s()+.-]/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

function lastFour(digits: string): string | undefined {
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}

/** Everything the screen needs. Never includes a token, a secret, or a full phone number from settings. */
export function messagingStatus() {
  const pair = (process.env.WHATSAPP_PAIR_NUMBER ?? "").replace(/\D/g, "");
  const allowed = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  return {
    whatsapp: {
      enabled: process.env.WHATSAPP_BAILEYS === "1",
      state: waStatus.state,
      pairingCode: waStatus.state === "waiting" ? waStatus.pairingCode : undefined,
      number: waStatus.number,
      note: waStatus.note,
      pairNumberEnding: lastFour(pair),
    },
    telegram: {
      botTokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
      webhookSecretSet: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      connected: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_WEBHOOK_SECRET,
      allowedUsers: allowed.length,
    },
  };
}

export const adminMessagingRouter = Router();

adminMessagingRouter.use((req: Request, res: Response, next: NextFunction) => {
  if ((req as any).user?.role !== "admin") return res.status(403).json({ error: "Admin only." });
  res.setHeader("Cache-Control", "no-store");
  next();
});

adminMessagingRouter.get("/status", (_req, res) => {
  res.json(messagingStatus());
});

adminMessagingRouter.post("/link", (req, res) => {
  const number = normalizePairNumber(req.body?.number);
  if (!number) return res.status(400).json({ error: "Enter the number with its country code, digits only (8 to 15 digits)." });
  if (waStatus.state === "open") return res.status(409).json({ error: `Already linked as +${waStatus.number ?? "this number"}.` });

  // The bridge reads these when it makes its next pairing attempt.
  process.env.WHATSAPP_PAIR_NUMBER = number;
  process.env.WHATSAPP_BAILEYS = "1";

  // A bridge that is already connecting or showing a code picks the new number up on its next attempt.
  // Only a stopped bridge needs starting, and starting one that is running would open a second socket.
  let started = false;
  if (waStatus.state === "off") {
    startWhatsAppBaileys();
    started = true;
  }
  res.json({ ...messagingStatus(), started });
});
