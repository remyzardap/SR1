import { getDb } from "../db";
import { agents, agentSessions } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";

export interface AgentContext {
  agentId: string;
  name: string;
  systemPrompt: string;
  color: string;
}

export async function getAgentContextForSession(
  sessionId: string
): Promise<AgentContext> {
  const db = await getDb();
  if (!db) {
    return {
      agentId: "agent_general",
      name: "General Assistant",
      systemPrompt: "You are a helpful assistant.",
      color: "#6366f1",
    };
  }

  const result = await db
    .select({
      agentId: agents.id,
      name: agents.name,
      systemPrompt: agents.systemPrompt,
      color: agents.color,
    })
    .from(agentSessions)
    .innerJoin(agents, eq(agentSessions.agentId, agents.id))
    .where(
      and(
        eq(agentSessions.sessionId, sessionId),
        isNull(agentSessions.endedAt)
      )
    )
    .limit(1);

  if (result[0]) return result[0];

  // Fallback to general agent
  const fallback = await db
    .select({
      agentId: agents.id,
      name: agents.name,
      systemPrompt: agents.systemPrompt,
      color: agents.color,
    })
    .from(agents)
    .where(eq(agents.slug, "general"))
    .limit(1);

  return (
    fallback[0] ?? {
      agentId: "agent_general",
      name: "General Assistant",
      systemPrompt: "You are a helpful assistant.",
      color: "#6366f1",
    }
  );
}
