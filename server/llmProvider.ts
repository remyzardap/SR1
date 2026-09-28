/**
 * LLM helper for document generation. Models are chosen by the platform via
 * the Kemma router (Qwen for text, Gemini as fallback) — never by the customer.
 */

import { chatRoute, fallbackRoutes } from "./core/kemmaRouter";

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

function resolveEndpoint(): { baseUrl: string; apiKey: string; model: string } {
  const route = [chatRoute(), ...fallbackRoutes()].find((r) => r.apiKey);
  if (!route) {
    throw new Error("No LLM provider configured. Set QWEN_API_KEY or GEMINI_API_KEY.");
  }
  return { baseUrl: route.baseUrl, apiKey: route.apiKey, model: route.model };
}

async function callLLM(messages: Array<{ role: string; content: string }>): Promise<string> {
  const ep = resolveEndpoint();

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
  styleLabel?: string
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
    ]);

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
  format?: string
): Promise<StyleOption[]> {
  const systemPrompt = `You are a design expert. Generate style descriptions for a document.
Return ONLY a JSON array (no markdown) with exactly 3 objects:
[{"label": "Style name", "description": "Short description", "previewText": "One example sentence"}]`;

  const userPrompt = `Suggest 3 design styles for a ${format || "document"} about: ${prompt}`;

  try {
    const raw = await callLLM([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

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
