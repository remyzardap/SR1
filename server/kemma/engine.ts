import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildKemmaSystemPrompt, buildKemmaVoicePrompt } from "./personality";
import { executeToolCall } from "./executor";
import { kemmaRoute, detectComplexity, MAX_STEPS, type Tier, geminiVisionRoute } from "../core/kemmaRouter";
import { checkQuota, incrementQuota } from "../core/quotaCheck";
import { KEMMA_TOOLS } from "./tools";
import { getMemoriesContext } from "./memory";

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
}

export interface ToolExecution {
  tool: string; input: unknown; output: unknown; step: number; durationMs: number;
}

export interface EngineInput {
  userId: number; userName?: string; messages: KemmaMessage[];
  tier: Tier; isThinking: boolean; isVoice?: boolean; hasByos?: boolean; sessionId?: string;
  onStream?: (chunk: string) => void;
  onToolStart?: (tool: string, input: unknown) => void;
  onToolEnd?: (tool: string, result: unknown, durationMs: number) => void;
  onStepStart?: (step: number, model: string) => void;
  onStepEnd?: (step: number) => void;
  onQuotaWarn?: (message: string) => void;
}

export interface VisionEngineInput extends EngineInput {
  imageData: string;  // Base64 encoded image
  mimeType: string;   // e.g., "image/jpeg", "image/png"
}

export interface EngineOutput {
  response: string; toolCalls: ToolExecution[]; isAgentic: boolean;
  tokensUsed: { input: number; output: number; total: number };
  modelsUsed: string[]; stepsUsed: number; durationMs: number;
}

