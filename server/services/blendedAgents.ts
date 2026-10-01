// ============================================================================
// BLENDED AGENTS SERVICE — Qwen + Gemini
// ============================================================================

import { chatRoute, plannerRoute, resolveRouteAuth, routeHasAuth } from '../core/kemmaRouter';
import { vertexEnabled, vertexGenerateContentBody, vertexGenerateContentText } from '../core/vertexAuth';

interface AgentConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  specialties: string[];
  latency: number;
}

interface AgentResponse {
  content: string;
  model: string;
  confidence: number;
  latency: number;
}

interface BlendedResponse {
  content: string;
  sources: AgentResponse[];
  primaryModel: string;
  blended: boolean;
}

// Agent configurations. Static fields are display snapshots; requests
// re-resolve credentials at call time (Vertex-backed slots carry no static key).
const qwenRoute = chatRoute();
const geminiRoute = plannerRoute();

const AI_STUDIO_BASE = "https://generativelanguage.googleapis.com/v1beta";

const AGENTS: AgentConfig[] = [
  {
    id: 'qwen',
    name: 'Qwen',
    apiKey: qwenRoute.apiKey,
    baseUrl: qwenRoute.baseUrl,
    model: qwenRoute.model,
    specialties: ['coding', 'analysis', 'reasoning', 'chinese', 'long-context', 'creative-writing'],
    latency: 700,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    apiKey: process.env.GEMINI_API_KEY || '',
    baseUrl: AI_STUDIO_BASE,
    model: geminiRoute.model,
    specialties: ['multimodal', 'factual', 'research', 'summarization', 'speed'],
    latency: 500,
  },
];

// Query type detection
export function detectQueryType(query: string): string {
  const lower = query.toLowerCase();
  
  if (/\b(code|function|bug|error|debug|programming|javascript|python|react|api|typescript)\b/.test(lower)) {
    return 'coding';
  }
  if (/\b(analyze|analysis|data|statistics|compare|evaluate|metrics|performance)\b/.test(lower)) {
    return 'analysis';
  }
  if (/\b(write|story|poem|creative|imagine|design|draft|compose)\b/.test(lower)) {
    return 'creative-writing';
  }
  if (/\b(explain|how|why|what is|teach|learn|understand|concept)\b/.test(lower)) {
    return 'reasoning';
  }
  if (/\b(long|document|paper|article|book|context|summary of)\b/.test(lower)) {
    return 'long-context';
  }
  if (/\b(research|find|search|source|reference|citation|fact)\b/.test(lower)) {
    return 'research';
  }
  if (/\b(image|picture|photo|visual|draw|generate image|create image)\b/.test(lower)) {
    return 'multimodal';
  }
  if (/\b(call|phone|voice|speak|talk|conversation|kemma)\b/.test(lower)) {
    return 'voice';
  }
  
  return 'general';
}

// Select best agent for query type
export function selectBestAgent(queryType: string, activeAgents: AgentConfig[] = AGENTS): AgentConfig {
  for (const agent of activeAgents) {
    if (agent.specialties.includes(queryType)) {
      return agent;
    }
  }
  
  // Default to fastest active agent
  return [...activeAgents].sort((a, b) => a.latency - b.latency)[0] || AGENTS[0];
}

// Call the OpenAI-compatible endpoint of the chat slot. Credentials and URL are
// resolved per call: a Vertex-backed chat slot has an empty apiKey and a stale
// baseUrl on the RouteConfig, so resolveRouteAuth() is mandatory here.
async function callQwen(message: string, _config: AgentConfig): Promise<AgentResponse> {
  const startTime = Date.now();
  const target = await resolveRouteAuth(chatRoute());

  const response = await fetch(`${target.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${target.auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: target.model,
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Qwen API error: ${await response.text()}`);
  }

  const data = await response.json();
  
  return {
    content: data.choices[0].message.content,
    model: 'Qwen',
    confidence: 0.92,
    latency: Date.now() - startTime,
  };
}

