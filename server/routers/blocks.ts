/**
 * Blocks tRPC Router
 *
 * Universal block system — every piece of content in Sutaeru is a block.
 * Chat responses, Atelier sections, memories, transcripts, media, notes.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { getDb } from "../db";
import { blocks } from "../../drizzle/schema";
import { eq, and, desc, asc, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

const BlockTypeEnum = z.enum(["chat", "atelier", "memory", "task", "media", "transcript", "widget", "note"]);
const BlockSourceEnum = z.enum(["s1", "atelier", "kemma", "user", "feed", "system"]);

export const blocksRouter = router({

  // ── Create a block ────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      type: BlockTypeEnum,
      source: BlockSourceEnum.default("user"),
      parentId: z.string().optional(),
      sessionId: z.string().optional(),
      title: z.string().optional(),
      content: z.record(z.string(), z.any()),
      agentId: z.string().optional(),
      tags: z.array(z.string()).default([]),
      pinned: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const id = randomUUID();
      const [block] = await db.insert(blocks).values({
        id,
        userId: ctx.user.id,
        type: input.type,
        source: input.source,
        parentId: input.parentId,
        sessionId: input.sessionId,
        title: input.title,
        content: input.content,
        agentId: input.agentId,
        tags: input.tags,
        pinned: input.pinned,
      }).returning();
      return block;
    }),

  // ── List blocks (with filters) ────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      type: BlockTypeEnum.optional(),
      source: BlockSourceEnum.optional(),
      parentId: z.string().nullable().optional(),
      sessionId: z.string().optional(),
      pinned: z.boolean().optional(),
      archived: z.boolean().default(false),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = [
        eq(blocks.userId, ctx.user.id),
        eq(blocks.archived, input.archived),
      ];
      if (input.type)     conditions.push(eq(blocks.type, input.type));
      if (input.source)   conditions.push(eq(blocks.source, input.source));
      if (input.sessionId) conditions.push(eq(blocks.sessionId, input.sessionId));
      if (input.pinned !== undefined) conditions.push(eq(blocks.pinned, input.pinned));
      if (input.parentId === null) conditions.push(isNull(blocks.parentId));
      else if (input.parentId) conditions.push(eq(blocks.parentId, input.parentId));

      return db.select().from(blocks)
        .where(and(...conditions))
        .orderBy(desc(blocks.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // ── Get single block ──────────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [block] = await db.select().from(blocks)
        .where(and(eq(blocks.id, input.id), eq(blocks.userId, ctx.user.id)));
      return block ?? null;
    }),

  // ── Update block ──────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      content: z.record(z.string(), z.unknown()).optional(),
      tags: z.array(z.string()).optional(),
      pinned: z.boolean().optional(),
      locked: z.boolean().optional(),
      archived: z.boolean().optional(),
      position: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { id, ...updates } = input;
      const [block] = await db.update(blocks)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(blocks.id, id), eq(blocks.userId, ctx.user.id)))
        .returning();
      return block;
    }),

  // ── Delete block ──────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(blocks)
        .where(and(eq(blocks.id, input.id), eq(blocks.userId, ctx.user.id)));
      return { success: true };
    }),

  // ── Pin / unpin ───────────────────────────────────────────────────────────
  togglePin: protectedProcedure
    .input(z.object({ id: z.string(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [block] = await db.update(blocks)
        .set({ pinned: input.pinned, updatedAt: new Date() })
        .where(and(eq(blocks.id, input.id), eq(blocks.userId, ctx.user.id)))
        .returning();
      return block;
    }),

  // ── Fork a block (clone with new parentId) ────────────────────────────────
  fork: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [original] = await db.select().from(blocks)
        .where(and(eq(blocks.id, input.id), eq(blocks.userId, ctx.user.id)));
      if (!original) throw new Error("Block not found");

      const [forked] = await db.insert(blocks).values({
        id: randomUUID(),
        userId: ctx.user.id,
        type: original.type,
        source: "user",
        parentId: original.id, // forked from original
        sessionId: original.sessionId,
        title: original.title ? `Fork of ${original.title}` : undefined,
        content: original.content as Record<string, unknown>,
        agentId: original.agentId,
        tags: original.tags as string[],
        pinned: false,
        locked: false,
      }).returning();
      return forked;
    }),

  // ── Get pinned blocks for Board ───────────────────────────────────────────
  pinned: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(blocks)
        .where(and(
          eq(blocks.userId, ctx.user.id),
          eq(blocks.pinned, true),
          eq(blocks.archived, false),
        ))
        .orderBy(asc(blocks.position), desc(blocks.updatedAt));
    }),

  // ── Reorder pinned blocks ─────────────────────────────────────────────────
  reorder: protectedProcedure
    .input(z.object({
      items: z.array(z.object({ id: z.string(), position: z.number() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await Promise.all(input.items.map((item) =>
        db.update(blocks)
          .set({ position: item.position, updatedAt: new Date() })
          .where(and(eq(blocks.id, item.id), eq(blocks.userId, ctx.user.id)))
      ));
      return { success: true };
    }),
});
