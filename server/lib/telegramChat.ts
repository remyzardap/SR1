import { kemmaExecute, type KemmaMessage } from "../kemma/engine";
import { addChatMessage, createChatSession, getChatSessionMessages, getUserById, listChatSessions } from "../db";
import { getQuotaSummary } from "../core/quotaCheck";
import { resolveSettings } from "../kemma/settings";
import { chatImageOwnerUserId } from "./chatImage";
import { buildS1SystemPrompt, resolveBearer, s1Blend, type ChatMessage } from "../routers/s1Router";

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

const SYNTH_TIMEOUT_MS = 60_000;

/** The final blended answer: one plain completion on the backend the blend picked. Null when it fails. */
async function completePlan(plan: Awaited<ReturnType<typeof s1Blend>>): Promise<string | null> {
  try {
    const bearer = await resolveBearer(plan.config);
    const res = await fetch(`${plan.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ model: plan.config.model, messages: plan.messages, max_tokens: 900, stream: false }),
      signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * One reply. "blend" (the default) runs the full chat engine (memories, tools, history) next to the other models,
 * and Gemini writes one final answer from them. "solo" is the engine alone: faster and cheaper.
 * Never throws: a failure becomes a plain line for the chat.
 */
export async function runTelegramChat(text: string, style: "blend" | "solo" = "blend"): Promise<string> {
  try {
    const who = await owner();
    if (!who) return "There is no owner account on this server to answer as.";
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
    const engine = kemmaExecute({
      userId: who.id,
      userName: who.name,
      messages,
      tier: quota?.tier ?? "max",
      isThinking: false,
      sessionId,
      allowedTools: settings.allowedTools,
    });

    let answer = "";
    let engineError = "";
    if (style === "solo") {
      const out = await engine;
      answer = out.response?.trim() ?? "";
      if (out.isError) engineError = answer;
    } else {
      // The engine answer is one of the drafts; Qwen (and Sonar for web questions) draft alongside it.
      let engineAnswer = "";
      const engineDraft = engine
        .then((out) => {
          engineAnswer = out.isError ? "" : out.response?.trim() ?? "";
          if (out.isError) engineError = out.response?.trim() ?? "";
          return engineAnswer ? [{ id: "gemini", label: "Kemma", text: engineAnswer }] : [];
        })
        .catch(() => []);
      const system = buildS1SystemPrompt({ agent: "s1", label: "Kemma", reason: "chat", emoji: "🧠", color: "#E8442A" });
      const chat: ChatMessage[] = [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: String(m.content) }))];
      try {
        const plan = await s1Blend(text, chat, { draftMaxTokens: 800, skipDraft: ["gemini"], extraDrafts: engineDraft });
        // Fewer than two drafts means nothing to blend: the engine answer stands on its own.
        answer = plan.contributors.length >= 2 || !engineAnswer ? (await completePlan(plan)) ?? engineAnswer : engineAnswer;
      } catch (err) {
        console.warn("[Telegram] blend failed, using the engine answer:", String(err));
        answer = await engineDraft.then(() => engineAnswer);
      }
    }
    if (!answer) return engineError || "I could not get an answer just now. Try again in a moment.";
    if (engineError && style === "solo") return answer;
    await addChatMessage(sessionId, who.id, answer, "assistant");
    return answer;
  } catch (err) {
    console.error("[Telegram] chat failed:", err);
    return "Something went wrong on my side. Try again in a moment.";
  }
}
