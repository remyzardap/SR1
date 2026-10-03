import { kemmaExecute, type KemmaMessage } from "../kemma/engine";
import { addChatMessage, createChatSession, getChatSessionMessages, getUserById, listChatSessions } from "../db";
import { getQuotaSummary } from "../core/quotaCheck";
import { resolveSettings } from "../kemma/settings";
import { chatImageOwnerUserId } from "./chatImage";

/**
 * Telegram text chat on the same engine as the Chat page: the owner's memories, tools, models and fallback.
 * The conversation is saved as a normal chat thread titled "Telegram", so it shows in Chat history and
 * survives a restart. Runs as the owner account, like the WhatsApp bridge and chat images.
 */

export const TELEGRAM_THREAD_TITLE = "Telegram";
/** How many saved messages go back to the model with each new one. */
const HISTORY_LIMIT = 24;

type Owner = { id: number; name?: string };

async function owner(): Promise<Owner | null> {
  const id = await chatImageOwnerUserId();
  if (!id) return null;
  const user = await getUserById(id).catch(() => undefined);
  return { id, name: user?.name ?? undefined };
}

/** The newest thread titled Telegram, or a fresh one. `/new` simply makes a newer thread. */
async function activeThread(userId: number, forceNew = false): Promise<string> {
  if (!forceNew) {
    const sessions = await listChatSessions(userId);
    const found = sessions.find((s) => (s.title ?? "").startsWith(TELEGRAM_THREAD_TITLE));
    if (found) return found.id;
  }
  return createChatSession(userId, TELEGRAM_THREAD_TITLE);
}

/** Starts a fresh conversation; the old one stays in Chat history. */
export async function startNewTelegramThread(): Promise<boolean> {
  const who = await owner();
  if (!who) return false;
  await activeThread(who.id, true);
  return true;
}

/** One reply from the main chat engine. Never throws: a failure becomes a plain line for the chat. */
export async function runTelegramChat(text: string): Promise<string> {
  const who = await owner();
  if (!who) return "There is no owner account on this server to answer as.";
  try {
    const sessionId = await activeThread(who.id);
    const saved = await getChatSessionMessages(sessionId);
    const history: KemmaMessage[] = saved
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const messages: KemmaMessage[] = [...history, { role: "user", content: text }];

    await addChatMessage(sessionId, who.id, text, "user");
    const quota = await getQuotaSummary(who.id).catch(() => null);
    const settings = resolveSettings({}, {}, undefined, { isAdmin: true });
    const out = await kemmaExecute({
      userId: who.id,
      userName: who.name,
      messages,
      tier: quota?.tier ?? "max",
      isThinking: false,
      sessionId,
      allowedTools: settings.allowedTools,
    });
    const answer = out.response?.trim();
    if (!answer || out.isError) return answer || "I could not get an answer just now. Try again in a moment.";
    await addChatMessage(sessionId, who.id, answer, "assistant");
    return answer;
  } catch (err) {
    console.error("[Telegram] chat failed:", err);
    return "Something went wrong on my side. Try again in a moment.";
  }
}
