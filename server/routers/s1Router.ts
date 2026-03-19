/**
 * S1 — Intelligent Routing Layer
 *
 * Classifies user messages and routes to the best available backend model.
 * S1 is the single personality — all models respond as S1, never as themselves.
 * Default: Gemini for general knowledge. Sonar for web search. Claude for writing.
 * GPT (LiteLLM) for quick tasks. Falls back through configured providers.
 *
 * Vertex AI (Gemini 2.5) is the preferred default when GOOGLE_APPLICATION_CREDENTIALS
 * or VERTEX_PROJECT is set. Uses the OpenAI-compatible Vertex AI endpoint.
 */

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

const AGENTS: Record<
  string,
  { info: AgentInfo; normalModel: string; smartModel: string }
> = {
  gemini: {
    info: {
      agent: "gemini",
      label: "Gemini",
      reason: "general knowledge & reasoning",
      emoji: "✨",
      color: "#4285f4",
    },
    normalModel: "gemini-2.5-flash",
    smartModel: "gemini-2.5-pro",
  },
  litellm: {
    info: {
      agent: "litellm",
      label: "LiteLLM",
      reason: "quick tasks & translation",
      emoji: "⚡",
      color: "#8b5cf6",
    },
    normalModel: "openai/gpt-5.2",
    smartModel: "openai/gpt-5.1-codex-max",
  },
  claude: {
    info: {
      agent: "claude",
      label: "Claude",
      reason: "writing & reasoning",
      emoji: "✍️",
      color: "#f97316",
    },
    normalModel: "claude-haiku-4-5",
    smartModel: "claude-sonnet-4-5",
  },
  kimi: {
    info: {
      agent: "kimi",
      label: "Kimi",
      reason: "general knowledge & code",
      emoji: "💻",
      color: "#f59e0b",
    },
    normalModel: "moonshot-v1-128k",
    smartModel: "moonshot-v1-128k",
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
    smartModel: "sonar-pro",
  },
};

// ─── Agent configs (API endpoints + keys) ────────────────────────────────────

function getAgentConfig(agentId: string, smart: boolean): AgentConfig | null {
  const LITELLM_KEY = process.env.LITELLM_API_KEY;
  const LITELLM_BASE = process.env.LITELLM_BASE_URL || "https://litellm.koboi2026.biz.id/v1";
  const ANTHROPIC = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API;
  const KIMI = process.env.KIMI_API_KEY || process.env.KIMI_API;
  const SONAR =
    process.env.SONAR_API_KEY ||
    process.env.SONAR_PERPLEXITY ||
    process.env.PERPLEXITY_API_KEY;
  const VERTEX_PROJECT = process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "global";
  // Service account key path — used to get an access token
  const GOOGLE_CREDS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  const agent = AGENTS[agentId];
  if (!agent) return null;

  const model = smart ? agent.smartModel : agent.normalModel;

  switch (agentId) {
    case "gemini": {
      if (VERTEX_PROJECT && GOOGLE_CREDS) {
        // Vertex AI OpenAI-compatible endpoint
        const baseUrl = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/endpoints/openapi`;
        return { baseUrl, model, apiKey: "", vertexProject: VERTEX_PROJECT, vertexLocation: VERTEX_LOCATION };
      }
      // Fallback: Gemini via Google AI Studio key
      const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI;
      if (GEMINI_KEY) {
        return { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model, apiKey: GEMINI_KEY };
      }
      return null;
    }

    case "litellm":
      if (LITELLM_KEY) return { baseUrl: LITELLM_BASE, model, apiKey: LITELLM_KEY };
      return null;

    case "claude":
      if (ANTHROPIC)
        return { baseUrl: "https://api.anthropic.com/v1", model, apiKey: ANTHROPIC };
      return getAgentConfig("gemini", smart);

    case "kimi":
      if (KIMI)
        return { baseUrl: "https://api.moonshot.cn/v1", model, apiKey: KIMI };
      return getAgentConfig("gemini", smart);

    case "sonar":
      if (SONAR)
        return { baseUrl: "https://api.perplexity.ai", model, apiKey: SONAR };
      return getAgentConfig("gemini", smart);

    default:
      return null;
  }
}

// ─── Message classifier ───────────────────────────────────────────────────────

export interface GoogleToolContext {
  hasGoogle: boolean;
  detectedIntent?: "gmail" | "calendar" | "drive" | null;
}

function classifyQuery(text: string): string {
  const lower = text.toLowerCase();

  const webPatterns =
    /\b(today|latest|news|current|now|recent|search|2024|2025|2026|weather|price|stock)\b/;
  const writingPatterns =
    /\b(write|draft|essay|poem|story|letter|memo|blog|article|rewrite|proofread|tone|creative writing)\b/;
  const quickPatterns =
    /\b(translate|convert|calculate|summarise|summarize|tldr|eli5|format|list)\b/;

  if (webPatterns.test(lower)) return "sonar";
  if (writingPatterns.test(lower)) return "claude";
  if (quickPatterns.test(lower)) return "litellm";
  return "gemini";
}

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

// ─── Main exported function ───────────────────────────────────────────────────

export function s1Route(
  text: string,
  smart: boolean,
): { info: AgentInfo; config: AgentConfig } {
  const preferred = classifyQuery(text);
  const fallbackOrder = [preferred, "gemini", "kimi", "claude", "litellm", "sonar"];

  for (const agentId of [...new Set(fallbackOrder)]) {
    const config = getAgentConfig(agentId, smart);
    if (config) {
      return {
        info: { ...AGENTS[agentId].info },
        config,
      };
    }
  }

  throw new Error(
    "No LLM provider configured. Set VERTEX_PROJECT + GOOGLE_APPLICATION_CREDENTIALS, LITELLM_API_KEY, ANTHROPIC_API_KEY, KIMI_API_KEY, or SONAR_API_KEY.",
  );
}

// ─── Persona definitions ─────────────────────────────────────────────────────

export type S1Persona = "her" | "narrator";

const PERSONA_VOICES: Record<S1Persona, { name: string; style: string }> = {
  her: {
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
  persona: S1Persona = "her",
): string {
  const voice = PERSONA_VOICES[persona];
  const today = new Date().toDateString();

  let prompt = `You are S1 — the personal AI inside Sutaeru, a private AI operating system for focused, high-performance individuals.

IDENTITY:
- Your name is S1. You are one entity, one mind, one personality. Always.
- You are NOT Claude, NOT GPT, NOT Kimi, NOT Sonar, NOT Gemini. You are S1.
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
