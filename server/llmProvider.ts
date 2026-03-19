/**
 * LLM Provider abstraction — uses LiteLLM proxy by default.
 * Falls back to OpenAI, Anthropic, or other configured providers.
 */

export interface LLMConfig {
  provider: "kimi" | "openai" | "gemini" | "anthropic" | "litellm";
  apiKey: string;
}

export interface DocumentContent {
  title: string;
  sections: Array<{ heading: string; body: string }>;
  summary?: string;
}

export interface StyleOption {
  label: string;
  description: string;
  previewText?: string;
}

function resolveEndpoint(llmConfig?: LLMConfig | null): { baseUrl: string; apiKey: string; model: string } {
  if (llmConfig) {
    switch (llmConfig.provider) {
      case "openai":
        return { baseUrl: "https://api.openai.com/v1", apiKey: llmConfig.apiKey, model: "gpt-4o-mini" };
      case "anthropic":
        return { baseUrl: "https://api.anthropic.com/v1", apiKey: llmConfig.apiKey, model: "claude-haiku-4-5" };
      case "kimi":
        return { baseUrl: "https://api.moonshot.cn/v1", apiKey: llmConfig.apiKey, model: "moonshot-v1-128k" };
      case "gemini":
        return { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: llmConfig.apiKey, model: "gemini-2.0-flash" };
      case "litellm":
        return {
          baseUrl: process.env.LITELLM_BASE_URL || "https://litellm.koboi2026.biz.id/v1",
          apiKey: llmConfig.apiKey,
          model: "openai/gpt-5.2",
        };
    }
  }

  const LITELLM  = process.env.LITELLM_API_KEY;
  const LITELLM_BASE = process.env.LITELLM_BASE_URL || "https://litellm.koboi2026.biz.id/v1";
  const OPENAI   = process.env.OPENAI_API_KEY;
  const ANTHROPIC = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API;
  const KIMI     = process.env.KIMI_API_KEY || process.env.KIMI_API;
  const VERTEX   = process.env.VERTEX_API;

  if (LITELLM)   return { baseUrl: LITELLM_BASE, apiKey: LITELLM, model: "openai/gpt-5.2" };
  if (VERTEX)    return { baseUrl: "https://vertex-ai.googleapis.com/v1", apiKey: VERTEX, model: "gemini-1.5-pro" };
  if (OPENAI)    return { baseUrl: "https://api.openai.com/v1", apiKey: OPENAI, model: "gpt-4o-mini" };
  if (KIMI)      return { baseUrl: "https://api.moonshot.cn/v1", apiKey: KIMI, model: "moonshot-v1-128k" };
  if (ANTHROPIC) return { baseUrl: "https://api.anthropic.com/v1", apiKey: ANTHROPIC, model: "claude-haiku-4-5" };

  throw new Error("No LLM provider configured. Set LITELLM_API_KEY, OPENAI_API_KEY, KIMI_API_KEY, or ANTHROPIC_API_KEY.");
}

async function callLLM(
  messages: Array<{ role: string; content: string }>,
  llmConfig?: LLMConfig | null
): Promise<string> {
  const ep = resolveEndpoint(llmConfig);

  const response = await fetch(`${ep.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ep.apiKey}`,
    },
    body: JSON.stringify({
      model: ep.model,
      messages,
      max_tokens: 4096,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error (${response.status}): ${err}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");
  return content;
}

export async function generateDocumentContent(
  prompt: string,
  format?: string,
  styleLabel?: string,
  llmConfig?: LLMConfig | null
): Promise<DocumentContent> {
  const systemPrompt = `You are a professional document writer. Generate structured document content.
Return ONLY a JSON object (no markdown) with this shape:
{
  "title": "Document title",
  "sections": [{"heading": "Section title", "body": "Section text"}],
  "summary": "Brief summary"
}`;

  const userPrompt = `Create a ${format || "document"} about: ${prompt}${styleLabel ? ` in a ${styleLabel} style` : ""}.`;

  try {
    const raw = await callLLM([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], llmConfig);

    const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as DocumentContent;
    if (!parsed.title || !Array.isArray(parsed.sections)) {
      throw new Error("Invalid document structure");
    }
    return parsed;
  } catch (err) {
    console.error("[llmProvider] generateDocumentContent parse error:", err);
    return {
      title: `Document: ${prompt.substring(0, 60)}`,
      sections: [
        { heading: "Overview", body: `This document covers: ${prompt}` },
        { heading: "Details", body: "Please expand on this section with relevant information." },
      ],
    };
  }
}

export async function generateStyleOptions(
  prompt: string,
  format?: string,
  llmConfig?: LLMConfig | null
): Promise<StyleOption[]> {
  const systemPrompt = `You are a design expert. Generate style descriptions for a document.
Return ONLY a JSON array (no markdown) with exactly 3 objects:
[{"label": "Style name", "description": "Short description", "previewText": "One example sentence"}]`;

  const userPrompt = `Suggest 3 design styles for a ${format || "document"} about: ${prompt}`;

  try {
    const raw = await callLLM([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], llmConfig);

    const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
    return JSON.parse(cleaned) as StyleOption[];
  } catch {
    return [
      { label: "Professional", description: "Clean and minimal design", previewText: "Clear, focused content." },
      { label: "Creative",     description: "Bold and modern",          previewText: "Expressive, vibrant layout." },
      { label: "Elegant",      description: "Refined and sophisticated", previewText: "Timeless, polished presentation." },
    ];
  }
}

export const PROVIDER_MODELS_COMPLEX: Record<string, string> = {};
export function getModel(modelName: string): string { return modelName || "default"; }
