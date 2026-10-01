/**
 * WhatsApp bridge over a linked device (Baileys), so the owner can chat with Kemma from WhatsApp.
 *
 * Unofficial: it acts as a linked device of a normal WhatsApp account, which WhatsApp's terms do not
 * allow for bots, so use a spare number. Enabled only when WHATSAPP_BAILEYS=1.
 *
 * Link once: set WHATSAPP_PAIR_NUMBER (digits with country code) and enter the 8-character code printed
 * in the server log under WhatsApp > Linked devices > Link with phone number, or scan the QR in the log.
 * Session files live in WHATSAPP_AUTH_DIR (mount it as a volume so a restart does not unlink).
 *
 * Who gets answers: the linked account's own "Message yourself" chat, plus numbers listed in
 * WHATSAPP_ALLOWED_NUMBERS (comma-separated digits). Everyone else is ignored, never replied to.
 * Messages run as the lowest-id admin user (or WHATSAPP_KEMMA_USER_ID).
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { rm } from "fs/promises";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { kemmaExecute, type KemmaMessage } from "../kemma/engine";

const HISTORY_LIMIT = 12;
const MAX_REPLY_CHARS = 3500;

const digits = (jid: string | null | undefined) => (jid ?? "").split("@")[0].split(":")[0].replace(/\D/g, "");

const history = new Map<string, KemmaMessage[]>();
const sentIds = new Set<string>();
let sock: WASocket | null = null;
let stopping = false;
let failures = 0;
let resets: number[] = [];

export const waStatus: { state: "off" | "waiting" | "connecting" | "open"; pairingCode?: string; number?: string; note?: string } = { state: "off" };

async function resolveUser(): Promise<{ id: number; name: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const forced = Number(process.env.WHATSAPP_KEMMA_USER_ID);
  const rows = Number.isInteger(forced) && forced > 0
    ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, forced)).limit(1)
    : await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "admin")).orderBy(asc(users.id)).limit(1);
  return rows[0] ? { id: rows[0].id, name: rows[0].name ?? "Admin" } : null;
}

function textOf(m: any): string {
  const c = m?.message;
  return c?.conversation ?? c?.extendedTextMessage?.text ?? c?.imageMessage?.caption ?? c?.videoMessage?.caption ?? "";
}

async function reply(s: WASocket, jid: string, text: string) {
  for (let i = 0; i < text.length || i === 0; i += MAX_REPLY_CHARS) {
    const sent = await s.sendMessage(jid, { text: text.slice(i, i + MAX_REPLY_CHARS) });
    if (sent?.key?.id) {
      sentIds.add(sent.key.id);
      if (sentIds.size > 500) sentIds.delete(sentIds.values().next().value as string);
    }
  }
}

function isAllowed(s: WASocket, m: any): boolean {
  const jid: string = m.key.remoteJid ?? "";
  const own = new Set([digits(s.user?.id), digits((s.user as any)?.lid)].filter(Boolean));
  if (m.key.fromMe) return own.has(digits(jid)); // only the self chat; never your chats with other people
  const allowed = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? "").split(",").map((n) => n.replace(/\D/g, "")).filter(Boolean);
  const sender = digits(m.key.senderPn ?? m.key.participantPn ?? jid);
  return allowed.includes(sender) && !jid.endsWith("@g.us");
}

async function handle(s: WASocket, m: any) {
  const jid: string | undefined = m.key.remoteJid ?? undefined;
  if (!jid || jid === "status@broadcast" || (m.key.id && sentIds.has(m.key.id))) return;
  const text = textOf(m).trim();
  if (!text || !isAllowed(s, m)) return;

  const user = await resolveUser();
  if (!user) return void console.warn("[WhatsApp] No admin user to run as; ignoring message");

  if (/^\/(reset|new)$/i.test(text)) {
    history.delete(jid);
    return reply(s, jid, "Fresh start.");
  }

  const msgs = [...(history.get(jid) ?? []), { role: "user" as const, content: text }].slice(-HISTORY_LIMIT);
  try {
    await s.sendPresenceUpdate("composing", jid).catch(() => {});
    const out = await kemmaExecute({ userId: user.id, userName: user.name, messages: msgs, tier: "max", isThinking: false });
    const answer = out.response?.trim() || "(no answer)";
    history.set(jid, [...msgs, { role: "assistant" as const, content: answer }].slice(-HISTORY_LIMIT));
    await reply(s, jid, answer);
  } catch (err) {
    console.error("[WhatsApp] Kemma failed:", err);
    await reply(s, jid, "Something went wrong on my side. Try again in a moment.").catch(() => {});
  }
}

async function connect() {
  const authDir = process.env.WHATSAPP_AUTH_DIR || "/data/wa-auth";
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined as any }));
  const s = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Sutaeru"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock = s;

  const pairNumber = (process.env.WHATSAPP_PAIR_NUMBER ?? "").replace(/\D/g, "");
  let pairRequested = false;

  let dead = false; // set once this socket is logged out, so it cannot re-save stale creds
  s.ev.on("creds.update", () => { if (!dead) saveCreds(); });
  s.ev.on("connection.update", async (u) => {
    if (u.qr) {
      if (pairNumber && !pairRequested && !s.authState.creds.registered) {
        pairRequested = true;
        try {
          const code = await s.requestPairingCode(pairNumber);
          waStatus.pairingCode = code;
          waStatus.state = "waiting";
          console.log(`[WhatsApp] Pairing code for +${pairNumber}: ${code}  (WhatsApp > Linked devices > Link with phone number)`);
        } catch (err) {
          console.error("[WhatsApp] Could not get a pairing code:", err);
        }
      } else if (!pairNumber) {
        console.log("[WhatsApp] Scan this QR (WhatsApp > Linked devices > Link a device):");
        qrcode.generate(u.qr, { small: true });
      }
    }
    if (u.connection === "open") {
      failures = 0;
      waStatus.state = "open";
      waStatus.pairingCode = undefined;
      waStatus.number = digits(s.user?.id);
      console.log(`[WhatsApp] Linked and connected as +${waStatus.number}`);
    }
    if (u.connection === "close") {
      const code = (u.lastDisconnect?.error as any)?.output?.statusCode;
      if (stopping) return;
      waStatus.state = "connecting";
      waStatus.pairingCode = undefined;
      if (code === DisconnectReason.loggedOut) {
        dead = true;
        s.ev.removeAllListeners("creds.update");
        const now = Date.now();
        resets = resets.filter((t) => now - t < 10 * 60_000).concat(now);
        if (resets.length > 3) {
          waStatus.state = "off";
          waStatus.note = "Stopped after repeated logouts. Wait a few minutes, then restart the server.";
          console.warn("[WhatsApp] Too many logouts in a row; giving up so the number is not hammered");
          return;
        }
        console.warn("[WhatsApp] Logged out; clearing the session and starting a fresh link");
        await rm(authDir, { recursive: true, force: true }).catch(() => {});
        waStatus.number = undefined;
        return void setTimeout(() => connect().catch((e) => console.error("[WhatsApp] Reconnect failed:", e)), 30_000);
      }
      failures += 1;
      const delay = Math.min(5000 * 2 ** (failures - 1), 5 * 60_000);
      console.warn(`[WhatsApp] Connection closed (${code ?? "unknown"}), reconnecting in ${Math.round(delay / 1000)}s`);
      setTimeout(() => connect().catch((e) => console.error("[WhatsApp] Reconnect failed:", e)), delay);
    }
  });

  s.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) handle(s, m).catch((e) => console.error("[WhatsApp] Handler error:", e));
  });
}

export function startWhatsAppBaileys() {
  if (process.env.WHATSAPP_BAILEYS !== "1") return;
  waStatus.state = "connecting";
  connect().catch((e) => console.error("[WhatsApp] Failed to start:", e));
}

export function stopWhatsAppBaileys() {
  stopping = true;
  sock?.end(undefined);
}
