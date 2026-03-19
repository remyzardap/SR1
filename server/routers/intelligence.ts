// ============================================================================
// INTELLIGENCE API ROUTES — Chat, HER Calls, Agents
// ============================================================================

import { Router } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { 
  createHerSession, 
  endConversation, 
  getConversationHistory,
  detectSchedulingIntent,
  detectUrgency,
  extractTimes,
  type HerContext 
} from '../services/elevenlabs';
import { 
  sendMessage, 
  getAgentStatus, 
  detectQueryType,
  AGENTS 
} from '../services/blendedAgents';

const router = Router();

// Environment variables
const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY || '';
const ELEVEN_LABS_AGENT_ID = process.env.ELEVEN_LABS_AGENT_ID || '';
const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID || '';

// ============================================================================
// CHAT / TEXT MESSAGES
// ============================================================================

// POST /api/intelligence/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, options = {} } = req.body;
    const userId = (req as any).user?.id;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await sendMessage(message, {
      blend: options.blend,
      preferredModel: options.preferredModel,
      activeAgentIds: options.activeAgentIds,
    });

    res.json({
      success: true,
      ...response,
      queryType: detectQueryType(message),
    });
  } catch (error) {
    console.error('[Intelligence] Chat error:', error);
    res.status(500).json({ 
      error: 'Failed to process message',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/intelligence/agents
router.get('/agents', async (req, res) => {
  try {
    const agents = getAgentStatus();
    res.json({ agents });
  } catch (error) {
    console.error('[Intelligence] Agents error:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// ============================================================================
// HER VOICE CALLS
// ============================================================================

// POST /api/intelligence/her/call
router.post('/her/call', async (req, res) => {
  try {
    const { callerName, context } = req.body;
    const userId = (req as any).user?.id;
    
    if (!callerName) {
      return res.status(400).json({ error: 'Caller name is required' });
    }

    // Build HER context
    const herContext: HerContext = {
      targetName: context?.targetName || 'me',
      callerName,
      relationship: context?.relationship || 'close',
      targetStatus: context?.targetStatus || 'unavailable',
      personality: {
        style: context?.personality?.style || 'warm',
        customInstructions: context?.personality?.customInstructions,
      },
      lastTopic: context?.lastTopic,
      notes: context?.notes,
    };

    // Create ElevenLabs session
    const session = await createHerSession(
      herContext,
      ELEVEN_LABS_API_KEY,
      ELEVEN_LABS_AGENT_ID,
      ELEVEN_LABS_VOICE_ID
    );

    res.json({
      success: true,
      session: {
        conversationId: session.conversation_id,
        signedUrl: session.signed_url,
      },
      message: `Hey ${callerName}... it's HER. ${herContext.targetName} asked me to catch this for them.`,
    });
  } catch (error) {
    console.error('[Intelligence] HER call error:', error);
    res.status(500).json({ 
      error: 'Failed to initiate HER call',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/intelligence/her/end
router.post('/her/end', async (req, res) => {
  try {
    const { conversationId } = req.body;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    await endConversation(conversationId, ELEVEN_LABS_API_KEY);
    
    // Get conversation history
    const history = await getConversationHistory(conversationId, ELEVEN_LABS_API_KEY);
    
    res.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error('[Intelligence] HER end error:', error);
    res.status(500).json({ error: 'Failed to end conversation' });
  }
});

// POST /api/intelligence/her/analyze
router.post('/her/analyze', async (req, res) => {
  try {
    const { transcript } = req.body;
    
    if (!transcript || !Array.isArray(transcript)) {
      return res.status(400).json({ error: 'Transcript array is required' });
    }

    // Analyze transcript
    const callerMessages = transcript
      .filter((t: any) => t.speaker === 'caller')
      .map((t: any) => t.text)
      .join(' ');

    const analysis = {
      hasSchedulingIntent: detectSchedulingIntent(callerMessages),
      isUrgent: detectUrgency(callerMessages),
      suggestedTimes: extractTimes(callerMessages),
      messageLeft: callerMessages.substring(0, 1000),
      summary: transcript.length > 0 
        ? `Call lasted ${transcript.length} exchanges`
        : 'No transcript available',
    };

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('[Intelligence] HER analyze error:', error);
    res.status(500).json({ error: 'Failed to analyze transcript' });
  }
});

// ============================================================================
// WEBSOCKET SETUP
// ============================================================================

export function setupIntelligenceWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (url.pathname === '/ws/intelligence') {
      wss.handleUpgrade(req, socket as any, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  const connections = new Map<string, {
    clientWs: WebSocket;
    elevenLabsWs?: WebSocket;
    conversationId?: string;
  }>();

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const connectionId = url.searchParams.get('id') || `conn-${Date.now()}`;
    const type = url.searchParams.get('type'); // 'her' or 'chat'

    console.log(`[WebSocket] New connection: ${connectionId} (${type})`);

    connections.set(connectionId, { clientWs: ws });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const conn = connections.get(connectionId);

        if (!conn) return;

        switch (message.type) {
          case 'her_init':
            // Initialize HER connection to ElevenLabs
            if (message.signedUrl) {
              const elevenWs = new WebSocket(message.signedUrl);
              
              elevenWs.on('open', () => {
                console.log('[WebSocket] ElevenLabs connected');
                ws.send(JSON.stringify({ type: 'her_ready' }));
              });

              elevenWs.on('message', (elevenData) => {
                try {
                  const parsed = JSON.parse(elevenData.toString());
                  
                  // Forward to client
                  ws.send(JSON.stringify({
                    type: 'her_message',
                    data: parsed,
                  }));

                  // Detect scheduling/urgency
                  if (parsed.type === 'transcript' && parsed.role === 'user') {
                    const hasScheduling = detectSchedulingIntent(parsed.content);
                    const isUrgent = detectUrgency(parsed.content);
                    
                    if (hasScheduling || isUrgent) {
                      ws.send(JSON.stringify({
                        type: 'her_analysis',
                        data: {
                          hasSchedulingIntent: hasScheduling,
                          isUrgent,
                          suggestedTimes: extractTimes(parsed.content),
                        },
                      }));
                    }
                  }
                } catch (e) {
                  console.error('[WebSocket] Failed to parse ElevenLabs message:', e);
                }
              });

              elevenWs.on('close', () => {
                console.log('[WebSocket] ElevenLabs disconnected');
                ws.send(JSON.stringify({ type: 'her_ended' }));
                connections.delete(connectionId);
              });

              elevenWs.on('error', (error) => {
                console.error('[WebSocket] ElevenLabs error:', error);
                ws.send(JSON.stringify({ type: 'her_error', error: 'Voice connection error' }));
              });

              conn.elevenLabsWs = elevenWs;
              conn.conversationId = message.conversationId;
            }
            break;

          case 'her_audio':
            // Forward audio data to ElevenLabs
            if (conn.elevenLabsWs && conn.elevenLabsWs.readyState === WebSocket.OPEN) {
              conn.elevenLabsWs.send(message.audio);
            }
            break;

          case 'her_end':
            // End HER call
            if (conn.elevenLabsWs) {
              conn.elevenLabsWs.close();
            }
            if (conn.conversationId) {
              await endConversation(conn.conversationId, ELEVEN_LABS_API_KEY);
            }
            ws.send(JSON.stringify({ type: 'her_ended' }));
            connections.delete(connectionId);
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

          default:
            console.log('[WebSocket] Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('[WebSocket] Message handling error:', error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Failed to process message' 
        }));
      }
    });

    ws.on('close', () => {
      console.log(`[WebSocket] Connection closed: ${connectionId}`);
      const conn = connections.get(connectionId);
      if (conn?.elevenLabsWs) {
        conn.elevenLabsWs.close();
      }
      connections.delete(connectionId);
    });

    ws.on('error', (error) => {
      console.error(`[WebSocket] Connection error: ${connectionId}`, error);
      connections.delete(connectionId);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({ 
      type: 'connected', 
      connectionId,
      timestamp: new Date().toISOString(),
    }));
  });

  console.log('[WebSocket] Intelligence WebSocket server initialized');
  return wss;
}

export default router;
