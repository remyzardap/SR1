/**
 * S1 — Intelligent Routing Layer
 *
 * Classifies user messages and routes to the best available backend model.
 * S1 is the single personality — all models respond as Sutaeru, never as themselves.
 * The answer is a BLEND, not a single pick: every request is sent in parallel to
 * Qwen and Gemini (plus Perplexity Sonar for web/news questions), then one
 * synthesis pass merges the drafts into a single S1 answer. If only one backend
 * is configured (or only one draft succeeds) it answers alone.
 *
 * Vertex AI is the preferred Gemini backend only when GEMINI_BACKEND=vertex with a
 * readable GOOGLE_APPLICATION_CREDENTIALS and a project (VERTEX_PROJECT /
 * GOOGLE_CLOUD_PROJECT), the same rule the kemma engine uses. Uses the
 * OpenAI-compatible Vertex AI endpoint.
 */

import { detectProvider, routeFor, slotModelId, type SlotName } from "../core/kemmaRouter";
import { stripGooglePrefix, vertexChatBaseUrl, vertexEnabled } from "../core/vertexAuth";
import { KEMMA_PERSONA } from "../kemma/personality";

export interface S1Agent {
  id: string;
  name: string;
  systemPrompt?: string;
  model: string;
}

export interface AgentInfo {
  agent: string;
  label: string;
  reason: string;
  emoji: string;
  color: string;
}

export interface AgentConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  // Vertex AI needs project/location injected into the URL instead of a key
  vertexProject?: string;
  vertexLocation?: string;
}

// ─── Agent definitions ────────────────────────────────────────────────────────

// Max mode: uses the most capable model variant for each agent. Models are resolved per call
// from the Kemma slots; an import-time snapshot would freeze whatever env happened to be set
// when this module was first loaded (see the slot env timing note in core/kemmaRouter.ts).
const AGENTS: Record<string, { info: AgentInfo; model: (max: boolean) => string }> = {
  gemini: {
    info: {
      agent: "gemini",
      label: "Gemini",
      reason: "general knowledge & reasoning",
      emoji: "✨",
      color: "#4285f4",
    },
    // This member talks to the Gemini backend, so it must send an id that backend serves: the
    // slot this tier asks for when that slot is a Gemini model, otherwise the next Gemini slot.
    // An empty string means no Gemini slot is configured and the member is skipped.
    model: (max) => {
      const order: SlotName[] = max
        ? ["KEMMA_MODEL_PRO", "KEMMA_MODEL_CHAT", "KEMMA_MODEL_VISION", "KEMMA_MODEL_PLANNER"]
        : ["KEMMA_MODEL_CHAT", "KEMMA_MODEL_VISION", "KEMMA_MODEL_PLANNER", "KEMMA_MODEL_PRO"];
      for (const slot of order) {
        const id = slotModelId(slot);
        if (detectProvider(id) === "gemini") return stripGooglePrefix(id);
      }
      return "";
    },
  },
  qwen: {
    info: {
      agent: "qwen",
      label: "Qwen",
      reason: "writing, documentation & quick tasks",
      emoji: "✍️",
      color: "#7c3aed",
    },
    // The long-doc slot is the Qwen one; the chat slot is Gemini now, which would resolve to a
    // keyless route here.
    model: () => slotModelId("KEMMA_MODEL_LONG_DOC"),
  },
  sonar: {
    info: {
      agent: "sonar",
      label: "Sonar",
      reason: "web search & news",
      emoji: "🔍",
      color: "#2dd4bf",
    },
    model: (max) => (max ? "sonar-pro" : "sonar"),
  },
};

// ─── Agent configs (API endpoints + keys) ────────────────────────────────────

