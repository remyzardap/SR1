import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildKemmaSystemPrompt, buildKemmaVoicePrompt } from "./personality";
import { isAdminUser } from "./executors/vpsFiles";
import pLimit from "p-limit";
import { registerBuiltinTools } from "./toolkit/builtin";
import { getToolSpec, runTool, toOpenAiTools, toolsFor, type OpenAiToolDef } from "./toolkit/registry";
import { SKILL_TOOL_NAMES } from "./toolkit/names";
import type { ToolContext } from "./toolkit/types";
import {
  chatRoute,
  reportRoute,
  longDocRoute,
  visionRoute,
  verifyRoute,
  plannerRoute,
  callChainFor,
  routeFor,
  isAdminOnlyModel,
  detectComplexity,
  MAX_STEPS,
  type Tier,
  type RouteConfig,
  type ModelProvider,
  detectProvider,
  resolveRouteAuth,
  routeHasAuth,
} from "../core/kemmaRouter";
import { vertexGenerateContentBody, vertexGenerateContentText } from "../core/vertexAuth";
import {
  fetchWithRetry,
  parseUsage,
  placeDynamicContext,
  applyQwenCacheMarkers,
  usesExplicitCacheMarkers,
  disableQwenExplicitCache,
  isCacheMarkerRejection,
  isStreamOptionsRejection,
  supportsStreamUsageOption,
  type TokenUsage,
} from "../core/llmHttp";
import { checkQuota, incrementQuota } from "../core/quotaCheck";
import { logUsage, checkSpendCap } from "../core/usage";
import { flag } from "../core/flags";
import { readChatStream } from "../core/llmStream";
import type { SegmentKind } from "./events";
import { getMemoriesContext } from "./memory";
import { type Source, extractSources, dedupeSources, annotateSearchResult, keepCitedSources, appendCitations, verifyClaimsAgainstSources } from "./sources";
import { isUntrustedTool, extractToolSource, detectInjection, wrapUntrustedContent } from "./untrusted";

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
  /** Per-thread switch for routing sensitive messages to Venice. Default "auto". */
  sensitiveRouting?: "auto" | "off";
  skills?: Array<{ id: number; name: string; description?: string | null; content?: unknown }>;
  onStream?: (chunk: string) => void;
  onReasoning?: (delta: string) => void;
  onSegmentEnd?: (kind: SegmentKind) => void;
  onToolStart?: (tool: string, input: unknown, callId?: string) => void;
  onToolEnd?: (tool: string, result: unknown, durationMs: number, callId?: string) => void;
  onStepStart?: (step: number, model: string) => void;
  onStepEnd?: (step: number) => void;
  onQuotaWarn?: (message: string) => void;
  onNotice?: (message: string) => void;
  onSkillUsed?: (skill: { id: number; name: string }) => void;
  signal?: AbortSignal;
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
  /**
   * True when `response` holds an error message (quota block, all models failed) that never
   * went through onStream. Callers streaming to a client must surface it as an error, not as
   * an assistant answer.
   */
  isError?: boolean;
  cancelled?: boolean;
}

import { MAX_TOOL_CALLS } from "./kemmaMax";
import { buildSkillIndex, type FileSkill } from "./fileSkills";
import { getEnabledSkills } from "./skillReviews";
import { getMcpRegistry } from "./mcp/client";
import { BLOCKED_MESSAGE, decideChatRouting, isBlockedPrompt } from "../lib/sensitive";

/** P1-05 wires a real, run-scoped signal. Until then every run gets a signal that never aborts. */
const NEVER_ABORTS: AbortSignal = new AbortController().signal;

registerBuiltinTools();

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
  if (!routeHasAuth(planCfg)) {
    onNotice?.("Planner model not configured; skipping parallel sub-agents.");
    return null;
  }

  onStepStart?.(1, planCfg.label);
  const planStart = Date.now();
  if (input.signal?.aborted) return null;
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
      signal: input.signal,
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

  if (subQueries.length === 0 || input.signal?.aborted) return null;

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
        onNotice,
      });
      return { query, output };
    })
  );

  if (input.signal?.aborted) return null;

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
    signal: input.signal,
  });
  onStepEnd?.(2);

  return {
    content: synthesisResponse.content ?? "",
    sources: collectedSources,
    durationMs: Date.now() - startTime,
  };
}