const MAX_TOOL_CALLS: Record<Tier, number> = { free: 2, trial: 20, pro: 20, max: 50 };

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TEXT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export async function kemmaExecute(input: EngineInput): Promise<EngineOutput> {
  const startTime = Date.now();
  const { userId, userName, messages, tier, isThinking, isVoice = false, onStream, onToolStart, onToolEnd, onStepStart, onStepEnd, onQuotaWarn } = input;

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

  const systemPrompt = isVoice
    ? buildKemmaVoicePrompt({ userId, tier, memories, userName })
    : buildKemmaSystemPrompt({ userId, tier, memories, userName });

  let currentMessages: KemmaMessage[] = messages.filter((m) => m.role !== "system");

  const maxSteps = MAX_STEPS[tier];
  const maxToolCalls = MAX_TOOL_CALLS[tier];
  const toolExecutions: ToolExecution[] = [];
  const modelsUsed: string[] = [];
  let totalTokens = { input: 0, output: 0, total: 0 };
  let step = 0;
  let totalToolCallCount = 0;

  while (step < maxSteps) {
    step++;
    const complexity = detectComplexity(currentMessages.map((m) => ({ role: m.role, content: m.content ?? "" })));
    const route = kemmaRoute({ tier, isThinking: isThinking && step === 1, isAgentic: toolExecutions.length >= 2, taskComplexity: complexity, step, maxSteps });
    modelsUsed.push(route.label);
    onStepStart?.(step, route.label);

    const offerTools = totalToolCallCount < maxToolCalls && step < maxSteps;

    let llmResponse: any;
    try {
      llmResponse = await callLLM({ route, systemPrompt, messages: currentMessages, tools: offerTools ? KEMMA_TOOLS : undefined, stream: !!onStream && !offerTools, onStream });
    } catch (err) {
      return makeErrorResponse("Kemma hit an error — please try again", startTime);
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
        try { toolResult = await executeToolCall(userId, tc.function.name, parsedArgs); }
        catch (err) { toolResult = { error: `Tool ${tc.function.name} failed: ${(err as Error).message}` }; }
        const toolDuration = Date.now() - toolStart;
        onToolEnd?.(tc.function.name, toolResult, toolDuration);
        toolExecutions.push({ tool: tc.function.name, input: parsedArgs, output: toolResult, step, durationMs: toolDuration });
        currentMessages.push({ role: "tool", content: JSON.stringify(toolResult), tool_call_id: tc.id, name: tc.function.name });
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

    return { response: llmResponse.content ?? "Done.", toolCalls: toolExecutions, isAgentic, tokensUsed: totalTokens, modelsUsed: Array.from(new Set(modelsUsed)), stepsUsed: step, durationMs: Date.now() - startTime };
  }

  await incrementQuota(userId, "message");
  if (toolExecutions.length >= 2) await incrementQuota(userId, "agentic_task");
  return { response: "I have completed the available steps. Let me know if you need anything else.", toolCalls: toolExecutions, isAgentic: true, tokensUsed: totalTokens, modelsUsed: Array.from(new Set(modelsUsed)), stepsUsed: maxSteps, durationMs: Date.now() - startTime };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISION/MULTIMODAL ENGINE (Gemini Flash)
// ═══════════════════════════════════════════════════════════════════════════════

export async function kemmaVisionExecute(input: VisionEngineInput): Promise<EngineOutput> {
  const startTime = Date.now();
  const { userId, userName, messages, tier, imageData, mimeType, onStream } = input;

  const msgQuota = await checkQuota(userId, "message");
  if (!msgQuota.allowed) return makeErrorResponse(msgQuota.reason ?? "Daily message limit reached", startTime);

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  let memories: string | undefined;
  try {
    if (lastUserMessage?.content) memories = await getMemoriesContext(userId, lastUserMessage.content as string);
  } catch { /* non-fatal */ }

  const systemPrompt = buildKemmaSystemPrompt({ userId, tier, memories, userName });
  
  // Use Gemini Flash for vision
  const route = geminiVisionRoute();
  
  try {
    const genAI = new GoogleGenerativeAI(route.apiKey);
    const model = genAI.getGenerativeModel({ model: route.model });

    // Prepare the prompt
    const userText = lastUserMessage?.content || "Describe this image.";
    
    // Create the content parts
    const imagePart = {
      inlineData: {
        data: imageData,
        mimeType: mimeType,
      },
    };

    const result = await model.generateContent([systemPrompt, userText, imagePart]);
    const response = await result.response;
    const text = response.text();

    await incrementQuota(userId, "message");

    return {
      response: text,
      toolCalls: [],
      isAgentic: false,
      tokensUsed: { input: 0, output: 0, total: 0 }, // Gemini doesn't return token counts in same format
      modelsUsed: [route.label],
      stepsUsed: 1,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error("[kemmaVisionExecute] Error:", err);
    return makeErrorResponse("I couldn't analyze that image. Please try again.", startTime);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT SCAN ENGINE (Gemini Flash)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocumentScanInput {
  userId: number;
  userName?: string;
  tier: Tier;
  imageData: string;     // Base64 encoded document image
  mimeType: string;      // e.g., "image/jpeg", "application/pdf"
  prompt?: string;       // Optional custom prompt
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

  const route = geminiVisionRoute();
  
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

    const imagePart = {
      inlineData: {
        data: imageData,
        mimeType: mimeType,
      },
    };

    const result = await model.generateContent([prompt || defaultPrompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    await incrementQuota(userId, "message");

    return {
      text,
      modelsUsed: [route.label],
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error("[kemmaDocumentScan] Error:", err);
    throw new Error("Failed to scan document. Please try again.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LLM CALLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function callLLM(input: any): Promise<any> {
  const { route, systemPrompt, messages, tools, stream, onStream } = input;

  if (route.provider === "anthropic") {
    const client = new Anthropic({ apiKey: route.apiKey });
    const anthropicMessages = messages.filter((m: any) => m.role !== "system").map((m: any) => {
      if (m.role === "tool") return { role: "user" as const, content: [{ type: "tool_result" as const, tool_use_id: m.tool_call_id!, content: m.content ?? "" }] };
      if (m.role === "assistant" && m.tool_calls) return { role: "assistant" as const, content: [...(m.content ? [{ type: "text" as const, text: m.content }] : []), ...m.tool_calls.map((tc: any) => ({ type: "tool_use" as const, id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments || "{}") }))] };
      return { role: m.role as "user" | "assistant", content: m.content ?? "" };
    });
    const anthropicTools = tools ? tools.map((t: any) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })) : undefined;

    if (stream && onStream) {
      let fullContent = "";
      const streamResponse = await client.messages.stream({ model: route.model, max_tokens: 4096, system: systemPrompt, messages: anthropicMessages, tools: anthropicTools });
      for await (const chunk of streamResponse) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") { fullContent += chunk.delta.text; onStream(chunk.delta.text); }
      }
      const final = await streamResponse.finalMessage();
      return { content: fullContent, toolCalls: undefined, usage: { input: final.usage.input_tokens, output: final.usage.output_tokens, total: final.usage.input_tokens + final.usage.output_tokens } };
    }

    const response = await client.messages.create({ model: route.model, max_tokens: 4096, system: systemPrompt, messages: anthropicMessages, tools: anthropicTools });
    const toolCalls = response.content.filter((b) => b.type === "tool_use").map((b: any) => ({ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input) } }));
    const textContent = response.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
    return { content: textContent || null, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens, total: response.usage.input_tokens + response.usage.output_tokens } };
  }

  // Default: OpenAI-compatible API (NVIDIA, Kimi, etc.)
  const body = { model: route.model, messages: [{ role: "system", content: systemPrompt }, ...messages.filter((m: any) => m.role !== "system")], tools, tool_choice: tools ? "auto" : undefined, stream: stream && !!onStream, max_tokens: 4096 };
  const res = await fetch(`${route.baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${route.apiKey}` }, body: JSON.stringify(body) });
  if (!res.ok) { const err = await res.text(); throw new Error(`API error ${res.status}: ${err}`); }

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
  const toolCalls = (choice?.message?.tool_calls ?? []).map((tc: any) => ({ id: tc.id, type: "function" as const, function: { name: tc.function.name, arguments: tc.function.arguments } }));
  return { content: choice?.message?.content ?? null, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0, total: data.usage?.total_tokens ?? 0 } };
}

function makeErrorResponse(message: string, startTime: number): EngineOutput {
  return { response: message, toolCalls: [], isAgentic: false, tokensUsed: { input: 0, output: 0, total: 0 }, modelsUsed: [], stepsUsed: 0, durationMs: Date.now() - startTime };
}
