import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getChatSessionForUser } from "../db";
import { agents, agentSessions } from "../../drizzle/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

// agent_sessions rows are keyed only by chat-session id, so every procedure must
// first prove the session belongs to the caller.
async function requireOwnedSession(sessionId: string, userId: number) {
  const session = await getChatSessionForUser(sessionId, userId);
  if (!session) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
  }
  return session;
}

async function requireExistingAgent(db: Awaited<ReturnType<typeof requireDb>>, agentId: string) {
  const found = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  if (!found[0]) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown agent id" });
  }
  return found[0].id;
}

export const agentsRouter = router({
  listAgents: protectedProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(agents).where(eq(agents.isActive, true));
  }),

  getActiveAgent: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      await requireOwnedSession(input.sessionId, ctx.user.id);
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

  getAgentHistory: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      await requireOwnedSession(input.sessionId, ctx.user.id);
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

  switchAgent: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1), newAgentId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireOwnedSession(input.sessionId, ctx.user.id);
      const db = await requireDb();
      await requireExistingAgent(db, input.newAgentId);
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

  initAgentForSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        agentId: z.string().min(1).default("agent_general"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireOwnedSession(input.sessionId, ctx.user.id);
      const db = await requireDb();
      await requireExistingAgent(db, input.agentId);
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

  incrementMessageCount: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireOwnedSession(input.sessionId, ctx.user.id);
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