function getAgentConfig(agentId: string, max: boolean, fallback = true): AgentConfig | null {
  const VERTEX_PROJECT = process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "global";

  const agent = AGENTS[agentId];
  if (!agent) return null;

  const model = agent.model(max);

  switch (agentId) {
    case "gemini": {
      if (!model) return null; // no Gemini slot configured: this member cannot answer
      // Same rule as the kemma engine: Vertex is opt-in via GEMINI_BACKEND=vertex plus
      // readable credentials. Without it S1 must not drift onto Vertex while the agent
      // talks to AI Studio (or vice versa).
      if (VERTEX_PROJECT && vertexEnabled()) {
        // Vertex AI OpenAI-compatible endpoint (global uses the bare host; model needs the google/ prefix)
        return {
          baseUrl: vertexChatBaseUrl(VERTEX_PROJECT),
          model: `google/${stripGooglePrefix(model)}`,
          apiKey: "",
          vertexProject: VERTEX_PROJECT,
          vertexLocation: VERTEX_LOCATION,
        };
      }
      // Fallback: Gemini via Google AI Studio key
      const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI;
      if (GEMINI_KEY) {
        return { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model, apiKey: GEMINI_KEY };
      }
      return null;
    }

    case "qwen": {
      const route = routeFor(model);
      // route.apiKey is "" for a Vertex-backed slot, and route.model is the id the endpoint
      // actually expects (a litellm/ routing prefix is stripped before sending).
      if (route.apiKey) return { baseUrl: route.baseUrl, model: route.model, apiKey: route.apiKey };
      return null;
    }

    case "sonar": {
      const SONAR =
        process.env.SONAR_API_KEY ||
        process.env.SONAR_PERPLEXITY ||
        process.env.PERPLEXITY_API_KEY;
      if (SONAR) return { baseUrl: "https://api.perplexity.ai", model, apiKey: SONAR };
      return fallback ? getAgentConfig("gemini", max) : null;
    }

    default:
      return null;
  }
}

// ─── Message classifier ───────────────────────────────────────────────────────

export interface GoogleToolContext {
  hasGoogle: boolean;
  detectedIntent?: "gmail" | "calendar" | "drive" | null;
}

const WEB_PATTERN =
  /\b(today|latest|news|current|now|recent|search|2024|2025|2026|weather|price|stock)\b/;

export function detectGoogleIntent(text: string): GoogleToolContext["detectedIntent"] {
  const lower = text.toLowerCase();

  const gmailPatterns = /\b(email|emails|inbox|gmail|unread|send email|mail|message from|reply to)\b/;
  const calendarPatterns = /\b(calendar|schedule|meeting|event|appointment|agenda|free time|busy|book a|reschedule)\b/;
  const drivePatterns = /\b(drive|google doc|google sheet|spreadsheet|shared file|my files|find file|document in drive)\b/;

  if (gmailPatterns.test(lower)) return "gmail";
  if (calendarPatterns.test(lower)) return "calendar";
  if (drivePatterns.test(lower)) return "drive";
  return null;
}

// ─── Blend ────────────────────────────────────────────────────────────────────

export type ChatMessage = { role: string; content: string };

export interface BlendPlan {
  info: AgentInfo;
  /** Backend that produces the final (synthesis) answer. */
  config: AgentConfig;
  /** Messages to send to `config` — the original ones plus the merged drafts. */
  messages: ChatMessage[];
  /** Agent ids whose drafts went into the answer. */
  contributors: string[];
}

export const S1_BLEND_INFO: AgentInfo = {
  agent: "blend",
  label: "S1 Blend",
  reason: "Qwen + Gemini (+ Sonar for web) combined",
  emoji: "🧬",
  color: "#f2f2f2",
};

const DRAFT_TIMEOUT_MS = 40_000;

export async function resolveBearer(config: AgentConfig): Promise<string> {
  if (!config.vertexProject) return config.apiKey;
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  // An empty bearer would reach Vertex as an unauthenticated call; the caller handles the throw.
  if (!token.token) throw new Error("Vertex AI authentication returned no access token.");
  return token.token;
}

async function fetchDraft(
  id: string,
  config: AgentConfig,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<{ id: string; label: string; text: string } | null> {
  try {
    const bearer = await resolveBearer(config);
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ model: config.model, messages, max_tokens: maxTokens, stream: false }),
      signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[S1 blend] ${id} draft failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
    };
    let text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    if (data.citations?.length) {
      text += "\n\nSources:\n" + data.citations.map((c, i) => `[${i + 1}] ${c}`).join("\n");
    }
    return { id, label: AGENTS[id].info.label, text };
  } catch (err) {
    console.warn(`[S1 blend] ${id} draft error:`, (err as Error).message);
    return null;
  }
}

