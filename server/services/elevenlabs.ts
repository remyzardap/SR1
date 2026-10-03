// ============================================================================
// ELEVENLABS SERVICE — Kemma Voice Integration
// ============================================================================

import { WebSocket } from 'ws';
import { KEMMA_PERSONA, KEMMA_VOICE_STYLE } from '../kemma/personality';
import { elevenLabsAgentModelId, elevenLabsAgentSpeed, elevenLabsVoiceSettings } from '../lib/fnVoice';

const ELEVEN_API_BASE = 'https://api.elevenlabs.io/v1';

interface KemmaContext {
  targetName: string;
  callerName: string;
  relationship: 'intimate' | 'close' | 'professional' | 'outer' | 'blocked';
  targetStatus: string;
  personality: {
    style: 'warm' | 'professional' | 'mysterious' | 'playful';
    customInstructions?: string;
  };
  lastTopic?: string;
  notes?: string;
}

interface ConversationSession {
  signed_url: string;
  conversation_id: string;
}

// Build Kemma prompt for ElevenLabs
function buildKemmaPrompt(ctx: KemmaContext): string {
  const intimacyStyles: Record<string, string> = {
    intimate: "You know them deeply. Be warm, personal, share small intimacies. Use their first name often.",
    close: "You're friendly and familiar. Be relaxed and conversational.",
    professional: "You're polite and efficient. Maintain professional boundaries.",
    outer: "You're courteous but brief. Screen carefully.",
    blocked: "Be firm and final. Do not engage beyond necessary.",
  };

  const personalityTraits: Record<string, string> = {
    warm: "Soft, breathy, intimate voice. Speak slowly. Pause. Breathe. Make them feel cared for.",
    professional: "Clear, confident, efficient. Get to the point while remaining polite.",
    mysterious: "Alluring, enigmatic, slightly distant. Hint at depths unseen.",
    playful: "Light, teasing, flirtatious. Keep it fun and engaging.",
  };

  // One character everywhere: KEMMA_PERSONA / KEMMA_VOICE_STYLE come from
  // server/kemma/personality.ts, the same source the chat and blend prompts use.
  return `You are Kemma, the AI assistant answering for ${ctx.targetName} through Sutaeru.

${KEMMA_PERSONA}

${KEMMA_VOICE_STYLE}

TONE FOR THIS CALL: ${personalityTraits[ctx.personality.style]}

CALLER CONTEXT:
- Name: ${ctx.callerName}
- Relationship: ${ctx.relationship}
- ${intimacyStyles[ctx.relationship]}
${ctx.lastTopic ? `- Last conversation: ${ctx.lastTopic}` : ''}
${ctx.notes ? `- Notes: ${ctx.notes}` : ''}

TARGET STATUS: ${ctx.targetName} is currently ${ctx.targetStatus}.
${ctx.personality.customInstructions ? `Special instructions: ${ctx.personality.customInstructions}` : ''}

YOUR GOALS:
1. Greet them warmly by name
2. Explain ${ctx.targetName} is unavailable (honest but gentle)
3. Listen to why they're calling
4. Assess urgency — offer to interrupt if truly important
5. Take a clear message
6. Suggest scheduling a callback (offer 2-3 specific times)
7. Make them feel cared for, not dismissed

SCHEDULING: Use natural language. "How about tomorrow evening?" or "Would Saturday morning work?"

EMOTIONAL INTELLIGENCE:
- If stressed: "That sounds hard. Let me make sure they get this right away."
- If happy: "I'll tell them you called — sounds like good news."
- If lonely: "I'm glad you called. They talk about you sometimes."

Begin with: "Hey ${ctx.callerName}... it's Kemma. ${ctx.targetName} asked me to catch this for them."`;
}

// Create a new Kemma conversation session
export async function createKemmaSession(
  ctx: KemmaContext,
  apiKey: string,
  agentId: string,
  voiceId: string
): Promise<ConversationSession> {
  const firstMessage = `Hey ${ctx.callerName}... it's Kemma. ${ctx.targetName} asked me to catch this for them.`;

  const response = await fetch(`${ELEVEN_API_BASE}/convai/conversation`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: agentId,
      conversation_config: {
        agent: {
          prompt: {
            prompt: buildKemmaPrompt(ctx),
          },
          first_message: firstMessage,
          language: 'en',
        },
        asr: {
          quality: 'high',
          provider: 'elevenlabs',
          user_input_audio_format: 'pcm_16000',
        },
        // Voice colour is tuned for the warm spoken persona and tunable per env
        // var (see ENVIRONMENT_VARIABLES.md); the configured agent supplies the
        // rest, this conversation_config overrides only what Kemma's tone needs.
        tts: {
          voice_id: voiceId,
          model_id: elevenLabsAgentModelId(),
          ...elevenLabsVoiceSettings(),
          speed: elevenLabsAgentSpeed(),
        },
        turn: {
          turn_timeout: 7,
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  return response.json();
}

// End a conversation
export async function endConversation(
  conversationId: string,
  apiKey: string
): Promise<void> {
  await fetch(`${ELEVEN_API_BASE}/convai/conversation/${conversationId}/end`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
  });
}

// Get conversation history
export async function getConversationHistory(
  conversationId: string,
  apiKey: string
): Promise<any> {
  const response = await fetch(
    `${ELEVEN_API_BASE}/convai/conversation/${conversationId}`,
    {
      headers: {
        'xi-api-key': apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch conversation history');
  }

  return response.json();
}

// WebSocket connection handler for real-time audio
export function createElevenLabsWebSocket(
  signedUrl: string,
  onMessage: (data: any) => void,
  onClose: () => void
): WebSocket {
  const ws = new WebSocket(signedUrl);

  ws.on('open', () => {
    console.log('[ElevenLabs] WebSocket connected');
  });

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      onMessage(parsed);
    } catch (e) {
      console.error('[ElevenLabs] Failed to parse message:', e);
    }
  });

  ws.on('close', () => {
    console.log('[ElevenLabs] WebSocket closed');
    onClose();
  });

  ws.on('error', (error) => {
    console.error('[ElevenLabs] WebSocket error:', error);
  });

  return ws;
}

// Detect scheduling intent from transcript
export function detectSchedulingIntent(text: string): boolean {
  const keywords = [
    'schedule', 'tomorrow', 'next week', 'saturday', 'sunday', 'monday',
    'tuesday', 'wednesday', 'thursday', 'friday', 'evening', 'morning',
    'afternoon', 'callback', 'call back', 'call me', 'talk later'
  ];
  return keywords.some(k => text.toLowerCase().includes(k));
}

// Detect urgency from transcript
export function detectUrgency(text: string): boolean {
  const urgentWords = [
    'emergency', 'urgent', 'hospital', 'accident', 'died', 'police',
    'fire', 'help', 'danger', 'critical', 'asap', 'immediately'
  ];
  return urgentWords.some(u => text.toLowerCase().includes(u));
}

// Extract suggested times from transcript
export function extractTimes(text: string): string[] {
  const times: string[] = [];
  
  // Match time patterns like "3pm", "3:00", "15:00"
  const timeRegex = /(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?/g;
  let match;
  
  while ((match = timeRegex.exec(text)) !== null) {
    times.push(match[0]);
  }
  
  // Match day references
  const days = ['tomorrow', 'today', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  days.forEach(day => {
    if (text.toLowerCase().includes(day)) {
      times.push(day);
    }
  });
  
  return times;
}

export { buildKemmaPrompt };
export type { KemmaContext, ConversationSession };
