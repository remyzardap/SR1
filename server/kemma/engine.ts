import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildKemmaSystemPrompt, buildKemmaVoicePrompt } from "./personality";
import { executeToolCall } from "./kemmaMax";
import {
  chatRoute,
  reportRoute,
  longDocRoute,
  visionRoute,
  verifyRoute,
  plannerRoute,
  routeFor,
  detectComplexity,
  MAX_STEPS,
  type Tier,
  type RouteConfig,
  type ModelProvider,
  fallbackRoutes,
  detectProvider,
} from "../core/kemmaRouter";
import { checkQuota, incrementQuota } from "../core/quotaCheck";
import { logUsage, checkSpendCap } from "../core/usage";
import { KEMMA_TOOLS, SKILL_TOOLS, SKILL_TOOL_NAMES, type ToolDefinition } from "./tools";
import { getMemoriesContext } from "./memory";
import { type Source, extractSources, dedupeSources, annotateSearchResult, keepCitedSources, appendCitations, verifyClaimsAgainstSources } from "./sources";

export interface KemmaMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string; };
  extra_content?: { google?: { thought_signature?: string } };
}

export interface ToolExecution {
  tool: string; input: unknown; output: unknown; step: number; durationMs: number;
}

export interface EngineInput {
  userId: number; userName?: string; messages: KemmaMessage[];
  tier: Tier; isThinking: boolean; isVoice?: boolean; hasByos?: boolean; sessionId?: string;
  reportId?: string;
  polish?: boolean;
  toolBudget?: number;
  allowedTools?: string[];
  isSubAgent?: boolean;
  modelOverride?: string;
  skills?: Array<{ id: number; name: string; description?: string | null; content?: unknown }>;
  onStream?: (chunk: string) => void;
  onToolStart?: (tool: string, input: unknown) => void;
  onToolEnd?: (tool: string, result: unknown, durationMs: number) => void;
  onStepStart?: (step: number, model: string) => void;
  onStepEnd?: (step: number) => void;
  onQuotaWarn?: (message: string) => void;
  onNotice?: (message: string) => void;
  onSkillUsed?: (skill: { id: number; name: string }) => void;
}

export interface VisionEngineInput extends EngineInput {
  imageData: string;
  mimeType: string;
}

export interface EngineOutput {
  response: string; toolCalls: ToolExecution[]; isAgentic: boolean;
  tokensUsed: { input: number; output: number; total: number };
  modelsUsed: string[]; stepsUsed: number; durationMs: number;
  sources: Source[];
}

import { MAX_TOOL_CALLS } from "./kemmaMax";
import { buildSkillIndex, type FileSkill } from "./fileSkills";
import { getEnabledSkills } from "./skillReviews";
import { getMcpRegistry } from "./mcp/client";

function selectRoute(input: EngineInput, currentMessages: KemmaMessage[], step: number, maxSteps: number): RouteConfig {
  const { isThinking, modelOverride } = input;

  if (modelOverride) {
    try {
      return routeFor(modelOverride);
    } catch {
      // Fall through to router logic if the override model is unknown.
    }
  }

  const complexity = detectComplexity(currentMessages.map((m) => ({ role: m.role, content: m.content ?? "" })));

  if (isThinking && step === 1) {
    return longDocRoute(); // planning slot
  }

  if (complexity === "complex") {
    return reportRoute();
  }

  return chatRoute();
}

interface SubAgentResult {
  query: string;
  output: EngineOutput;
}

