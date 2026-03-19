import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { agents, agentSessions } from "../../drizzle/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

export const agentsRouter = router({
  listAgents: publicProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(agents).where(eq(agents.isActive, true));
  }),

  getActiveAgent: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const result = await db
        .select({
          agentSessionId: agentSessions.id,
          agentId: agentSessions.agentId,
          startedAt: agentSessions.startedAt,
          messageCount: agentSessions.messageCount,
          name: agents.name,
          slug: agents.slug,
          description: agents.description,
          systemPrompt: agents.systemPrompt,
          color: agents.color,
          avatarUrl: agents.avatarUrl,
        })
        .from(agentSessions)
        .innerJoin(agents, eq(agentSessions.agentId, agents.id))
        .where(
          and(
            eq(agentSessions.sessionId, input.sessionId),
            isNull(agentSessions.endedAt)
          )
        )
        .orderBy(desc(agentSessions.startedAt))
        .limit(1);

      return result[0] ?? null;
    }),

  getAgentHistory: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db
        .select({
          id: agentSessions.id,
          agentId: agentSessions.agentId,
          name: agents.name,
          color: agents.color,
          startedAt: agentSessions.startedAt,
          endedAt: agentSessions.endedAt,
          messageCount: agentSessions.messageCount,
        })
        .from(agentSessions)
        .innerJoin(agents, eq(agentSessions.agentId, agents.id))
        .where(eq(agentSessions.sessionId, input.sessionId))
        .orderBy(desc(agentSessions.startedAt));
    }),

  switchAgent: publicProcedure
    .input(z.object({ sessionId: z.string(), newAgentId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const now = Date.now();

      await db
        .update(agentSessions)
        .set({ endedAt: now })
        .where(
          and(
            eq(agentSessions.sessionId, input.sessionId),
            isNull(agentSessions.endedAt)
          )
        );

      const newAgentSessionId = nanoid();
      await db.insert(agentSessions).values({
        id: newAgentSessionId,
        sessionId: input.sessionId,
        agentId: input.newAgentId,
        startedAt: now,
        endedAt: null,
        messageCount: 0,
      });

      return { agentSessionId: newAgentSessionId };
    }),

  initAgentForSession: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        agentId: z.string().default("agent_general"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const agentSessionId = nanoid();
      await db.insert(agentSessions).values({
        id: agentSessionId,
        sessionId: input.sessionId,
        agentId: input.agentId,
        startedAt: Date.now(),
        endedAt: null,
        messageCount: 0,
      });
      return { agentSessionId };
    }),

  incrementMessageCount: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const current = await db
        .select({
          id: agentSessions.id,
          messageCount: agentSessions.messageCount,
        })
        .from(agentSessions)
        .where(
          and(
            eq(agentSessions.sessionId, input.sessionId),
            isNull(agentSessions.endedAt)
          )
        )
        .limit(1);

      if (current[0]) {
        await db
          .update(agentSessions)
          .set({ messageCount: current[0].messageCount + 1 })
          .where(eq(agentSessions.id, current[0].id));
      }
    }),
});
