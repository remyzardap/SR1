/**
 * server/routers/chat.ts
 *
 * Dedicated Express route for streaming chat responses via SSE.
 * Mounted at POST /api/chat/stream in server/_core/index.ts
 *
 * S1 patch: replaced manual provider dropdown with intelligent S1 routing.
 * The client no longer needs to specify a provider — S1 classifies the query
 * and picks the best agent (Sonar / Kimi / Claude / Gemini) automatically.
 *
 * New SSE event emitted before streaming:
 *   event: agent
 *   data: { "agent": "claude", "label": "Claude", "reason": "writing & reasoning", "emoji": "✍", "color": "ember" }
 */

import type { Router } from "express";
import { randomUUID } from "crypto";
import { eq, asc } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import {
  getOrCreateIdentity,
  getSkillsByIdentity,
  getMemoriesByIdentity,
  getDb,
} from "../db";
import type { Skill, Memory } from "../../drizzle/schema";
import { chatMessages } from "../../drizzle/schema";
import { s1Route, buildS1SystemPrompt, buildGoogleToolPrompt, detectGoogleIntent } from "./s1Router";
import { getConnectionStatus, listEmails, listCalendarEvents, listDriveFiles } from "../services/google";
import { openclaw } from "../lib/openclaw";

// ─── Identity context builder ─────────────────────────────────────────────────