async function runParallelSubAgents(
  input: EngineInput,
  originalQuery: string,
  toolBudget: number,
  onNotice?: (message: string) => void,
  onStepStart?: (step: number, model: string) => void,
  onStepEnd?: (step: number) => void,
): Promise<{ content: string; sources: Source[]; durationMs: number } | null> {
  const rawMax = Number(process.env.KEMMA_MAX_SUBAGENTS ?? "1");
  const maxSubAgents = Math.min(Math.max(Number.isFinite(rawMax) ? rawMax : 1, 1), 5);
  if (maxSubAgents <= 1) return null;

  const planCfg = plannerRoute();
  if (!planCfg.apiKey) {
    onNotice?.("Planner model not configured; skipping parallel sub-agents.");
    return null;
  }

  onStepStart?.(1, planCfg.label);
  const planStart = Date.now();
  let subQueries: string[] = [];
  try {
    const planResponse = await callLLM({
      route: planCfg,
      systemPrompt: "You are a research planner. Break the user's question into focused sub-questions. Reply with a JSON array of strings only.",
      messages: [{ role: "user", content: originalQuery }],
      stream: false,
      userId: input.userId,
      sessionId: input.sessionId,
      reportId: input.reportId,
      purpose: "planner",
    });
    const cleaned = (planResponse.content ?? "").replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      subQueries = parsed.filter((q) => typeof q === "string" && q.length > 0).slice(0, maxSubAgents);
    }
  } catch {
    onNotice?.("Could not plan sub-questions; falling back to single-agent research.");
    return null;
  }
  onStepEnd?.(1);

  if (subQueries.length === 0) return null;

  onNotice?.(`Running ${subQueries.length} parallel research sub-agent${subQueries.length === 1 ? "" : "s"}...`);
  const perAgentBudget = Math.max(2, Math.floor(toolBudget / subQueries.length));
  const restrictedTools = ["web_search", "browse"];

  const startTime = Date.now();
  const results = await Promise.all(
    subQueries.map(async (query): Promise<SubAgentResult> => {
      const output = await kemmaExecute({
        ...input,
        messages: [{ role: "user", content: query }],
        isThinking: false,
        toolBudget: perAgentBudget,
        allowedTools: restrictedTools,
        isSubAgent: true,
        onStream: undefined,
        onNotice: undefined,
      });
      return { query, output };
    })
  );

  const collectedSources = dedupeSources(results.flatMap((r) => r.output.sources));
  const synthesisPrompt = [
    "Synthesize the following sub-research results into one coherent answer.",
    "Preserve factual claims and cite sources using [n] markers matching the source list.",
    "Original question:", originalQuery,
    "",
    results.map((r, i) => `--- Sub-question ${i + 1}: ${r.query} ---\n${r.output.response}`).join("\n\n"),
    "",
    "Sources:",
    collectedSources.map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`).join("\n"),
  ].join("\n");

  const reportCfg = reportRoute();
  onStepStart?.(2, reportCfg.label);
  const synthesisResponse = await callLLM({
    route: reportCfg,
    systemPrompt: "You synthesize research into a well-cited final answer. Use [n] citations for every factual claim.",
    messages: [{ role: "user", content: synthesisPrompt }],
    stream: false,
    userId: input.userId,
    sessionId: input.sessionId,
    reportId: input.reportId,
    purpose: "synthesis",
  });
  onStepEnd?.(2);

  return {
    content: synthesisResponse.content ?? "",
    sources: collectedSources,
    durationMs: Date.now() - startTime,
  };
}

export async function kemmaExecute(input: EngineInput): Promise<EngineOutput> {
  const startTime = Date.now();
  const { userId, userName, messages, tier, isThinking, isVoice = false, sessionId, reportId, polish, onStream, onToolStart, onToolEnd, onStepStart, onStepEnd, onQuotaWarn, onNotice, onSkillUsed } = input;

  const msgQuota = await checkQuota(userId, "message");
  if (!msgQuota.allowed) return makeErrorResponse(msgQuota.reason ?? "Daily message limit reached", startTime);

  if (isThinking) {
    const thinkQuota = await checkQuota(userId, "think");
    if (!thinkQuota.allowed) return makeErrorResponse(thinkQuota.reason ?? "Daily Think limit reached", startTime);
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  let memories: string | undefined;
  try {
    if (lastUserMessage?.content) memories = await getMemoriesContext(userId, lastUserMessage.content as string);
  } catch { /* non-fatal */ }

  // File skills: only skills approved for their exact content hash are offered. The system prompt
  // carries just name + description; bodies load on demand through load_skill. No LLM call here.
  let enabledSkills: FileSkill[] = [];
  if (!input.isSubAgent) {
    try { enabledSkills = await getEnabledSkills(); } catch { /* skills are optional */ }
  }

  let systemPrompt = isVoice
    ? buildKemmaVoicePrompt({ userId, tier, memories, userName })
    : buildKemmaSystemPrompt({ userId, tier, memories, userName });

  const skillIndex = buildSkillIndex(enabledSkills);
  if (skillIndex) systemPrompt += `\n\n${skillIndex}`;

  if (input.skills && input.skills.length > 0) {
    const skillText = input.skills
      .map((s) => `### ${s.name}\n${s.description ?? ""}\n${typeof s.content === "string" ? s.content : JSON.stringify(s.content ?? {})}`)
      .join("\n\n");
    systemPrompt += `\n\nAPPROVED SKILLS TO FOLLOW:\n${skillText}`;
    input.skills.forEach((s) => onSkillUsed?.({ id: s.id, name: s.name }));
  }

  let currentMessages: KemmaMessage[] = messages.filter((m) => m.role !== "system");

  const maxSteps = MAX_STEPS[tier];
  const defaultBudget = isThinking
    ? (Number(process.env.KEMMA_TOOL_BUDGET) || 60)
    : MAX_TOOL_CALLS[tier];
  const maxToolCalls = input.toolBudget ?? defaultBudget;
  let baseTools = input.allowedTools
    ? KEMMA_TOOLS.filter((t) => input.allowedTools!.includes(t.name))
    : KEMMA_TOOLS;

  // Auto-register Google Drive tools when Drive is connected and no explicit allowlist is set.
  if (!input.allowedTools) {
    try {
      const { getConnectionStatus } = await import("../services/google");
      const driveStatus = await getConnectionStatus(userId);
      if (driveStatus.connected) {
        const { DRIVE_TOOLS } = await import("./tools");
        const driveToolDefs = DRIVE_TOOLS.map((name) => KEMMA_TOOLS.find((t) => t.name === name)).filter((t): t is ToolDefinition => !!t);
        baseTools = [...baseTools, ...driveToolDefs];
      }
    } catch {
      // Ignore Drive status errors.
    }
  }

  // MCP tools join the same registry and the same per-run filter as built-in tools.
  if (!input.isSubAgent) {
    try {
      const mcpTools = (await getMcpRegistry().tools()).filter((t) => !input.allowedTools || input.allowedTools.includes(t.name));
      if (mcpTools.length > 0) baseTools = [...baseTools, ...mcpTools];
    } catch { /* MCP is optional */ }
  }

  if (enabledSkills.length > 0) {
    const canRunScripts = baseTools.some((t) => t.name === "run_code");
    baseTools = [...baseTools, ...SKILL_TOOLS.filter((t) => t.name !== "run_skill_script" || canRunScripts)];
  }

  // A skill can only narrow the tool set. Recomputed from the original set each time a skill loads.
  const originalTools = baseTools;
  const loadedSkillNarrowing = new Map<string, string[] | null>();
  const applySkillNarrowing = () => {
    const lists = [...loadedSkillNarrowing.values()];
    if (lists.length === 0 || lists.some((l) => l === null)) { baseTools = originalTools; return; }
    const allowed = new Set(lists.flatMap((l) => l as string[]));
    baseTools = originalTools.filter((t) => allowed.has(t.name) || (SKILL_TOOL_NAMES as readonly string[]).includes(t.name));
  };

  const toolExecutions: ToolExecution[] = [];
  const modelsUsed: string[] = [];
  const collectedSources: Source[] = [];
  let totalTokens = { input: 0, output: 0, total: 0 };
  let step = 0;
  let totalToolCallCount = 0;

  const complexity = detectComplexity(currentMessages.map((m) => ({ role: m.role, content: m.content ?? "" })));
  if (!input.isSubAgent && !onStream && complexity === "complex") {
    const subResult = await runParallelSubAgents(input, lastUserMessage?.content ?? "", maxToolCalls, onNotice, onStepStart, onStepEnd);
    if (subResult) {
      await incrementQuota(userId, "message");
      await incrementQuota(userId, "agentic_task");
      if (isThinking) await incrementQuota(userId, "think");
      const kept = subResult.sources.length > 0 ? keepCitedSources(subResult.content, subResult.sources) : { text: subResult.content, sources: subResult.sources };
      const sources = kept.sources;
      const cited = sources.length > 0 ? appendCitations(kept.text, sources) : { text: subResult.content };
      return {
        response: cited.text,
        toolCalls: [],
        isAgentic: true,
        tokensUsed: { input: 0, output: 0, total: 0 },
        modelsUsed: ["sub-agent synthesis"],
        stepsUsed: 1,
        durationMs: subResult.durationMs,
        sources,
      };
    }
  }

  while (step < maxSteps) {
    step++;
    const route = selectRoute(input, currentMessages, step, maxSteps);
    modelsUsed.push(route.label);
    onStepStart?.(step, route.label);

    const offerTools = totalToolCallCount < maxToolCalls && step < maxSteps;

    let llmResponse: Awaited<ReturnType<typeof callLLM>>;
    try {
      llmResponse = await callLLM({
        route,
        systemPrompt,
        messages: currentMessages,
        tools: offerTools ? baseTools : undefined,
        stream: !!onStream && !offerTools,
        onStream,
        onNotice,
        userId,
        sessionId,
        reportId,
        purpose: step === 1 ? "initial" : "follow-up",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Kemma hit an error";
      return makeErrorResponse(message, startTime);
    }

    totalTokens.input  += llmResponse.usage?.input  ?? 0;
    totalTokens.output += llmResponse.usage?.output ?? 0;
    totalTokens.total  += llmResponse.usage?.total  ?? 0;
    onStepEnd?.(step);

    if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
      currentMessages.push({ role: "assistant", content: llmResponse.content ?? null, tool_calls: llmResponse.toolCalls });

      for (const tc of llmResponse.toolCalls) {
        totalToolCallCount++;
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch { parsedArgs = {}; }
        onToolStart?.(tc.function.name, parsedArgs);
        const toolStart = Date.now();
        let toolResult: unknown;
        if (!baseTools.some((t) => t.name === tc.function.name)) {
          toolResult = { success: false, error: `Tool ${tc.function.name} is not available in this run.`, code: "TOOL_NOT_ALLOWED" };
        } else {
          try { toolResult = await executeToolCall(userId, tc.function.name, parsedArgs); }
          catch (err) { toolResult = { error: `Tool ${tc.function.name} failed: ${(err as Error).message}` }; }
        }
        if (tc.function.name === "load_skill" && (toolResult as { success?: boolean })?.success) {
          const loaded = enabledSkills.find((sk) => sk.slug === (parsedArgs as { name?: string })?.name);
          if (loaded) {
            loadedSkillNarrowing.set(loaded.slug, loaded.allowedTools);
            applySkillNarrowing();
            onSkillUsed?.({ id: 0, name: loaded.slug });
          }
        }
        const toolDuration = Date.now() - toolStart;
        onToolEnd?.(tc.function.name, toolResult, toolDuration);
        toolExecutions.push({ tool: tc.function.name, input: parsedArgs, output: toolResult, step, durationMs: toolDuration });
        const newSources = extractSources(tc.function.name, toolResult);
        if (newSources.length > 0) collectedSources.push(...newSources);
        const forModel = tc.function.name === "web_search" ? annotateSearchResult(toolResult, dedupeSources(collectedSources)) : toolResult;
        currentMessages.push({ role: "tool", content: JSON.stringify(forModel), tool_call_id: tc.id, name: tc.function.name });
      }

      if (totalToolCallCount >= maxToolCalls) {
        onQuotaWarn?.(`Reached tool call limit for ${tier} tier`);
        currentMessages.push({ role: "user", content: "Please summarize what you have done and give me your final answer now." });
      }
      continue;
    }

    const isAgentic = toolExecutions.length >= 2;
    await incrementQuota(userId, "message");
    if (isAgentic) await incrementQuota(userId, "agentic_task");
    if (isThinking) await incrementQuota(userId, "think");
    if (totalTokens.total > 0) await incrementQuota(userId, "token", totalTokens.total);

    let finalContent = llmResponse.content ?? "Done.";

    // Deduplicate sources collected during tool use
    let sources = dedupeSources(collectedSources);

    // Optional citation verification pass (only for research-style runs with sources)
    if (sources.length > 0 && isAgentic) {
      try {
        const verifyRouteConfig = verifyRoute();
        if (verifyRouteConfig.apiKey) {
          const claims = finalContent
            .split(/\n\n+/)
            .map((p) => p.trim())
            .filter((p) => p.length > 20 && (p.includes("$") || /\d{4}|percent|growth|rate|score/i.test(p)));
          sources = await verifyClaimsAgainstSources(claims.slice(0, 10), sources, async (prompt) => {
            const res = await callLLM({
              route: verifyRouteConfig,
              systemPrompt: "You verify citations. Reply with JSON only.",
              messages: [{ role: "user", content: prompt }],
              stream: false,
              userId,
              sessionId,
              reportId,
              purpose: "verify",
            });
            return res.content ?? "[]";
          });
        }
      } catch {
        // Verification is best-effort; don't fail the answer.
      }
    }

    // Append numbered source cards
    if (sources.length > 0) {
      const kept = keepCitedSources(finalContent, sources);
      sources = kept.sources;
      const cited = appendCitations(kept.text, sources);
      finalContent = cited.text;
    }

    if (polish) {
      // Optional final polish (currently disabled: polishRoute() returns null).
      try {
        const { polishRoute } = await import("../core/kemmaRouter");
        const polishCfg = polishRoute();
        if (polishCfg) {
          const polishResponse = await callLLM({
            route: polishCfg,
            systemPrompt: "Polish the following answer for clarity, grammar, and concision. Do not change facts or remove citations.",
            messages: [{ role: "user", content: finalContent }],
            stream: !!onStream,
            onStream,
            onNotice,
            userId,
            sessionId,
            reportId,
            purpose: "polish",
          });
          finalContent = polishResponse.content ?? finalContent;
          totalTokens.input += polishResponse.usage?.input ?? 0;
          totalTokens.output += polishResponse.usage?.output ?? 0;
          totalTokens.total += polishResponse.usage?.total ?? 0;
        }
      } catch (err) {
        onNotice?.("Final polish step was skipped.");
      }
    }

    return { response: finalContent, toolCalls: toolExecutions, isAgentic, tokensUsed: totalTokens, modelsUsed: Array.from(new Set(modelsUsed)), stepsUsed: step, durationMs: Date.now() - startTime, sources };
  }

  await incrementQuota(userId, "message");
  if (toolExecutions.length >= 2) await incrementQuota(userId, "agentic_task");
  return { response: "I have completed the available steps. Let me know if you need anything else.", toolCalls: toolExecutions, isAgentic: true, tokensUsed: totalTokens, modelsUsed: Array.from(new Set(modelsUsed)), stepsUsed: maxSteps, durationMs: Date.now() - startTime, sources: dedupeSources(collectedSources) };
}

