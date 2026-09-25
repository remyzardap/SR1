/**
 * Semantic vector search using Gemini Embedding 2
 * - Embeddings: text-embedding-004 (Gemini Embedding 2, 768 dimensions)
 * - Vector store: In-memory with cosine similarity (can be upgraded to pgvector)
 * - Relational data: PostgreSQL via Drizzle
 *
 * Required env vars:
 *   GEMINI_API_KEY  - Google AI Studio API key
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "../db";
import { memories, identities } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = process.env.KEMMA_MODEL_EMBEDDING || "gemini-embedding-2";

// In-memory vector cache (production: use pgvector or Redis)
const vectorCache = new Map<string, { vector: number[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// ═══════════════════════════════════════════════════════════════════════════════
// EMBEDDING GENERATION (Gemini Embedding 2)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an embedding for the given text using Google's Gemini Embedding API.
 * Model configurable via KEMMA_MODEL_EMBEDDING (default gemini-embedding-2).
 */
export async function embed(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Check cache
  const cacheKey = `embed_${hashText(text)}`;
  const cached = vectorCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.vector;
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

  const result = await model.embedContent(text);
  const embedding = result.embedding.values;

  // Cache the result
  vectorCache.set(cacheKey, { vector: embedding, timestamp: Date.now() });

  return embedding;
}

/**
 * Batch embed multiple texts
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((t) => embed(t)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// VECTOR STORAGE (Memory-based with PostgreSQL fallback)
// ═══════════════════════════════════════════════════════════════════════════════

interface VectorRecord {
  memoryId: number;
  identityId: number;
  vector: number[];
  content: string;
  timestamp: number;
}

// In-memory vector store
const vectorStore = new Map<number, VectorRecord>();

/**
 * Store a memory vector
 */
export async function upsertVector(
  memoryId: number,
  vector: number[],
  identityId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get memory content for context
  const memory = await db
    .select()
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);

  if (memory.length === 0) return;

  // Store in memory
  vectorStore.set(memoryId, {
    memoryId,
    identityId,
    vector,
    content: memory[0].content,
    timestamp: Date.now(),
  });

  // Also store in database as JSONB for persistence
  await db
    .update(memories)
    .set({
      structuredData: sql`COALESCE(structured_data, '{}'::jsonb) || ${JSON.stringify({
        embedding: vector,
        embeddedAt: new Date().toISOString(),
      })}::jsonb`,
    })
    .where(eq(memories.id, memoryId));
}

/**
 * Remove a memory vector
 */
export async function removeVector(memoryId: number): Promise<void> {
  vectorStore.delete(memoryId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMILARITY SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same dimensions");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find the k most semantically similar memories for a given identity.
 * Returns an array of { id, score } sorted by descending similarity.
 */
export async function searchSimilar(
  vector: number[],
  identityId: number,
  k: number = 5
): Promise<Array<{ id: number; score: number }>> {
  const db = await getDb();
  if (!db) return [];

  // First, try to get memories from database that have embeddings
  const userMemories = await db
    .select()
    .from(memories)
    .innerJoin(identities, eq(memories.identityId, identities.id))
    .where(eq(identities.id, identityId));

  const scored: Array<{ id: number; score: number }> = [];

  for (const row of userMemories) {
    const memory = row.memories;
    
    // Check if we have a cached vector
    const cached = vectorStore.get(memory.id);
    if (cached) {
      const similarity = cosineSimilarity(vector, cached.vector);
      scored.push({ id: memory.id, score: similarity });
      continue;
    }

    // Check if embedding exists in database
    const structured = memory.structuredData as { embedding?: number[] } | null;
    if (structured?.embedding) {
      const similarity = cosineSimilarity(vector, structured.embedding);
      scored.push({ id: memory.id, score: similarity });
      
      // Cache it
      vectorStore.set(memory.id, {
        memoryId: memory.id,
        identityId,
        vector: structured.embedding,
        content: memory.content,
        timestamp: Date.now(),
      });
    }
  }

  // Sort by score descending and return top k
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Search memories by text query (auto-embeds the query)
 */
export async function searchMemoriesByText(
  identityId: number,
  query: string,
  k: number = 5
): Promise<Array<{ id: number; score: number; content: string }>> {
  const queryVector = await embed(query);
  const similar = await searchSimilar(queryVector, identityId, k);

  const db = await getDb();
  if (!db) return [];

  // Fetch full memory content
  const results: Array<{ id: number; score: number; content: string }> = [];
  for (const { id, score } of similar) {
    const memory = await db
      .select()
      .from(memories)
      .where(eq(memories.id, id))
      .limit(1);
    
    if (memory.length > 0) {
      results.push({
        id,
        score,
        content: memory[0].content,
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Returns true if Gemini Embedding is configured */
export function isVectorSearchConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

/**
 * Simple hash function for text
 */
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Clear the vector cache
 */
export function clearVectorCache(): void {
  vectorCache.clear();
  vectorStore.clear();
}

/**
 * Get cache stats
 */
export function getCacheStats(): { cacheSize: number; storeSize: number } {
  return {
    cacheSize: vectorCache.size,
    storeSize: vectorStore.size,
  };
}
