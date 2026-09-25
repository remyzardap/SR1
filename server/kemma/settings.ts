/**
 * Per-message / per-thread setting resolution for the Kemma chat surface.
 * Precedence: message settings > thread settings > server defaults.
 */

import { routeFor, ROUGH_PRICES_USD_PER_1M } from "../core/kemmaRouter";

export type ChatMode = "fast" | "deep" | "document" | "image";

export interface ThreadSettings {
  model?: string; // "auto" or a model name
  mode?: ChatMode;
  allowedTools?: string[];
  pinnedSkills?: number[];
}

export interface MessageSettings {
  model?: string;
  taggedSkills?: number[];
}

const MODE_DEFAULT_TOOLS: Record<ChatMode, string[]> = {
  fast: ["web_search"],
  deep: ["web_search", "browse", "run_code"],
  document: ["safe_files", "generate_file"],
  image: ["generate_file"],
};

export function defaultToolSet(mode: ChatMode = "fast"): string[] {
  return MODE_DEFAULT_TOOLS[mode];
}

export function resolveSettings(
  thread: ThreadSettings = {},
  message: MessageSettings = {},
  defaults: { model: string; mode: ChatMode; allowedTools: string[] } = { model: "auto", mode: "fast", allowedTools: defaultToolSet("fast") }
): { model: string; allowedTools: string[]; skills: number[] } {
  const model = message.model && message.model !== "auto" ? message.model : (thread.model && thread.model !== "auto" ? thread.model : defaults.model);
  const mode = thread.mode ?? defaults.mode;
  const threadTools = thread.allowedTools ?? defaultToolSet(mode);
  const allowedTools = thread.allowedTools ?? threadTools;
  const skills = [...new Set([...(thread.pinnedSkills ?? []), ...(message.taggedSkills ?? [])])];
  return { model, allowedTools, skills };
}

export interface AvailableModel {
  id: string;
  label: string;
  provider: string;
  tier: "cheap" | "medium" | "premium";
  hasKey: boolean;
}

export function listAvailableModels(): AvailableModel[] {
  const slots = [
    { id: "auto", label: "Auto (router picks)", provider: "router", tier: "cheap" as const },
    { env: "KEMMA_MODEL_CHAT", label: "Chat", provider: process.env.KEMMA_MODEL_CHAT ? deriveProvider(process.env.KEMMA_MODEL_CHAT) : "qwen", tier: "cheap" as const },
    { env: "KEMMA_MODEL_REPORT", label: "Report", provider: process.env.KEMMA_MODEL_REPORT ? deriveProvider(process.env.KEMMA_MODEL_REPORT) : "qwen", tier: "cheap" as const },
    { env: "KEMMA_MODEL_LONG_DOC", label: "Long doc", provider: process.env.KEMMA_MODEL_LONG_DOC ? deriveProvider(process.env.KEMMA_MODEL_LONG_DOC) : "qwen", tier: "cheap" as const },
    { env: "KEMMA_MODEL_PLANNER", label: "Planner", provider: process.env.KEMMA_MODEL_PLANNER ? deriveProvider(process.env.KEMMA_MODEL_PLANNER) : "gemini", tier: "cheap" as const },
    { env: "KEMMA_MODEL_VERIFY", label: "Verify", provider: process.env.KEMMA_MODEL_VERIFY ? deriveProvider(process.env.KEMMA_MODEL_VERIFY) : "gemini", tier: "cheap" as const },
    { env: "KEMMA_MODEL_VISION", label: "Vision", provider: process.env.KEMMA_MODEL_VISION ? deriveProvider(process.env.KEMMA_MODEL_VISION) : "gemini", tier: "cheap" as const },
    { env: "KEMMA_MODEL_IMAGE", label: "Image", provider: process.env.KEMMA_MODEL_IMAGE ? deriveProvider(process.env.KEMMA_MODEL_IMAGE) : "gemini", tier: "cheap" as const },
    { id: "qwen3.8-max", label: "Qwen 3.8 Max", provider: "qwen", tier: "cheap" as const },
    { id: "gemini-3.8-flash", label: "Gemini Flash", provider: "gemini", tier: "cheap" as const },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "gemini", tier: "cheap" as const },
  ];

  const seen = new Set<string>();
  const result: AvailableModel[] = [];
  for (const slot of slots) {
    const id = "id" in slot ? slot.id : (process.env[slot.env] || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const provider = "provider" in slot ? slot.provider : deriveProvider(id);
    const hasKey = hasProviderKey(provider);
    result.push({ id, label: "label" in slot ? slot.label : id, provider, tier: slot.tier, hasKey });
  }
  return result;
}

function deriveProvider(model: string): string {
  try {
    return routeFor(model).provider;
  } catch {
    return "litellm";
  }
}

function hasProviderKey(provider: string): boolean {
  switch (provider) {
    case "qwen": return !!process.env.QWEN_API_KEY;
    case "perplexity": return !!(process.env.SONAR_API_KEY || process.env.PERPLEXITY_API_KEY);
    case "gemini": return !!process.env.GEMINI_API_KEY;
    default: return false;
  }
}

export function estimateModelCostTier(model: string): "cheap" | "medium" | "premium" {
  const price = ROUGH_PRICES_USD_PER_1M[model];
  if (!price) return "medium";
  const avg = (price.input + price.output) / 2;
  if (avg <= 1) return "cheap";
  if (avg <= 8) return "medium";
  return "premium";
}