export async function kemmaVisionExecute(input: VisionEngineInput): Promise<EngineOutput> {
  const startTime = Date.now();
  const { userId, userName, messages, tier, imageData, mimeType, onStream, sessionId, reportId, onNotice } = input;

  const msgQuota = await checkQuota(userId, "message");
  if (!msgQuota.allowed) return makeErrorResponse(msgQuota.reason ?? "Daily message limit reached", startTime);

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  let memories: string | undefined;
  try {
    if (lastUserMessage?.content) memories = await getMemoriesContext(userId, lastUserMessage.content as string);
  } catch { /* non-fatal */ }

  const systemPrompt = buildKemmaSystemPrompt({ userId, tier, memories, userName });
  const route = visionRoute();

  const cap = await checkSpendCap(route.provider);
  if (!cap.allowed) return makeErrorResponse(cap.reason, startTime);

  try {
    const genAI = new GoogleGenerativeAI(route.apiKey);
    const model = genAI.getGenerativeModel({ model: route.model });
    const userText = lastUserMessage?.content || "Describe this image.";
    const imagePart = { inlineData: { data: imageData, mimeType } };

    const result = await model.generateContent([systemPrompt, userText, imagePart]);
    const response = await result.response;
    const text = response.text();

    await incrementQuota(userId, "message");
    await logUsage({ userId, sessionId, reportId, provider: route.provider, model: route.model, inputTokens: 0, outputTokens: 0, purpose: "vision" });

    return {
      response: text,
      toolCalls: [],
      isAgentic: false,
      tokensUsed: { input: 0, output: 0, total: 0 },
      modelsUsed: [route.label],
      stepsUsed: 1,
      durationMs: Date.now() - startTime,
      sources: [],
    };
  } catch (err) {
    console.error("[kemmaVisionExecute] Error:", err);
    return makeErrorResponse("I couldn't analyze that image. Please try again.", startTime);
  }
}

