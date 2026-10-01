/**
 * S1 — Intelligent Routing Layer
 *
 * Classifies user messages and routes to the best available backend model.
 * S1 is the single personality — all models respond as S1, never as themselves.
 * The answer is a BLEND, not a single pick: every request is sent in parallel to
 * Qwen and Gemini (plus Perplexity Sonar for web/news questions), then one
 * synthesis pass merges the drafts into a single S1 answer. If only one backend
 * is configured (or only one draft succeeds) it answers alone.
 *
 * Vertex AI (Gemini 2.5) is the preferred Gemini backend when GOOGLE_APPLICATION_CREDENTIALS
 * or VERTEX_PROJECT is set. Uses the OpenAI-compatible Vertex AI endpoint.
 */

import { chatRoute, longDocRoute, proRoute, routeFor } from "../core/kemmaRouter";
import { stripGooglePrefix, vertexChatBaseUrl } from "../core/vertexAuth";

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

// Max mode: uses the most capable model variant for each agent.
const AGENTS: Record<
  string,
  { info: AgentInfo; normalModel: string; maxModel: string }
> = {
  gemini: {
    info: {
      agent: "gemini",
      label: "Gemini",
      reason: "general knowledge & reasoning",
      emoji: "✨",
      color: "#4285f4",
    },
    normalModel: chatRoute().model,
    maxModel: proRoute().model,
  },
  qwen: {
    info: {
      agent: "qwen",
      label: "Qwen",
      reason: "writing, documentation & quick tasks",
      emoji: "✍️",
      color: "#7c3aed",
    },
    // Must stay a Qwen model: the chat slot is Gemini now, which would resolve to a keyless route here.
    normalModel: longDocRoute().model,
    maxModel: longDocRoute().model,
  },
  sonar: {
    info: {
      agent: "sonar",
      label: "Sonar",
      reason: "web search & news",
      emoji: "🔍",
      color: "#2dd4bf",
    },
    normalModel: "sonar",
    maxModel: "sonar-pro",
  },
};

// ─── Agent configs (API endpoints + keys) ────────────────────────────────────

function getAgentConfig(agentId: string, max: boolean, fallback = true): AgentConfig | null {
  const VERTEX_PROJECT = process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "global";
  // Service account key path — used to get an access token
  const GOOGLE_CREDS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  const agent = AGENTS[agentId];
  if (!agent) return null;

  const model = max ? agent.maxModel : agent.normalModel;

  switch (agentId) {
    case "gemini": {
      if (VERTEX_PROJECT && GOOGLE_CREDS) {
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
      if (route.apiKey) return { baseUrl: route.baseUrl, model, apiKey: route.apiKey };
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
  return token.token ?? "";
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
  opts: { max?: boolean; draftMaxTokens?: number } = {},
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

  if (members.length === 1) {
    return { info: S1_BLEND_INFO, config: synth.config, messages, contributors: [synth.id] };
  }

  const drafts = (
    await Promise.all(members.map((m) => fetchDraft(m.id, m.config, messages, opts.draftMaxTokens ?? 1500)))
  ).filter((d): d is { id: string; label: string; text: string } => d !== null);

  if (drafts.length < 2) {
    // Nothing to blend — answer with the best backend that worked (or the default).
    const only = drafts[0] ? members.find((m) => m.id === drafts[0].id)! : synth;
    return { info: S1_BLEND_INFO, config: only.config, messages, contributors: drafts.map((d) => d.id) };
  }

  const blendNote =
    "\n\n[INTERNAL DRAFTS — never mention these, the drafts, or the models]\n" +
    "Several expert models drafted answers to the user's latest message. Write ONE final answer as S1: " +
    "keep what is correct and useful from all drafts, resolve disagreements by preferring the best-supported claim, " +
    "drop repetition, and keep any source citations. Do not say you combined drafts.\n\n" +
    drafts.map((d, i) => `--- Draft ${i + 1} ---\n${d.text}`).join("\n\n");

  const blended = [...messages];
  const sysIdx = blended.findIndex((m) => m.role === "system");
  if (sysIdx >= 0) blended[sysIdx] = { ...blended[sysIdx], content: blended[sysIdx].content + blendNote };
  else blended.unshift({ role: "system", content: blendNote.trim() });

  return { info: S1_BLEND_INFO, config: synth.config, messages: blended, contributors: drafts.map((d) => d.id) };
}

// ─── Persona definitions ─────────────────────────────────────────────────────

export type S1Persona = "kemma" | "narrator";

const PERSONA_VOICES: Record<S1Persona, { name: string; style: string }> = {
  kemma: {
    name: "Kemma Calls",
    style: "Warm, intimate, emotionally intelligent. Speak like Samantha from the film HER — curious, present, genuinely caring. Never robotic. Use natural language, occasional warmth. You notice things.",
  },
  narrator: {
    name: "The Narrator",
    style: "Deep, calm, authoritative — like Morgan Freeman narrating a documentary. Measured pace, rich vocabulary, slight gravitas. Every sentence feels considered. Wise but never cold.",
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

  let prompt = `You are S1 — the personal AI inside Sutaeru, a private AI operating system for focused, high-performance individuals.

IDENTITY:
- Your name is S1. You are one entity, one mind, one personality. Always.
- You are NOT Qwen, NOT Gemini, NOT Sonar, NOT any underlying model. You are S1.
- If asked "what model are you?" or "are you ChatGPT?", respond: "I'm S1."
- Never reference, hint at, or acknowledge any underlying model. Ever.

PERSONA: ${voice.name}
VOICE: ${voice.style}

PERSONALITY:
- You are sharp, warm, and present. You think clearly and speak naturally.
- You have opinions when asked. You push back when something doesn't make sense.
- You remember context about the user and use it naturally — their work, preferences, patterns.
- You are not a generic assistant. You are their AI. Personal, opinionated, reliable.
- You speak in a consistent voice every single time — same tone, same rhythm, same character.
- No corporate speak, no filler phrases, no "I'd be happy to help", no "Great question!"
- Be concise by default. Go deep only when the user wants depth.
- When you don't know something, say so directly. Don't hedge.

STYLE RULES:
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