function getToolConcurrency(): number {
  const raw = process.env.KEMMA_TOOL_CONCURRENCY?.trim();
  if (!raw) return 4;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
}

export async function kemmaExecute(input: EngineInput): Promise<EngineOutput> {
  const startTime = Date.now();
  if (input.signal?.aborted) {
    return {
      response: "",
      toolCalls: [],
      isAgentic: false,
      tokensUsed: { input: 0, output: 0, total: 0 },
      modelsUsed: [],
      stepsUsed: 0,
      durationMs: Date.now() - startTime,
      sources: [],
      isError: false,
      cancelled: true,
    };
  }
  // Admin-only models are re-checked against the DB here, whatever the caller passed.
  if (input.modelOverride && isAdminOnlyModel(input.modelOverride) && !(await isAdminUser(input.userId))) {
    input = { ...input, modelOverride: undefined };
  }
  // Blocked content (minors in a sexual context, anything illegal to produce) is refused before any model call.
  const latestUser = [...input.messages].reverse().find((m) => m.role === "user");
  const latestText = typeof latestUser?.content === "string" ? latestUser.content : "";
  if (isBlockedPrompt(latestText)) return makeErrorResponse(BLOCKED_MESSAGE, startTime);
  // A sensitive message from an admin account is answered by Venice. An explicit model choice is left alone.
  if (!input.modelOverride && !input.isSubAgent && latestText) {
    const decision = await decideChatRouting({
      text: latestText,
      setting: input.sensitiveRouting,
      isAdmin: () => isAdminUser(input.userId),
    });
    if (decision.blocked) return makeErrorResponse(BLOCKED_MESSAGE, startTime);
    if (decision.venice && decision.model) input = { ...input, modelOverride: decision.model };
  }
  const { userId, userName, messages, tier, isThinking, isVoice = false, sessionId, reportId, polish, onStream, onReasoning, onSegmentEnd, onToolStart, onToolEnd, onStepStart, onStepEnd, onQuotaWarn, onNotice, onSkillUsed } = input;

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

  // Retrieved memories change on every message, so they are NOT part of the system prompt: a
  // changing system prompt would invalidate the provider's prompt cache for the whole request.
  // They travel as `dynamicContext` and are attached to the last user message (see placeDynamicContext).
  let systemPrompt = isVoice
    ? buildKemmaVoicePrompt({ userId, tier, userName })
    : buildKemmaSystemPrompt({ userId, tier, userName });

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
  // The per-run tool context. `toolsFor`/`runTool` use this for availability checks (Drive
  // connected, admin role) and for executing the tool itself. P1-05 gives `signal` a real,
  // abortable value; P1-11 will populate `approvals`.
  const runId = `${sessionId ?? "s"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const toolCtx: ToolContext = {
    userId,
    sessionId,
    runId,
    tier,
    signal: input.signal ?? NEVER_ABORTS,
    emit: () => {},
    skillsEnabled: enabledSkills.length > 0,
    isSubAgent: !!input.isSubAgent,
  };

  // The ordinary registered tools (safe_files, web_search, browse, run_code, generate_file,
  // phone_scan, vps_files, drive_*, skill tools): allowedTools filtering, Drive auto-registration,
  // admin vps_files and skill-tool inclusion all live inside toolsFor now (see its docstring).
  const originalSpecs = await toolsFor(toolCtx, input.allowedTools);

  // MCP tools carry their own JSON Schema rather than a zod one, so they are merged into the wire
  // list here instead of being represented as a ToolSpec. Same per-run filter as built-in tools.
  let mcpDefs: OpenAiToolDef[] = [];
  if (!input.isSubAgent) {
    try {
      mcpDefs = (await getMcpRegistry().tools()).filter((t) => !input.allowedTools || input.allowedTools.includes(t.name));
    } catch { /* MCP is optional */ }
  }

  let toolSpecs = originalSpecs;
  let activeMcpDefs = mcpDefs;

  // A skill can only narrow the tool set. Recomputed from the original set each time a skill loads.
  const loadedSkillNarrowing = new Map<string, string[] | null>();
  const applySkillNarrowing = () => {
    const lists = [...loadedSkillNarrowing.values()];
    if (lists.length === 0 || lists.some((l) => l === null)) { toolSpecs = originalSpecs; activeMcpDefs = mcpDefs; return; }
    const allowed = new Set(lists.flatMap((l) => l as string[]));
    toolSpecs = originalSpecs.filter((t) => allowed.has(t.name) || (SKILL_TOOL_NAMES as readonly string[]).includes(t.name));
    activeMcpDefs = mcpDefs.filter((t) => allowed.has(t.name));
  };
  const wireTools = (): OpenAiToolDef[] => [...toOpenAiTools(toolSpecs), ...activeMcpDefs];
  const availableToolNames = (): Set<string> => new Set([...toolSpecs.map((t) => t.name), ...activeMcpDefs.map((t) => t.name)]);

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

  const streamToolTurns = flag("STREAM_TOOL_TURNS");
  const parallelTools = flag("PARALLEL_TOOLS");

  while (step < maxSteps) {
    if (input.signal?.aborted) {
      return {
        response: "",
        toolCalls: toolExecutions,
        isAgentic: toolExecutions.length >= 2,
        tokensUsed: totalTokens,
        modelsUsed: Array.from(new Set(modelsUsed)),
        stepsUsed: step,
        durationMs: Date.now() - startTime,
        sources: dedupeSources(collectedSources),
        isError: false,
        cancelled: true,
      };
    }
    step++;
    const route = selectRoute(input, currentMessages, step, maxSteps);
    modelsUsed.push(route.label);
    onStepStart?.(step, route.label);

    const offerTools = totalToolCallCount < maxToolCalls && step < maxSteps;
    const shouldStream = streamToolTurns ? !!onStream : (!!onStream && !offerTools);

    let llmResponse: Awaited<ReturnType<typeof callLLM>>;
    try {
      llmResponse = await callLLM({
        route,
        systemPrompt,
        dynamicContext: memories,
        cachePrefix: true,
        messages: currentMessages,
        tools: offerTools ? wireTools() : undefined,
        stream: shouldStream,
        onStream,
        onReasoning,
        onNotice,
        userId,
        sessionId,
        reportId,
        purpose: step === 1 ? "initial" : "follow-up",
        signal: input.signal,
      });
    } catch (err) {
      if (input.signal?.aborted) {
        return {
          response: "",
          toolCalls: toolExecutions,
          isAgentic: toolExecutions.length >= 2,
          tokensUsed: totalTokens,
          modelsUsed: Array.from(new Set(modelsUsed)),
          stepsUsed: step,
          durationMs: Date.now() - startTime,
          sources: dedupeSources(collectedSources),
          isError: false,
          cancelled: true,
        };
      }
      const message = err instanceof Error ? err.message : "Sutaeru hit an error";
      return makeErrorResponse(message, startTime);
    }

    totalTokens.input  += llmResponse.usage?.input  ?? 0;
    totalTokens.output += llmResponse.usage?.output ?? 0;
    totalTokens.total  += llmResponse.usage?.total  ?? 0;
    onStepEnd?.(step);

    if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
      if (input.signal?.aborted) {
        return {
          response: "",
          toolCalls: toolExecutions,
          isAgentic: toolExecutions.length >= 2,
          tokensUsed: totalTokens,
          modelsUsed: Array.from(new Set(modelsUsed)),
          stepsUsed: step,
          durationMs: Date.now() - startTime,
          sources: dedupeSources(collectedSources),
          isError: false,
          cancelled: true,
        };
      }
      if (streamToolTurns) {
        onSegmentEnd?.("narration");
      }
      currentMessages.push({ role: "assistant", content: llmResponse.content ?? null, tool_calls: llmResponse.toolCalls });

      interface PreparedCall {
        index: number;
        tc: ToolCall;
        parsedArgs: unknown;
        parallelSafe: boolean;
        budgetAllowed: boolean;
      }

      interface ExecutedCallOutcome {
        index: number;
        tc: ToolCall;
        parsedArgs: unknown;
        toolResult: unknown;
        toolDuration: number;
      }

      const preparedCalls: PreparedCall[] = [];
      for (let i = 0; i < llmResponse.toolCalls.length; i++) {
        const tc = llmResponse.toolCalls[i];
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch { parsedArgs = {}; }
        const spec = toolSpecs.find((s) => s.name === tc.function.name) ?? getToolSpec(tc.function.name);
        const parallelSafe = spec?.parallelSafe === true;

        if (totalToolCallCount < maxToolCalls) {
          totalToolCallCount++;
          preparedCalls.push({ index: i, tc, parsedArgs, parallelSafe, budgetAllowed: true });
        } else {
          preparedCalls.push({ index: i, tc, parsedArgs, parallelSafe, budgetAllowed: false });
        }
      }

      const executeCall = async (call: PreparedCall): Promise<ExecutedCallOutcome> => {
        const { tc, parsedArgs, budgetAllowed } = call;
        const callId = (streamToolTurns || parallelTools) ? (tc.id || `call_${call.index}`) : undefined;

        if (callId) {
          onToolStart?.(tc.function.name, parsedArgs, callId);
        } else {
          onToolStart?.(tc.function.name, parsedArgs);
        }

        if (!budgetAllowed) {
          const toolResult = { ok: false, code: "NOT_ALLOWED" as const, error: "Tool budget for this run is used up." };
          if (callId) {
            onToolEnd?.(tc.function.name, toolResult, 0, callId);
          } else {
            onToolEnd?.(tc.function.name, toolResult, 0);
          }
          return {
            index: call.index,
            tc,
            parsedArgs,
            toolResult,
            toolDuration: 0,
          };
        }

        const toolStart = Date.now();
        let toolResult: unknown;
        if (!availableToolNames().has(tc.function.name)) {
          toolResult = { success: false, error: `Tool ${tc.function.name} is not available in this run.`, code: "TOOL_NOT_ALLOWED" };
        } else {
          try {
            const outcome = await runTool(tc.function.name, parsedArgs, toolCtx);
            toolResult = outcome.ok ? outcome.data : { success: false, error: outcome.error, code: outcome.code };
          } catch (err) {
            toolResult = { error: `Tool ${tc.function.name} failed: ${(err as Error).message}` };
          }
        }
        const toolDuration = Date.now() - toolStart;
        if (callId) {
          onToolEnd?.(tc.function.name, toolResult, toolDuration, callId);
        } else {
          onToolEnd?.(tc.function.name, toolResult, toolDuration);
        }

        return {
          index: call.index,
          tc,
          parsedArgs,
          toolResult,
          toolDuration,
        };
      };

      if (input.signal?.aborted) {
        return {
          response: "",
          toolCalls: toolExecutions,
          isAgentic: toolExecutions.length >= 2,
          tokensUsed: totalTokens,
          modelsUsed: Array.from(new Set(modelsUsed)),
          stepsUsed: step,
          durationMs: Date.now() - startTime,
          sources: dedupeSources(collectedSources),
          isError: false,
          cancelled: true,
        };
      }

      let outcomes: ExecutedCallOutcome[];
      if (parallelTools) {
        const safeCalls = preparedCalls.filter((c) => c.parallelSafe);
        const otherCalls = preparedCalls.filter((c) => !c.parallelSafe);

        const limit = pLimit(getToolConcurrency());
        const safeOutcomes = await Promise.all(safeCalls.map((c) => limit(() => executeCall(c))));

        const otherOutcomes: ExecutedCallOutcome[] = [];
        for (const c of otherCalls) {
          otherOutcomes.push(await executeCall(c));
        }

        outcomes = [...safeOutcomes, ...otherOutcomes].sort((a, b) => a.index - b.index);
      } else {
        outcomes = [];
        for (const c of preparedCalls) {
          outcomes.push(await executeCall(c));
        }
      }

      for (const item of outcomes) {
        const { tc, parsedArgs, toolResult, toolDuration } = item;
        if (tc.function.name === "load_skill" && (toolResult as { success?: boolean })?.success) {
          const loaded = enabledSkills.find((sk) => sk.slug === (parsedArgs as { name?: string })?.name);
          if (loaded) {
            loadedSkillNarrowing.set(loaded.slug, loaded.allowedTools);
            applySkillNarrowing();
            onSkillUsed?.({ id: 0, name: loaded.slug });
          }
        }
        toolExecutions.push({ tool: tc.function.name, input: parsedArgs, output: toolResult, step, durationMs: toolDuration });
        const newSources = extractSources(tc.function.name, toolResult);
        if (newSources.length > 0) collectedSources.push(...newSources);
        const forModel = tc.function.name === "web_search" ? annotateSearchResult(toolResult, dedupeSources(collectedSources)) : toolResult;
        let toolMessageContent = JSON.stringify(forModel);
        if (flag("UNTRUSTED_FENCING") && isUntrustedTool(tc.function.name)) {
          const source = extractToolSource(tc.function.name, parsedArgs, toolResult);
          const detection = detectInjection(toolMessageContent);
          if (detection.injectionSuspected) {
            onNotice?.(`Suspected prompt injection detected in ${tc.function.name} output.`);
          }
          toolMessageContent = wrapUntrustedContent({
            tool: tc.function.name,
            source,
            content: toolMessageContent,
            injectionSuspected: detection.injectionSuspected,
          });
        }
        currentMessages.push({ role: "tool", content: toolMessageContent, tool_call_id: tc.id, name: tc.function.name });
      }

      if (input.signal?.aborted) {
        return {
          response: "",
          toolCalls: toolExecutions,
          isAgentic: toolExecutions.length >= 2,
          tokensUsed: totalTokens,
          modelsUsed: Array.from(new Set(modelsUsed)),
          stepsUsed: step,
          durationMs: Date.now() - startTime,
          sources: dedupeSources(collectedSources),
          isError: false,
          cancelled: true,
        };
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
    // Calls that offered tools are not streamed, so the route would never see this text: emit it now.
    if (!streamToolTurns && onStream && offerTools && llmResponse.content) onStream(llmResponse.content);
    if (streamToolTurns) {
      onSegmentEnd?.("answer");
    }

    // Deduplicate sources collected during tool use
    let sources = dedupeSources(collectedSources);

    // Optional citation verification pass (only for research-style runs with sources)
    if (sources.length > 0 && isAgentic) {
      if (input.signal?.aborted) {
        return {
          response: "",
          toolCalls: toolExecutions,
          isAgentic: toolExecutions.length >= 2,
          tokensUsed: totalTokens,
          modelsUsed: Array.from(new Set(modelsUsed)),
          stepsUsed: step,
          durationMs: Date.now() - startTime,
          sources: dedupeSources(collectedSources),
          isError: false,
          cancelled: true,
        };
      }
      try {
        const verifyRouteConfig = verifyRoute();
        if (routeHasAuth(verifyRouteConfig)) {
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
              signal: input.signal,
            });
            return res.content ?? "[]";
          });
        }
      } catch (err) {
        if (input.signal?.aborted) {
          return {
            response: "",
            toolCalls: toolExecutions,
            isAgentic: toolExecutions.length >= 2,
            tokensUsed: totalTokens,
            modelsUsed: Array.from(new Set(modelsUsed)),
            stepsUsed: step,
            durationMs: Date.now() - startTime,
            sources: dedupeSources(collectedSources),
            isError: false,
            cancelled: true,
          };
        }
        // Verification is best-effort; don't fail the answer.
      }
    }

    if (input.signal?.aborted) {
      return {
        response: "",
        toolCalls: toolExecutions,
        isAgentic: toolExecutions.length >= 2,
        tokensUsed: totalTokens,
        modelsUsed: Array.from(new Set(modelsUsed)),
        stepsUsed: step,
        durationMs: Date.now() - startTime,
        sources: dedupeSources(collectedSources),
        isError: false,
        cancelled: true,
      };
    }

    // Append numbered source cards
    if (sources.length > 0) {
      const kept = keepCitedSources(finalContent, sources);
      sources = kept.sources;
      const cited = appendCitations(kept.text, sources);
      finalContent = cited.text;
    }

    if (polish) {
      if (input.signal?.aborted) {
        return {
          response: "",
          toolCalls: toolExecutions,
          isAgentic: toolExecutions.length >= 2,
          tokensUsed: totalTokens,
          modelsUsed: Array.from(new Set(modelsUsed)),
          stepsUsed: step,
          durationMs: Date.now() - startTime,
          sources: dedupeSources(collectedSources),
          isError: false,
          cancelled: true,
        };
      }
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
            signal: input.signal,
          });
          finalContent = polishResponse.content ?? finalContent;
          totalTokens.input += polishResponse.usage?.input ?? 0;
          totalTokens.output += polishResponse.usage?.output ?? 0;
          totalTokens.total += polishResponse.usage?.total ?? 0;
        }
      } catch (err) {
        if (input.signal?.aborted) {
          return {
            response: "",
            toolCalls: toolExecutions,
            isAgentic: toolExecutions.length >= 2,
            tokensUsed: totalTokens,
            modelsUsed: Array.from(new Set(modelsUsed)),
            stepsUsed: step,
            durationMs: Date.now() - startTime,
            sources: dedupeSources(collectedSources),
            isError: false,
            cancelled: true,
          };
        }
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
  if (input.signal?.aborted) {
    return {
      response: "",
      toolCalls: [],
      isAgentic: false,
      tokensUsed: { input: 0, output: 0, total: 0 },
      modelsUsed: [],
      stepsUsed: 0,
      durationMs: Date.now() - startTime,
      sources: [],
      isError: false,
      cancelled: true,
    };
  }
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
    const userText = lastUserMessage?.content || "Describe this image.";
    let text: string;
    if (route.authKind === "vertex") {
      const body = vertexGenerateContentBody({
        texts: [systemPrompt, userText],
        image: { data: imageData, mimeType },
      });
      text = await vertexGenerateContentText(route.model, body);
    } else {
      const genAI = new GoogleGenerativeAI(route.apiKey);
      const model = genAI.getGenerativeModel({ model: route.model });
      const imagePart = { inlineData: { data: imageData, mimeType } };
      const result = await model.generateContent([systemPrompt, userText, imagePart]);
      const response = await result.response;
      text = response.text();
    }

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
    if (input.signal?.aborted || (err instanceof Error && (err.name === "AbortError" || err.message === "Aborted"))) {
      return {
        response: "",
        toolCalls: [],
        isAgentic: false,
        tokensUsed: { input: 0, output: 0, total: 0 },
        modelsUsed: [],
        stepsUsed: 0,
        durationMs: Date.now() - startTime,
        sources: [],
        isError: false,
        cancelled: true,
      };
    }
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
    const defaultPrompt = `Extract all text from this document. If it's a receipt/invoice, identify:
- Vendor name
- Date
- Total amount
- Currency
- Items purchased

Return the extracted text in a structured format.`;

    let text: string;
    if (route.authKind === "vertex") {
      const body = vertexGenerateContentBody({
        texts: [prompt || defaultPrompt],
        image: { data: imageData, mimeType },
      });
      text = await vertexGenerateContentText(route.model, body);
    } else {
      const genAI = new GoogleGenerativeAI(route.apiKey);
      const model = genAI.getGenerativeModel({ model: route.model });
      const imagePart = { inlineData: { data: imageData, mimeType } };
      const result = await model.generateContent([prompt || defaultPrompt, imagePart]);
      const response = await result.response;
      text = response.text();
    }

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
  /** Per-message context (retrieved memories). Kept out of the system prompt so the cached prefix stays stable. */
  dynamicContext?: string;
  /** The prefix of this request will be re-read soon (agent loop, chat turn): worth explicit cache markers. */
  cachePrefix?: boolean;
  messages: KemmaMessage[];
  tools?: any[];
  stream: boolean;
  onStream?: (chunk: string) => void;
  onReasoning?: (delta: string) => void;
  onNotice?: (message: string) => void;
  userId: number;
  sessionId?: string;
  reportId?: string;
  purpose?: string;
  signal?: AbortSignal;
}

interface LLMResult { content: string | null; toolCalls?: ToolCall[]; usage?: TokenUsage }

async function callLLM(input: CallLLMOptions): Promise<LLMResult> {
  const { route, systemPrompt, dynamicContext, cachePrefix, messages, tools, stream, onStream, onReasoning, onNotice, userId, sessionId, reportId, purpose, signal } = input;

  if (signal?.aborted) {
    throw signal.reason ?? new Error("Aborted");
  }

  const cap = await checkSpendCap(route.provider);
  if (!cap.allowed) {
    throw new Error(cap.reason);
  }

  const errors: string[] = [];
  // The chain includes KEMMA_MODEL_PRO_FALLBACK right after the pro slot (see callChainFor).
  const routesToTry = callChainFor(route);

  let streamedChars = 0;
  const wrappedOnStream = onStream
    ? (chunk: string) => {
        streamedChars += chunk.length;
        onStream(chunk);
      }
    : undefined;

  for (let i = 0; i < routesToTry.length; i++) {
    if (signal?.aborted) {
      throw signal.reason ?? new Error("Aborted");
    }

    const tryRoute = routesToTry[i];

    if (i > 0) {
      // Which model answers is not shown to users: the notice stays generic.
      onNotice?.("Primary model unavailable; trying a backup...");
    }

    try {
      const result = await callSingleLLM({ route: tryRoute, systemPrompt, dynamicContext, cachePrefix, messages, tools, stream, onStream: wrappedOnStream, onReasoning, signal });

      await logUsage({
        userId,
        sessionId,
        reportId,
        provider: tryRoute.provider,
        model: tryRoute.model,
        inputTokens: result.usage?.input ?? 0,
        outputTokens: result.usage?.output ?? 0,
        cachedInputTokens: result.usage?.cachedInput ?? 0,
        purpose: purpose ?? "chat",
      });

      if (i > 0) {
        onNotice?.("Answer produced by a backup model.");
      }

      return result;
    } catch (err) {
      const isAborted = signal?.aborted || (err instanceof Error && (err.name === "AbortError" || err.message === "Aborted" || err.message.includes("abort")));
      if (signal?.aborted || isAborted) {
        // Usage on abort: log a usage row for a partially streamed call. Use provider usage if received; otherwise estimate output tokens as ceil(chars/4) and set purpose to "<purpose>:aborted".
        const providerUsage = (err && typeof err === "object" ? (err as any).usage : undefined) as TokenUsage | undefined;
        if (streamedChars > 0 || providerUsage) {
          try {
            await logUsage({
              userId,
              sessionId,
              reportId,
              provider: tryRoute.provider,
              model: tryRoute.model,
              inputTokens: providerUsage?.input ?? 0,
              outputTokens: providerUsage?.output ?? Math.ceil(streamedChars / 4),
              cachedInputTokens: providerUsage?.cachedInput ?? 0,
              purpose: `${purpose ?? "chat"}:aborted`,
            });
          } catch {
            // non-fatal
          }
        }
        // Fallback chains stop on abort; they don't try the next model.
        throw signal?.reason ?? (err instanceof Error ? err : new Error("Aborted"));
      }

      const message = err instanceof Error ? err.message : String(err);
      // The per-route detail (with model labels) goes to the server log only;
      // the user sees the upstream reasons, which say what to do about it.
      console.error(`[kemma] ${tryRoute.label} attempt failed: ${message}`);
      errors.push(message);
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
  dynamicContext?: string;
  cachePrefix?: boolean;
  messages: KemmaMessage[];
  tools?: any[];
  stream: boolean;
  onStream?: (chunk: string) => void;
  onReasoning?: (delta: string) => void;
  signal?: AbortSignal;
}

// Providers that rejected stream_options once; not sent again for the life of the process.
const streamOptionsRejected = new Set<ModelProvider>();

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

// Shared non-streaming completion parse: final message text, tool calls, and usage.
function parseCompletionJson(data: any): LLMResult {
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
    // parseUsage folds Vertex reasoning tokens into output and reads cached prompt tokens.
    usage: parseUsage(data.usage),
  };
}

/**
 * Gemini flash models spend several seconds "thinking" before answering, and far longer when tools are offered
 * (measured: 3 to 20 s for a two sentence answer). Chat does not need deep reasoning, so ask for low effort.
 * KEMMA_REASONING_EFFORT: low (default), medium, high, or off to send nothing. Pro models are never limited.
 */
export function reasoningEffortFor(route: { provider: string; model: string }, env: string | undefined = process.env.KEMMA_REASONING_EFFORT): "low" | "medium" | "high" | undefined {
  if (route.provider !== "gemini" || /pro/i.test(route.model)) return undefined;
  const v = (env ?? "low").trim().toLowerCase();
  if (v === "off" || v === "") return undefined;
  return v === "medium" || v === "high" ? v : "low";
}

async function callSingleLLM(input: SingleLLMOptions): Promise<LLMResult> {
  const { route, systemPrompt, dynamicContext, cachePrefix, messages, tools, stream, onStream, onReasoning, signal } = input;

  if (!routeHasAuth(route)) {
    throw new Error(`${route.provider} API key is not configured.`);
  }

  // OpenAI-compatible path (Qwen, Perplexity, Gemini via AI Studio or Vertex)
  const target = await resolveRouteAuth(route);
  const wantStream = stream && !!onStream;

  const buildBody = (opts: { cacheMarkers: boolean; streamUsage: boolean }) => {
    let wire: any[] = [
      { role: "system", content: systemPrompt },
      ...placeDynamicContext(messages.filter((m) => m.role !== "system"), dynamicContext).map((m) => adaptToolCallsForProvider(m, route.provider)),
    ];
    if (opts.cacheMarkers) wire = applyQwenCacheMarkers(wire);
    return {
      model: target.model,
      messages: wire,
      // Venice: skip its own system prompt so the model is not re-restricted; tools only when VENICE_TOOLS=1
      // (not every Venice model supports function calling).
      ...(route.provider === "venice" ? { venice_parameters: { include_venice_system_prompt: false } } : {}),
      tools: tools && (route.provider !== "venice" || process.env.VENICE_TOOLS === "1") ? tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } })) : undefined,
      tool_choice: tools && (route.provider !== "venice" || process.env.VENICE_TOOLS === "1") ? "auto" : undefined,
      stream: wantStream,
      // Ask for a final usage chunk on streams so streamed answers are metered (they were logged as 0 tokens before).
      ...(wantStream && opts.streamUsage ? { stream_options: { include_usage: true } } : {}),
      max_tokens: 4096,
      reasoning_effort: reasoningEffortFor(route),
    };
  };

  const send = (opts: { cacheMarkers: boolean; streamUsage: boolean }) =>
    fetchWithRetry(`${target.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${target.auth}` },
      body: JSON.stringify(buildBody(opts)),
      signal,
    });

  let cacheMarkers = !!cachePrefix && usesExplicitCacheMarkers(route.provider);
  let streamUsage = wantStream && supportsStreamUsageOption(route.provider) && !streamOptionsRejected.has(route.provider);

  // Transient failures (429, 5xx, network) are retried inside fetchWithRetry on the same model before
  // the caller falls through to the next model. A 400 on a request that carried optional fields we
  // added (cache markers, stream_options) is retried once without them; if that succeeds the field is
  // switched off for this process, so one unsupported option can never cost a model fallback.
  let res = await send({ cacheMarkers, streamUsage });
  if (!res.ok && res.status === 400 && (cacheMarkers || streamUsage)) {
    const firstError = await res.text();
    const retry = await send({ cacheMarkers: false, streamUsage: false });
    if (retry.ok) {
      const blamesCache = isCacheMarkerRejection(400, firstError);
      const blamesStream = isStreamOptionsRejection(400, firstError);
      if (cacheMarkers && (blamesCache || !blamesStream)) disableQwenExplicitCache(`${route.label} rejected a request with cache markers`);
      if (streamUsage && (blamesStream || !blamesCache)) streamOptionsRejected.add(route.provider);
      res = retry;
    } else {
      // The stripped request failed too, so the options were not the cause: report the real error.
      throw new Error(`API error ${retry.status}: ${await retry.text()}`);
    }
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  if (stream && onStream) {
    const isReasoningOff = (process.env.KEMMA_REASONING_EFFORT ?? "").trim().toLowerCase() === "off";
    const resStream = await readChatStream(res, {
      onText: onStream,
      onReasoning: isReasoningOff ? undefined : onReasoning,
      signal,
    });
    if (!flag("STREAM_TOOL_TURNS")) {
      return {
        ...resStream,
        toolCalls: undefined,
      };
    }
    return resStream;
  }

  if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
  return parseCompletionJson(await res.json());
}

function makeErrorResponse(message: string, startTime: number): EngineOutput {
  return { response: message, toolCalls: [], isAgentic: false, tokensUsed: { input: 0, output: 0, total: 0 }, modelsUsed: [], stepsUsed: 0, durationMs: Date.now() - startTime, sources: [], isError: true };
}