// Call Gemini (AI Studio key in the query string, or native Vertex generateContent with a bearer token)
async function callGemini(message: string, _config: AgentConfig): Promise<AgentResponse> {
  const startTime = Date.now();
  const route = plannerRoute();

  if (vertexEnabled()) {
    const body = vertexGenerateContentBody({
      texts: [message],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    });
    const content = await vertexGenerateContentText(route.model, body);
    if (!content) {
      throw new Error('Vertex AI Gemini returned no content');
    }
    return {
      content,
      model: 'Gemini',
      confidence: 0.90,
      latency: Date.now() - startTime,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('Gemini API key is not configured');
  }

  const response = await fetch(
    `${AI_STUDIO_BASE}/models/${route.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: message },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${await response.text()}`);
  }

  const data = await response.json();
  
  return {
    content: data.candidates[0].content.parts[0].text,
    model: 'Gemini',
    confidence: 0.90,
    latency: Date.now() - startTime,
  };
}

// Route to correct agent
async function callAgent(agent: AgentConfig, message: string): Promise<AgentResponse> {
  switch (agent.id) {
    case 'qwen':
      return callQwen(message, agent);
    case 'gemini':
      return callGemini(message, agent);
    default:
      throw new Error(`Unknown agent: ${agent.id}`);
  }
}

// Blend multiple responses
async function blendResponses(responses: AgentResponse[], query: string): Promise<string> {
  // For now, select the best response based on confidence
  // In production, you could use another LLM call to synthesize
  const best = responses.reduce((best, current) => 
    current.confidence > best.confidence ? current : best
  );
  
  return best.content;
}

// Main send message function
export async function sendMessage(
  message: string,
  options: {
    blend?: boolean;
    preferredModel?: string;
    activeAgentIds?: string[];
  } = {}
): Promise<BlendedResponse> {
  const queryType = detectQueryType(message);
  const blend = options.blend ?? true;
  
  // Filter active agents
  const activeAgents = options.activeAgentIds 
    ? AGENTS.filter(a => options.activeAgentIds?.includes(a.id))
    : AGENTS;
  
  if (blend) {
    // Ensemble mode - call multiple agents
    const primaryAgent = options.preferredModel
      ? activeAgents.find(a => a.id === options.preferredModel) || selectBestAgent(queryType, activeAgents)
      : selectBestAgent(queryType, activeAgents);
    
    const secondaryAgents = activeAgents
      .filter(a => a.id !== primaryAgent.id)
      .slice(0, 2);
    
    const [primary, ...secondaries] = await Promise.all([
      callAgent(primaryAgent, message),
      ...secondaryAgents.map(agent => callAgent(agent, message)),
    ]);
    
    const blendedContent = await blendResponses([primary, ...secondaries], message);
    
    return {
      content: blendedContent,
      sources: [primary, ...secondaries],
      primaryModel: primaryAgent.name,
      blended: true,
    };
  } else {
    // Smart routing - single best agent
    const agent = options.preferredModel
      ? activeAgents.find(a => a.id === options.preferredModel) || selectBestAgent(queryType, activeAgents)
      : selectBestAgent(queryType, activeAgents);
    
    const response = await callAgent(agent, message);
    
    return {
      content: response.content,
      sources: [response],
      primaryModel: agent.name,
      blended: false,
    };
  }
}

// Get agent status
export function getAgentStatus() {
  return AGENTS.map(agent => ({
    id: agent.id,
    name: agent.name,
    specialties: agent.specialties,
    latency: agent.latency,
    isAvailable: agent.id === 'gemini'
      ? vertexEnabled() || !!(process.env.GEMINI_API_KEY || '').trim()
      : routeHasAuth(chatRoute()),
  }));
}

export { AGENTS };
export type { AgentConfig, AgentResponse, BlendedResponse };