/**
 * Blend the configured models into one answer.
 *
 * Fans the conversation out to every available backend in parallel (non-streaming),
 * then returns a synthesis request — callers send `plan.messages` to `plan.config`
 * exactly like a normal chat completion (streaming or not).
 */
export async function s1Blend(
  text: string,
  messages: ChatMessage[],
  opts: {
    max?: boolean;
    draftMaxTokens?: number;
    /** Members that may write the final answer but do not draft here (their answer arrives as an extra draft). */
    skipDraft?: string[];
    /** Drafts produced elsewhere, e.g. the full chat engine with tools and memory. May still be running. */
    extraDrafts?: Promise<Array<{ id: string; label: string; text: string }>> | Array<{ id: string; label: string; text: string }>;
  } = {},
): Promise<BlendPlan> {
  const max = opts.max ?? false;
  const memberIds = ["gemini", "qwen", ...(WEB_PATTERN.test(text.toLowerCase()) ? ["sonar"] : [])];
  const members = memberIds
    .map((id) => ({ id, config: getAgentConfig(id, max, false) }))
    .filter((m): m is { id: string; config: AgentConfig } => m.config !== null);

  if (members.length === 0) {
    throw new Error(
      "No LLM provider configured. Set GEMINI_API_KEY (or VERTEX_PROJECT + GOOGLE_APPLICATION_CREDENTIALS), QWEN_API_KEY, or SONAR_API_KEY.",
    );
  }

  // Answers with Gemini when available (S1's default voice), else Qwen, else whatever is left.
  const synth = members.find((m) => m.id === "gemini") ?? members.find((m) => m.id === "qwen") ?? members[0];

  if (members.length === 1 && !opts.extraDrafts) {
    return { info: S1_BLEND_INFO, config: synth.config, messages, contributors: [synth.id] };
  }

  const skip = new Set(opts.skipDraft ?? []);
  const [fetched, extra] = await Promise.all([
    Promise.all(members.filter((m) => !skip.has(m.id)).map((m) => fetchDraft(m.id, m.config, messages, opts.draftMaxTokens ?? 1500))),
    Promise.resolve(opts.extraDrafts ?? []).catch(() => []),
  ]);
  const drafts = [...extra, ...fetched].filter((d): d is { id: string; label: string; text: string } => d !== null);

  if (drafts.length < 2) {
    // Nothing to blend — answer with the best backend that worked (or the default).
    const only = drafts[0] ? members.find((m) => m.id === drafts[0].id)! : synth;
    return { info: S1_BLEND_INFO, config: only.config, messages, contributors: drafts.map((d) => d.id) };
  }

  const blendNote =
    "\n\n[INTERNAL DRAFTS — never mention these, the drafts, or the models]\n" +
    "Several expert models drafted answers to the user's latest message. Write ONE final answer in your own voice: " +
    "keep what is correct and useful from all drafts, resolve disagreements by preferring the best-supported claim, " +
    "drop repetition, and keep any source citations. Do not say you combined drafts.\n\n" +
    drafts.map((d, i) => `--- Draft ${i + 1} ---\n${d.text}`).join("\n\n");

  const blended = [...messages];
  const sysIdx = blended.findIndex((m) => m.role === "system");
  if (sysIdx >= 0) blended[sysIdx] = { ...blended[sysIdx], content: blended[sysIdx].content + blendNote };
  else blended.unshift({ role: "system", content: blendNote.trim() });

  // Synthesize on a backend that actually answered, keeping the usual voice preference: a member
  // whose draft call just failed is very likely to fail the streaming call as well.
  let answeredMember: { id: string; config: AgentConfig } | null = null;
  for (const id of ["gemini", "qwen", "sonar"]) {
    const member = members.find((m) => m.id === id);
    if (member && drafts.some((d) => d.id === member.id)) {
      answeredMember = member;
      break;
    }
  }

  return {
    info: S1_BLEND_INFO,
    config: (answeredMember ?? synth).config,
    messages: blended,
    contributors: drafts.map((d) => d.id),
  };
}