function buildIdentityContext(
  identity: { displayName?: string | null; handle?: string | null; bio?: string | null },
  memories: Memory[],
  skills: Skill[]
): string {
  const name = identity.displayName || identity.handle || "User";
  const handle = identity.handle ? ` (@${identity.handle})` : "";
  let ctx = `You are speaking with ${name}${handle}.`;

  if (identity.bio) {
    ctx += `\n\nAbout them:\n${identity.bio}`;
  }

  // Last 10 memories (most recent first)
  const recentMemories = [...memories]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  if (recentMemories.length > 0) {
    ctx += `\n\n## Their memories and context`;
    const grouped: Record<string, Memory[]> = {};
    for (const m of recentMemories) {
      if (!grouped[m.type]) grouped[m.type] = [];
      grouped[m.type].push(m);
    }
    for (const [type, items] of Object.entries(grouped)) {
      ctx += `\n\n### ${type.charAt(0).toUpperCase() + type.slice(1)}`;
      for (const item of items) {
        const title = item.title ? `**${item.title}**: ` : "";
        const tags =
          Array.isArray(item.tags) && item.tags.length > 0
            ? ` [${(item.tags as string[]).join(", ")}]`
            : "";
        ctx += `\n- ${title}${item.content}${tags}`;
      }
    }
  }

  // Skills — prompt/behavior types injected as instructions
  const promptSkills = skills.filter(
    (s) => s.type === "prompt" || s.type === "behavior"
  );
  if (promptSkills.length > 0) {
    ctx += `\n\n## Their saved skills and behaviours`;
    for (const skill of promptSkills.slice(0, 8)) {
      ctx += `\n\n### ${skill.name}`;
      if (skill.description) ctx += ` — ${skill.description}`;
      const content = skill.content as Record<string, unknown>;
      if (content?.instructions) ctx += `\n${content.instructions}`;
    }
  }

  const toolSkills = skills.filter((s) => s.type === "tool_definition");
  if (toolSkills.length > 0) {
    ctx += `\n\n## Available tools (skills)`;
    for (const skill of toolSkills) {
      ctx += `\n- **${skill.name}**: ${skill.description || "No description"}`;
    }
    ctx += `\n\nWhen the user asks you to use a skill, invoke it as a tool call.`;
  }

  ctx += `\n\nIf you learn something new and important about this person during the conversation, mention it so they can save it as a memory.`;
  return ctx;
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseWrite(res: import("express").Response, event: string, data: string) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseWriteJson(res: import("express").Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Register the streaming route ────────────────────────────────────────────

export function registerChatStreamRoute(app: Router) {
  app.post("/api/chat/stream", async (req, res) => {
    // ── 1. Authenticate ──────────────────────────────────────────────────────
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const {
      messages,
      max = false,
      sessionId: rawSessionId,
      // Legacy field — accepted but ignored (S1 routes automatically)
      provider: _provider,
    } = req.body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      max?: boolean;
      sessionId?: string;
      provider?: string;
    };

    const sessionId = rawSessionId || randomUUID();

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    // ── 3. Load agent context ────────────────────────────────────────────────
    let identity: Awaited<ReturnType<typeof getOrCreateIdentity>>;
    try {
      identity = await getOrCreateIdentity(user.id);
    } catch {
      res.status(500).json({ error: "Failed to load identity" });
      return;
    }
    if (!identity) {
      res.status(404).json({ error: "Identity not found" });
      return;
    }

    const [memories, skills] = await Promise.all([
      getMemoriesByIdentity(identity.id),
      getSkillsByIdentity(identity.id),
    ]);

    // ── 4. S1 routing — classify the latest user message ────────────────────
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const latestText = lastUserMsg?.content ?? "";
    const { info: agentInfo, config: agentConfig } = s1Route(latestText, max);

    // ── 5. Build system prompt ───────────────────────────────────────────────
    const identityContext = buildIdentityContext(identity, memories, skills);
    let systemPrompt = buildS1SystemPrompt(agentInfo, identityContext);

    const googleIntent = detectGoogleIntent(latestText);
    let googleDataContext = "";

    if (googleIntent) {
      try {
        const googleStatus = await getConnectionStatus(user.id);
        if (googleStatus.connected) {
          systemPrompt += buildGoogleToolPrompt(googleIntent);

          if (googleIntent === "gmail") {
            const emails = await listEmails(user.id, 10, undefined);
            if (emails.length > 0) {
              googleDataContext = "\n\n[LIVE GMAIL DATA]\nHere are the user's recent emails:\n";
              for (const e of emails) {
                googleDataContext += `- ${e.isUnread ? "[UNREAD] " : ""}**${e.subject}** from ${e.from} (${e.date})\n  ${e.snippet}\n`;
              }
            }
          } else if (googleIntent === "calendar") {
            const events = await listCalendarEvents(user.id, 10);
            if (events.length > 0) {
              googleDataContext = "\n\n[LIVE CALENDAR DATA]\nHere are the user's upcoming events:\n";
              for (const ev of events) {
                googleDataContext += `- **${ev.summary}** — ${ev.start} to ${ev.end}`;
                if (ev.location) googleDataContext += ` @ ${ev.location}`;
                googleDataContext += "\n";
              }
            } else {
              googleDataContext = "\n\n[LIVE CALENDAR DATA]\nNo upcoming events found.";
            }
          } else if (googleIntent === "drive") {
            const files = await listDriveFiles(user.id, 10, undefined);
            if (files.length > 0) {
              googleDataContext = "\n\n[LIVE DRIVE DATA]\nHere are the user's recent files:\n";
              for (const f of files) {
                googleDataContext += `- **${f.name}** (${f.mimeType}) — modified ${f.modifiedTime}`;
                if (f.webViewLink) googleDataContext += ` [link](${f.webViewLink})`;
                googleDataContext += "\n";
              }
            } else {
              googleDataContext = "\n\n[LIVE DRIVE DATA]\nNo files found.";
            }
          }
        }
      } catch {
        // Google not configured or token expired
      }
    }

    if (googleDataContext) {
      systemPrompt += googleDataContext;
    }

    const fullMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages,
    ];

    // ── 6. Set SSE headers ───────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // ── 7. Emit agent selection event (before streaming) ────────────────────
    sseWriteJson(res, "agent", agentInfo);

    // ── 8. Call LLM with streaming ───────────────────────────────────────────
    // For Vertex AI, exchange service account credentials for a Bearer token
    let bearerToken = agentConfig.apiKey;
    if (agentConfig.vertexProject) {
      try {
        const { GoogleAuth } = await import("google-auth-library");
        const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        bearerToken = tokenResponse.token ?? "";
      } catch (err) {
        sseWrite(res, "error", `Vertex auth error: ${String(err)}`);
        res.end();
        return;
      }
    }

    let llmResponse: Response;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      };

      llmResponse = await fetch(`${agentConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: agentConfig.model,
          messages: fullMessages,
          stream: true,
          max_tokens: 4096,
        }),
      });
    } catch (err) {
      sseWrite(res, "error", `Network error: ${String(err)}`);
      res.end();
      return;
    }

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      sseWrite(res, "error", `LLM API error (${llmResponse.status}): ${errText}`);
      res.end();
      return;
    }

    // ── 9. Stream SSE tokens ─────────────────────────────────────────────────
    const reader = llmResponse.body?.getReader();
    if (!reader) {
      sseWrite(res, "error", "No response body from LLM");
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";

    // ── 9a. Persist the user's latest message ────────────────────────────────
    try {
      const _db = await getDb();
      if (lastUserMsg && _db) {
        await _db.insert(chatMessages).values({
          id: randomUUID(),
          sessionId,
          role: "user",
          content: lastUserMsg.content,
          createdAt: new Date(),
        });
      }
    } catch { /* non-fatal */ }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr) as {
              choices?: Array<{
                delta?: { content?: string };
                finish_reason?: string | null;
              }>;
            };

            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullResponse += delta;
              sseWrite(res, "token", delta);
            }

            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === "stop") {
              sseWrite(res, "done", agentConfig.model);
            }
          } catch {
            // Malformed JSON chunk — skip
          }
        }
      }
    } catch (err) {
      sseWrite(res, "error", `Stream read error: ${String(err)}`);
    } finally {
      // ── 9b. Persist the assistant's full response ────────────────────────────
      if (fullResponse) {
        try {
          const _db = await getDb();
          if (_db) {
            await _db.insert(chatMessages).values({
              id: randomUUID(),
              sessionId,
              role: "assistant",
              content: fullResponse,
              createdAt: new Date(),
            });
          }
        } catch { /* non-fatal */ }

        // ── 9c. Send response via Telegram through OpenClaw ────────────────────
        try {
          await openclaw.send('message', {
            channel: 'telegram',
            text: fullResponse,
          });
        } catch { /* non-fatal if OpenClaw not available */ }
      }
      res.end();
    }
  });

  // ── GET /api/chat/history — load persisted history for a session ──────────
  app.get("/api/chat/history", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { sessionId: sid } = req.query as { sessionId?: string };
    if (!sid) {
      res.json([]);
      return;
    }

    try {
      const _db = await getDb();
      if (!_db) {
        res.json([]);
        return;
      }
      const history = await _db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sid))
        .orderBy(asc(chatMessages.createdAt));
      res.json(history);
    } catch {
      res.json([]);
    }
  });
}
