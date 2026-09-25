import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { createChatSession } from "../db";
import { s1Route, buildS1SystemPrompt } from "./s1Router";

export const openclawRouter = router({
  /**
   * Chat with Kemma from OpenClaw
   * POST /api/trpc/openclaw.chat
   * 
   * Request body:
   * {
   *   "json": {
   *     "userId": "openclaw_agent",
   *     "message": "What's the weather?"
   *   }
   * }
   */
  chat: protectedProcedure
    .input(
      z.object({
        userId: z.string().default("openclaw_agent"),
        message: z.string().min(1),
        sessionId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { userId, message, sessionId } = input;

      try {
        // Route to S1 (auto-detects best agent based on query)
        const { config: agentConfig } = s1Route(message, false);
        const systemPrompt = buildS1SystemPrompt({
          agent: "s1",
          label: "Kemma",
          reason: "openclaw",
          emoji: "🧠",
          color: "#E8442A",
        });

        const messages = [
          { role: "system" as const, content: systemPrompt },
          { role: "user" as const, content: message },
        ];

        // Call the LLM
        const response = await fetch(`${agentConfig.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: agentConfig.model,
            messages,
            max_tokens: 1000,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`LLM error: ${response.status} ${error}`);
        }

        const llmData = await response.json();
        const responseText =
          llmData.choices?.[0]?.message?.content || "No response from S1.";

        return {
          ok: true,
          response: responseText,
          agent: "s1",
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.error("[OpenClaw] Chat error:", error);
        return {
          ok: false,
          response: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          agent: "s1",
          timestamp: new Date().toISOString(),
        };
      }
    }),
});

export default openclawRouter;