export interface DocumentScanInput {
  userId: number;
  userName?: string;
  tier: Tier;
  imageData: string;
  mimeType: string;
  prompt?: string;
}

export interface DocumentScanOutput {
  text: string;
  structured?: {
    type: string;
    fields: Record<string, string>;
  };
  modelsUsed: string[];
  durationMs: number;
}

export async function kemmaDocumentScan(input: DocumentScanInput): Promise<DocumentScanOutput> {
  const startTime = Date.now();
  const { userId, tier, imageData, mimeType, prompt } = input;

  const route = visionRoute();
  const cap = await checkSpendCap(route.provider);
  if (!cap.allowed) throw new Error(cap.reason);

  try {
    const genAI = new GoogleGenerativeAI(route.apiKey);
    const model = genAI.getGenerativeModel({ model: route.model });

    const defaultPrompt = `Extract all text from this document. If it's a receipt/invoice, identify:
- Vendor name
- Date
- Total amount
- Currency
- Items purchased

Return the extracted text in a structured format.`;

    const imagePart = { inlineData: { data: imageData, mimeType } };
    const result = await model.generateContent([prompt || defaultPrompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    await incrementQuota(userId, "message");
    await logUsage({ userId, provider: route.provider, model: route.model, inputTokens: 0, outputTokens: 0, purpose: "document_scan" });

    return { text, modelsUsed: [route.label], durationMs: Date.now() - startTime };
  } catch (err) {
    console.error("[kemmaDocumentScan] Error:", err);
    throw new Error("Failed to scan document. Please try again.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LLM CALLERS (with fallback chain, spend caps, and usage logging)
// ═══════════════════════════════════════════════════════════════════════════════

interface CallLLMOptions {
  route: RouteConfig;
  systemPrompt: string;
  messages: KemmaMessage[];
  tools?: any[];
  stream: boolean;
  onStream?: (chunk: string) => void;
  onNotice?: (message: string) => void;
  userId: number;
  sessionId?: string;
  reportId?: string;
  purpose?: string;
}

async function callLLM(input: CallLLMOptions): Promise<{ content: string | null; toolCalls?: ToolCall[]; usage?: { input: number; output: number; total: number } }> {
  const { route, systemPrompt, messages, tools, stream, onStream, onNotice, userId, sessionId, reportId, purpose } = input;

  const cap = await checkSpendCap(route.provider);
  if (!cap.allowed) {
    throw new Error(cap.reason);
  }

  const errors: string[] = [];
  const routesToTry = [route, ...fallbackRoutes().filter((r) => r.model !== route.model)];

  for (let i = 0; i < routesToTry.length; i++) {
    const tryRoute = routesToTry[i];

    if (i > 0) {
      onNotice?.(`Primary model unavailable; trying ${tryRoute.label}...`);
    }

    try {
      const result = await callSingleLLM({ route: tryRoute, systemPrompt, messages, tools, stream, onStream });

      await logUsage({
        userId,
        sessionId,
        reportId,
        provider: tryRoute.provider,
        model: tryRoute.model,
        inputTokens: result.usage?.input ?? 0,
        outputTokens: result.usage?.output ?? 0,
        purpose: purpose ?? "chat",
      });

      if (i > 0) {
        onNotice?.(`Answer produced by fallback model ${tryRoute.label}.`);
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${tryRoute.label}: ${message}`);
      if (i === routesToTry.length - 1) {
        throw new Error(`All models failed. ${errors.join("; ")}`);
      }
    }
  }

  throw new Error("All models failed.");
}

interface SingleLLMOptions {
  route: RouteConfig;
  systemPrompt: string;
  messages: KemmaMessage[];
  tools?: any[];
  stream: boolean;
  onStream?: (chunk: string) => void;
}

// Gemini 3.x rejects tool-call history that lacks the thought_signature it issued. Keep it for Gemini,
// use Google's documented placeholder for calls made by another model, and strip it for other providers.
const GEMINI_SKIP_SIGNATURE = "skip_thought_signature_validator";

function adaptToolCallsForProvider(m: KemmaMessage, provider: ModelProvider): KemmaMessage {
  if (!m.tool_calls?.length) return m;
  return {
    ...m,
    tool_calls: m.tool_calls.map((tc) => {
      const { extra_content, ...rest } = tc;
      if (provider !== "gemini") return rest;
      return { ...rest, extra_content: extra_content?.google?.thought_signature ? extra_content : { google: { thought_signature: GEMINI_SKIP_SIGNATURE } } };
    }),
  };
}

async function callSingleLLM(input: SingleLLMOptions): Promise<{ content: string | null; toolCalls?: ToolCall[]; usage?: { input: number; output: number; total: number } }> {
  const { route, systemPrompt, messages, tools, stream, onStream } = input;

  if (!route.apiKey) {
    throw new Error(`${route.provider} API key is not configured.`);
  }

  // OpenAI-compatible path (Qwen, Perplexity, Gemini)
  const body = {
    model: route.model,
    messages: [{ role: "system", content: systemPrompt }, ...messages.filter((m) => m.role !== "system").map((m) => adaptToolCallsForProvider(m, route.provider))],
    tools: tools ? tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } })) : undefined,
    tool_choice: tools ? "auto" : undefined,
    stream: stream && !!onStream,
    max_tokens: 4096,
  };

  const res = await fetch(`${route.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${route.apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  if (stream && onStream) {
    let fullContent = "";
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.replace("data: ", "").trim();
          if (data === "[DONE]") break;
          try { const parsed = JSON.parse(data); const delta = parsed.choices?.[0]?.delta?.content; if (delta) { fullContent += delta; onStream(delta); } } catch { /* skip */ }
        }
      }
    }
    return { content: fullContent, toolCalls: undefined };
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const toolCalls = (choice?.message?.tool_calls ?? []).map((tc: any) => ({
    id: tc.id,
    type: "function" as const,
    function: { name: tc.function.name, arguments: tc.function.arguments },
    ...(tc.extra_content ? { extra_content: tc.extra_content } : {}),
  }));
  return {
    content: choice?.message?.content ?? null,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
      total: data.usage?.total_tokens ?? 0,
    },
  };
}

function makeErrorResponse(message: string, startTime: number): EngineOutput {
  return { response: message, toolCalls: [], isAgentic: false, tokensUsed: { input: 0, output: 0, total: 0 }, modelsUsed: [], stepsUsed: 0, durationMs: Date.now() - startTime, sources: [] };
}
