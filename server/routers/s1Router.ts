/**
 * S1 — Intelligent Routing Layer
 *
 * Classifies user messages and routes to the best available backend model.
 * S1 is the single personality — all models respond as S1, never as themselves.
 * Models used: Qwen (writing, docs, quick tasks), Gemini (general knowledge &
 * reasoning, default) and Perplexity Sonar (web search & news). Falls back to
 * Gemini, then Qwen, when the preferred backend has no key.
 *
 * Vertex AI (Gemini 2.5) is the preferred Gemini backend when GOOGLE_APPLICATION_CREDENTIALS
 * or VERTEX_PROJECT is set. Uses the OpenAI-compatible Vertex AI endpoint.
 */

import { chatRoute, longDocRoute, routeFor } from "../core/kemmaRouter";

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
    normalModel: "gemini-2.5-flash",
    maxModel: "gemini-2.5-pro",
  },
  qwen: {
    info: {
      agent: "qwen",
      label: "Qwen",
      reason: "writing, documentation & quick tasks",
      emoji: "✍️",
      color: "#7c3aed",
    },
    normalModel: chatRoute().model,
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

function getAgentConfig(agentId: string, max: boolean): AgentConfig | null {
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
      return getAgentConfig("gemini", max);
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

function classifyQuery(text: string): string {
  const lower = text.toLowerCase();

  const webPatterns =
    /\b(today|latest|news|current|now|recent|search|2024|2025|2026|weather|price|stock)\b/;
  const writingPatterns =
    /\b(write|draft|essay|poem|story|letter|memo|blog|article|rewrite|proofread|tone|creative writing)\b/;
  const quickPatterns =
    /\b(translate|convert|calculate|summarise|summarize|tldr|eli5|format|list)\b/;
  const docsPatterns =
    /\b(docs|documentation|readme|changelog|api docs|jsdoc|docstring|wiki|guide|manual|reference)\b/;

  if (webPatterns.test(lower)) return "sonar";
  if (docsPatterns.test(lower) || writingPatterns.test(lower) || quickPatterns.test(lower)) return "qwen";
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
  max: boolean,
): { info: AgentInfo; config: AgentConfig } {
  const preferred = classifyQuery(text);
  const fallbackOrder = [preferred, "gemini", "qwen", "sonar"];

  for (const agentId of Array.from(new Set(fallbackOrder))) {
    const config = getAgentConfig(agentId, max);
    if (config) {
      return {
        info: { ...AGENTS[agentId].info },
        config,
      };
    }
  }

  throw new Error(
    "No LLM provider configured. Set GEMINI_API_KEY (or VERTEX_PROJECT + GOOGLE_APPLICATION_CREDENTIALS), QWEN_API_KEY, or SONAR_API_KEY.",
  );
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
