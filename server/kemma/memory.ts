/**
 * memory.ts — Memory context loader for Kemma engine
 * Fetches relevant memories for the current message and formats
 * them for injection into Kemma's system prompt.
 *
 * Drop in: server/kemma/memory.ts
 * Referenced by engine.ts via: import { getMemoriesContext } from "./memory";
 */

import { getDb } from "../db";
import {
  embed,
  searchSimilar,
  isVectorSearchConfigured,
} from "../services/vectorSearch";
import { getMemoriesByIdentity, getOrCreateIdentity } from "../db";

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Returns a formatted string of relevant memories for injection
 * into Kemma's system prompt.
 *
 * Uses vector similarity search if configured (Gemini Embedding 2),
 * falls back to most recent memories otherwise.
 */
export async function getMemoriesContext(
  userId:   number,
  message:  string,
  maxItems: number = 5
): Promise<string | undefined> {
  try {
    const identity = await getOrCreateIdentity(userId);
    if (!identity) return undefined;

    let memories: Array<{ type: string; title?: string | null; content: string }> = [];

    // Try semantic search first (Gemini Embedding 2)
    if (isVectorSearchConfigured() && message.trim().length > 3) {
      try {
        const queryVector = await embed(message);
        const similar     = await searchSimilar(queryVector, identity.id, maxItems);

        if (similar.length > 0) {
          const allMemories = await getMemoriesByIdentity(identity.id);
          const ids         = similar.map((s) => s.id);
          memories = ids
            .map((id) => allMemories.find((m) => m.id === id))
            .filter((m): m is NonNullable<typeof m> => Boolean(m));
        }
      } catch {
        // Fall through to recency-based
      }
    }

    // Fallback: most recent
    if (memories.length === 0) {
      const all  = await getMemoriesByIdentity(identity.id);
      memories   = all.slice(0, maxItems);
    }

    if (memories.length === 0) return undefined;

    // Format for system prompt injection, capped: one stored memory must not be able
    // to dominate (or OOM) every future system prompt. Per item, then total.
    const MAX_ITEM_CHARS = 2000;
    const MAX_TOTAL_CHARS = 8000;
    let used = 0;
    const lines: string[] = [];
    for (const m of memories) {
      let body = `[${m.type}] ${m.title ? m.title + ": " : ""}${m.content}`;
      if (body.length > MAX_ITEM_CHARS) body = body.slice(0, MAX_ITEM_CHARS - 1) + "…";
      if (used + body.length + 1 > MAX_TOTAL_CHARS) break;
      used += body.length + 1;
      lines.push(body);
    }
    return lines.length > 0 ? lines.join("\n") : undefined;

  } catch {
    return undefined; // never crash the engine over memories
  }
}
