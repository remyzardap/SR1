// ============================================================================
// SUTAERU INTELLIGENCE — Frontend Hook (Real API Integration)
// ============================================================================

import { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

const API_BASE = '/api';
const WS_BASE = typeof window !== 'undefined'
  ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
  : '';

// ============================================================================
// TYPES
// ============================================================================

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

export interface HerPersonality {
  enabled: boolean;
  style: 'warm' | 'professional' | 'mysterious' | 'playful';
  voiceEnabled: boolean;
  autoAnswerCalls: boolean;
  herHoursStart: number;
  herHoursEnd: number;
  customInstructions?: string;
}

export interface CallSession {
  id: string;
  callerId: string;
  status: 'ringing' | 'her_active' | 'connected' | 'ended' | 'scheduled';
  transcript: Array<{ speaker: 'caller' | 'her' | 'target'; text: string; timestamp: string }>;
  messageLeft?: string;
  callbackScheduled?: { suggestedTimes: string[]; callerAccepted: boolean; scheduledAt: string };
  startedAt: Date;
  endedAt?: Date;
  conversationId?: string;
}

interface Agent {
  id: string;
  name: string;
  provider: 'kimi' | 'anthropic' | 'google';
  status: 'active' | 'standby' | 'offline';
  specialties: string[];
  latency: number;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useSutaeruIntelligence() {
  // State
  const [her, setHer] = useState<HerPersonality>({
    enabled: true,
    style: 'warm',
    voiceEnabled: true,
    autoAnswerCalls: false,
    herHoursStart: 22,
    herHoursEnd: 8,
  });
  
  const [agents, setAgents] = useState<Agent[]>([
    { id: 'kimi', name: 'Kimi', provider: 'kimi', status: 'active', specialties: ['coding', 'analysis', 'reasoning', 'chinese', 'long-context'], latency: 700 },
    { id: 'claude', name: 'Claude', provider: 'anthropic', status: 'active', specialties: ['long-context', 'nuanced-understanding', 'safety', 'instruction-following', 'creative-writing'], latency: 800 },
    { id: 'gemini', name: 'Gemini', provider: 'google', status: 'active', specialties: ['multimodal', 'factual', 'research', 'summarization', 'speed'], latency: 500 },
  ]);
  
  const [blendMode, setBlendMode] = useState<'smart' | 'ensemble' | 'fastest'>('smart');
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [callHistory, setCallHistory] = useState<CallSession[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);
  
  // ==========================================================================
  // CHAT / TEXT MESSAGES
  // ==========================================================================
  
  const sendMessage = useCallback(async (
    message: string,
    options?: { blend?: boolean; preferredModel?: string }
  ): Promise<BlendedResponse & { herEnhanced?: boolean; queryType?: string }> => {
    setIsProcessing(true);
    
    try {
      const response = await fetch(`${API_BASE}/intelligence/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          options: {
            blend: options?.blend ?? (blendMode === 'ensemble'),
            preferredModel: options?.preferredModel,
            activeAgentIds: agents.filter(a => a.status === 'active').map(a => a.id),
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      const data = await response.json();
      
      return {
        content: data.content,
        sources: data.sources,
        primaryModel: data.primaryModel,
        blended: data.blended,
        herEnhanced: false,
        queryType: data.queryType,
      };
    } catch (error) {
      console.error('[Sutaeru] Chat error:', error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [blendMode, agents]);

  // ==========================================================================
  // HER VOICE CALLS
  // ==========================================================================
  
  const initiateCall = useCallback(async (callerId: string, callerName: string): Promise<CallSession> => {
    try {
      // Create HER session via API
      const response = await fetch(`${API_BASE}/intelligence/her/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callerName,
          context: {
            targetName: 'me',
            relationship: 'close',
            targetStatus: 'unavailable',
            personality: {
              style: her.style,
              customInstructions: her.customInstructions,
            },
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to initiate call');
      }

      const data = await response.json();

      // Create call session
      const callSession: CallSession = {
        id: `call-${Date.now()}`,
        callerId,
        status: 'her_active',
        transcript: [],
        startedAt: new Date(),
        conversationId: data.session.conversationId,
      };

      setActiveCall(callSession);

      // Connect WebSocket for real-time audio
      const ws = new WebSocket(`${WS_BASE}/ws/intelligence?id=${callSession.id}&type=her`);
      
      ws.onopen = () => {
        console.log('[HER] WebSocket connected');
        // Initialize HER with signed URL
        ws.send(JSON.stringify({
          type: 'her_init',
          signedUrl: data.session.signedUrl,
          conversationId: data.session.conversationId,
        }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'her_ready':
            console.log('[HER] Ready for audio');
            break;
            
          case 'her_message':
            // Handle HER transcript/audio
            if (message.data.type === 'transcript') {
              setActiveCall(prev => {
                if (!prev) return null;
                return {
                  ...prev,
                  transcript: [...prev.transcript, {
                    speaker: message.data.role === 'agent' ? 'her' : 'caller',
                    text: message.data.content,
                    timestamp: new Date().toISOString(),
                  }],
                };
              });
            }
            break;
            
          case 'her_analysis':
            // Handle analysis (scheduling intent, urgency)
            console.log('[HER] Analysis:', message.data);
            break;
            
          case 'her_ended':
            console.log('[HER] Call ended');
            endCall(callSession.id);
            break;
            
          case 'her_error':
            console.error('[HER] Error:', message.error);
            break;
        }
      };

      ws.onerror = (error) => {
        console.error('[HER] WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('[HER] WebSocket closed');
        endCall(callSession.id);
      };

      wsRef.current = ws;

      return callSession;
    } catch (error) {
      console.error('[Sutaeru] Initiate call error:', error);
      throw error;
    }
  }, [her]);

  const endCall = useCallback(async (callId: string) => {
    const call = activeCall;
    if (!call || call.id !== callId) return;

    try {
      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'her_end' }));
        wsRef.current.close();
        wsRef.current = null;
      }

      // End via API if we have a conversation ID
      if (call.conversationId) {
        await fetch(`${API_BASE}/intelligence/her/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversationId: call.conversationId,
          }),
        });
      }

      // Update state
      const endedCall: CallSession = {
        ...call,
        status: 'ended',
        endedAt: new Date(),
      };

      setCallHistory(prev => [endedCall, ...prev]);
      setActiveCall(null);
    } catch (error) {
      console.error('[Sutaeru] End call error:', error);
    }
  }, [activeCall]);

  // Send audio to HER
  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'her_audio',
        audio: audioData,
      }));
    }
  }, []);

  // ==========================================================================
  // SETTINGS
  // ==========================================================================
  
  const updateHerSettings = useCallback((settings: Partial<HerPersonality>) => {
    setHer(prev => ({ ...prev, ...settings }));
  }, []);

  const toggleAgent = useCallback((agentId: string) => {
    setAgents(prev => prev.map(agent => 
      agent.id === agentId 
        ? { ...agent, status: agent.status === 'active' ? 'standby' : 'active' as const }
        : agent
    ));
  }, []);

  // ==========================================================================
  // COMPUTED
  // ==========================================================================
  
  const activeAgentCount = agents.filter(a => a.status === 'active').length;
  const isHerAvailable = her.enabled;
  const isInHerHours = (() => {
    const hour = new Date().getHours();
    return hour >= her.herHoursStart || hour < her.herHoursEnd;
  })();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    // Chat/Text
    sendMessage,
    isProcessing,
    
    // Voice/Calls
    initiateCall,
    endCall,
    sendAudio,
    activeCall,
    callHistory,
    
    // Settings
    her,
    updateHerSettings,
    
    // Agents
    agents,
    blendMode,
    setBlendMode,
    toggleAgent,
    activeAgentCount,
    
    // Status
    isHerAvailable,
    isInHerHours,
  };
}

// ============================================================================
// PROVIDER (for React Context)
// ============================================================================

const IntelligenceContext = createContext<ReturnType<typeof useSutaeruIntelligence> | null>(null);

export function IntelligenceProvider({ children }: { children: ReactNode }) {
  const intelligence = useSutaeruIntelligence();
  return (
    <IntelligenceContext.Provider value={intelligence}>
      {children}
    </IntelligenceContext.Provider>
  );
}

export function useIntelligence() {
  const ctx = useContext(IntelligenceContext);
  if (!ctx) throw new Error('useIntelligence must be used within IntelligenceProvider');
  return ctx;
}
