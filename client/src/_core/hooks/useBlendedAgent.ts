import { useState, useCallback } from 'react';

export interface AgentResponse {
  content: string;
  model: string;
  confidence: number;
  latency: number;
}

export interface BlendedResponse {
  content: string;
  sources: AgentResponse[];
  primaryModel: string;
  blended: boolean;
}

interface Agent {
  id: string;
  name: string;
  provider: 'kimi' | 'anthropic' | 'google';
  status: 'active' | 'standby' | 'offline';
  specialties: string[];
  latency: number;
}

const AGENTS: Agent[] = [
  {
    id: 'kimi',
    name: 'Kimi',
    provider: 'kimi',
    status: 'active',
    specialties: ['coding', 'analysis', 'reasoning', 'chinese', 'long-context'],
    latency: 700,
  },
  {
    id: 'claude',
    name: 'Claude',
    provider: 'anthropic',
    status: 'active',
    specialties: ['long-context', 'nuanced-understanding', 'safety', 'instruction-following', 'creative-writing'],
    latency: 800,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    provider: 'google',
    status: 'active',
    specialties: ['multimodal', 'factual', 'research', 'summarization', 'speed'],
    latency: 500,
  },
];

// Detect query type for intelligent routing
function detectQueryType(query: string): string {
  const lower = query.toLowerCase();
  
  if (/\b(code|function|bug|error|debug|programming|javascript|python|react|api)\b/.test(lower)) {
    return 'coding';
  }
  if (/\b(analyze|analysis|data|statistics|compare|evaluate)\b/.test(lower)) {
    return 'analysis';
  }
  if (/\b(write|story|poem|creative|imagine|design)\b/.test(lower)) {
    return 'creative-writing';
  }
  if (/\b(explain|how|why|what is|teach|learn|understand)\b/.test(lower)) {
    return 'reasoning';
  }
  if (/\b(long|document|paper|article|book|context)\b/.test(lower)) {
    return 'long-context';
  }
  if (/\b(research|find|search|source|reference|citation)\b/.test(lower)) {
    return 'research';
  }
  if (/\b(image|picture|photo|visual|draw|generate image)\b/.test(lower)) {
    return 'multimodal';
  }
  
  return 'general';
}

// Select best agent for query type
function selectBestAgent(queryType: string): Agent {
  const activeAgents = AGENTS.filter(a => a.status === 'active');
  
  // Find agent with matching specialty
  for (const agent of activeAgents) {
    if (agent.specialties.includes(queryType)) {
      return agent;
    }
  }
  
  // Default to fastest active agent
  return activeAgents.sort((a, b) => a.latency - b.latency)[0] || AGENTS[0];
}

// Simulate calling an agent (replace with actual API calls)
async function callAgent(agent: Agent, message: string): Promise<AgentResponse> {
  const startTime = Date.now();
  
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, agent.latency));
  
  // This would be your actual API integration
  // const response = await fetch(`/api/agents/${agent.id}/chat`, {...})
  
  return {
    content: `[${agent.name}] Processing: ${message}`,
    model: agent.name,
    confidence: 0.92,
    latency: Date.now() - startTime,
  };
}

export function useBlendedAgent() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAgents, setActiveAgents] = useState<Agent[]>(AGENTS);
  const [blendMode, setBlendMode] = useState<'smart' | 'ensemble' | 'fastest'>('smart');

  const sendMessage = useCallback(async (
    message: string,
    options?: { blend?: boolean; preferredModel?: string }
  ): Promise<BlendedResponse> => {
    setIsProcessing(true);
    
    try {
      const queryType = detectQueryType(message);
      const blend = options?.blend ?? true;
      
      if (blend && blendMode === 'ensemble') {
        // Call multiple agents and blend responses
        const primaryAgent = selectBestAgent(queryType);
        const secondaryAgents = activeAgents
          .filter(a => a.id !== primaryAgent.id && a.status === 'active')
          .slice(0, 2);
        
        const [primary, ...secondaries] = await Promise.all([
          callAgent(primaryAgent, message),
          ...secondaryAgents.map(agent => callAgent(agent, message)),
        ]);
        
        // Blend responses intelligently
        const blendedContent = await blendResponses([primary, ...secondaries], message);
        
        return {
          content: blendedContent,
          sources: [primary, ...secondaries],
          primaryModel: primaryAgent.name,
          blended: true,
        };
      } else {
        // Smart routing - single best agent
        const agent = options?.preferredModel 
          ? activeAgents.find(a => a.id === options.preferredModel) || selectBestAgent(queryType)
          : selectBestAgent(queryType);
        
        const response = await callAgent(agent, message);
        
        return {
          content: response.content,
          sources: [response],
          primaryModel: agent.name,
          blended: false,
        };
      }
    } finally {
      setIsProcessing(false);
    }
  }, [activeAgents, blendMode]);

  const blendResponses = async (responses: AgentResponse[], originalQuery: string): Promise<string> => {
    // In production, this would use another LLM call to synthesize responses
    // For now, we'll simulate intelligent blending
    
    const bestResponse = responses.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
    
    return bestResponse.content;
  };

  const getAgentStatus = useCallback(() => {
    return activeAgents.map(agent => ({
      ...agent,
      isAvailable: agent.status === 'active',
    }));
  }, [activeAgents]);

  const toggleAgent = useCallback((agentId: string) => {
    setActiveAgents(prev => prev.map(agent => 
      agent.id === agentId 
        ? { ...agent, status: agent.status === 'active' ? 'standby' : 'active' as const }
        : agent
    ));
  }, []);

  return {
    sendMessage,
    isProcessing,
    agents: activeAgents,
    blendMode,
    setBlendMode,
    getAgentStatus,
    toggleAgent,
  };
}