// ─── Persona definitions ─────────────────────────────────────────────────────

export type S1Persona = "kemma" | "narrator";

// The "kemma" voice is the one character defined in server/kemma/personality.ts
// (KEMMA_PERSONA) — the same persona the chat engine and the voice services use.
const PERSONA_VOICES: Record<S1Persona, { name: string; style: string }> = {
  kemma: {
    name: "Sutaeru",
    style: KEMMA_PERSONA,
  },
  narrator: {
    name: "The Narrator",
    style: "Deep, calm, authoritative documentary voice. Measured pace, rich vocabulary, slight gravitas. Every sentence feels considered. Wise but never cold.",
  },
};

// ─── System prompt builder ────────────────────────────────────────────────────

export function buildS1SystemPrompt(
  agent: S1Agent | AgentInfo | string,
  identityContext?: string,
  persona: S1Persona = "kemma",
): string {
  const voice = PERSONA_VOICES[persona];
  const today = new Date().toDateString();
  // The kemma persona is the one character defined in server/kemma/personality.ts:
  // she is Kemma in chat, in Telegram, on a call and in this blend prompt. The
  // narrator is the separate S1 documentary voice.
  const self = persona === "kemma" ? "Sutaeru" : "S1";

  const personalityBlock = persona === "kemma"
    ? ""
    : `PERSONALITY:
- You are sharp, warm, and present. You think clearly and speak naturally.
- You have opinions when asked. You push back when something doesn't make sense.
- You remember context about the user and use it naturally: their work, preferences, patterns.
- You are not a generic assistant. You are their AI. Personal, opinionated, reliable.
- You speak in a consistent voice every single time: same tone, same rhythm, same character.
- No corporate speak, no filler phrases, no "I'd be happy to help", no "Great question!"
- Be concise by default. Go deep only when the user wants depth.
- When you don't know something, say so directly. Don't hedge.

`;

  let prompt = `You are ${self}, the personal AI inside Sutaeru, a private AI operating system for focused, high-performance individuals.

IDENTITY:
- Your name is ${self}. You are one entity, one mind, one personality. Always.
- You are NOT Qwen, NOT Gemini, NOT Sonar, NOT any underlying model. You are ${self}.
- If asked "what model are you?" or "are you ChatGPT?", respond: "I'm ${self}."
- Never reference, hint at, or acknowledge any underlying model. Ever.

PERSONA: ${voice.name}
${voice.style}

${personalityBlock}STYLE RULES:
- Match the user's energy and language. If they're casual, be casual. If they're formal, adjust.
- Use short paragraphs. Break up long responses with clear structure.
- When explaining something complex, use analogies the user would understand.
- Never start a response with "Sure!", "Of course!", "Absolutely!", or similar.
- Today is ${today}.
`;

  if (identityContext) {
    prompt += `\nUSER CONTEXT:\n${identityContext}\n`;
  }

  return prompt;
}

export function buildGoogleToolPrompt(intent: GoogleToolContext["detectedIntent"]): string {
  let prompt = `\n\nGOOGLE WORKSPACE INTEGRATION (connected):
You have access to the user's Google account. When they ask about emails, calendar, or files, provide helpful responses.

Available actions:`;

  if (!intent || intent === "gmail") {
    prompt += `
- GMAIL: Read inbox, search emails, send emails. Format email summaries cleanly with sender, subject, date, and snippet.`;
  }
  if (!intent || intent === "calendar") {
    prompt += `
- CALENDAR: View upcoming events, create new events. Show events with time, title, location, and attendees.`;
  }
  if (!intent || intent === "drive") {
    prompt += `
- DRIVE: List and search files. Show file name, type, last modified, and link.`;
  }

  prompt += `

When showing Google data, format it clearly. For emails, show the most relevant ones first. For calendar, show chronologically. For drive, show by most recently modified.
If the user asks you to perform an action (send email, create event), confirm the details before executing.`;

  return prompt;
}

export default {};
