import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { kemmaExecute, type KemmaMessage } from "../kemma/engine";
import { checkQuota, getQuotaSummary, activateTrial } from "../core/quotaCheck";
import { getDb } from "../db";
import { userQuotas, skills } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  listChatSessions,
  getChatSessionMessages,
  createChatSession,
  deleteChatSession,
  updateChatSessionTitle,
  addChatMessage,
  getChatSessionSettings,
  updateChatSessionSettings,
} from "../db";
import { listSelectableModels } from "../core/kemmaRouter";
import { resolveSettings, type ThreadSettings, type MessageSettings, type ChatMode } from "../kemma/settings";

const messageSchema = z.object({ role: z.enum(["user", "assistant", "system", "tool"]), content: z.string().nullable() });

const threadSettingsSchema = z.object({
  model: z.string().optional(),
  mode: z.enum(["fast", "deep", "document", "image"]).optional(),
  allowedTools: z.array(z.string()).optional(),
  pinnedSkills: z.array(z.number()).optional(),
}).passthrough();

const messageSettingsSchema = z.object({
  model: z.string().optional(),
  taggedSkills: z.array(z.number()).optional(),
}).passthrough();

export const kemmaRouter = router({
  execute: protectedProcedure
    .input(z.object({
      messages: z.array(messageSchema),
      isThinking: z.boolean().default(false),
      isVoice: z.boolean().default(false),
      sessionId: z.string().optional(),
      settings: messageSettingsSchema.default({}),
    }))
    .mutation(async ({ ctx, input }) => {
      const msgCheck = await checkQuota(ctx.user.id, "message");
      if (!msgCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: msgCheck.reason ?? "Daily message limit reached" });
      if (input.isThinking) {
        const thinkCheck = await checkQuota(ctx.user.id, "think");
        if (!thinkCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: thinkCheck.reason ?? "Daily Think limit reached" });
      }
      const quota = await getQuotaSummary(ctx.user.id);

      const threadSettings: ThreadSettings = input.sessionId
        ? (await getChatSessionSettings(input.sessionId, ctx.user.id) as ThreadSettings)
        : {};
      const resolved = resolveSettings(threadSettings, input.settings as MessageSettings);

      const skillIds = resolved.skills;
      const db = await getDb();
      let skillRecords: Array<{ id: number; name: string; description: string | null; content: unknown }> = [];
      if (db && skillIds.length > 0) {
        skillRecords = await db.select({ id: skills.id, name: skills.name, description: skills.description, content: skills.content, approved: skills.approved })
          .from(skills)
          .where(inArray(skills.id, skillIds))
          .then((rows) => rows.filter((r) => r.approved));
      }

      try {
        const result = await kemmaExecute({
          userId: ctx.user.id,
          userName: ctx.user.name ?? undefined,
          messages: input.messages as KemmaMessage[],
          tier: quota.tier,
          isThinking: input.isThinking,
          isVoice: input.isVoice,
          sessionId: input.sessionId,
          modelOverride: resolved.model === "auto" ? undefined : resolved.model,
          allowedTools: resolved.allowedTools,
          skills: skillRecords,
        });
        return result;
      } catch (e) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Kemma error: ${(e as Error).message}` });
      }
    }),

  availableModels: protectedProcedure.query(() => listSelectableModels()),

  approvedSkills: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select({ id: skills.id, name: skills.name, description: skills.description })
      .from(skills)
      .where(eq(skills.approved, true))
      .orderBy(skills.name);
  }),

  searchChats: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { searchChatMessages } = await import("../db");
      return searchChatMessages(ctx.user.id, input.query);
    }),

  getSessionSettings: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const sessions = await listChatSessions(ctx.user.id);
      if (!sessions.some((s: any) => s.id === input.sessionId)) throw new TRPCError({ code: "FORBIDDEN" });
      return getChatSessionSettings(input.sessionId, ctx.user.id);
    }),

  updateSessionSettings: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), settings: threadSettingsSchema }))
    .mutation(async ({ ctx, input }) => {
      await updateChatSessionSettings(input.sessionId, ctx.user.id, input.settings as unknown as Record<string, unknown>);
      return { success: true };
    }),

  quota: protectedProcedure.query(async ({ ctx }) => getQuotaSummary(ctx.user.id)),

  activateTrial: protectedProcedure.mutation(async ({ ctx }) => {
    const quota = await getQuotaSummary(ctx.user.id);
    if (quota.tier !== "free") throw new TRPCError({ code: "BAD_REQUEST", message: "Trial can only be activated from free tier" });
    await activateTrial(ctx.user.id);
    return { success: true };
  }),

  setPurgePassword: protectedProcedure
    .input(z.object({ password: z.string().min(4).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const hash = await bcrypt.hash(input.password, 12);
      await db.update(userQuotas).set({ purgePasswordHash: hash }).where(eq(userQuotas.userId, ctx.user.id));
      return { success: true };
    }),

  hasPurgePassword: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { hasPassword: false };
    const rows = await db.select({ purgePasswordHash: userQuotas.purgePasswordHash }).from(userQuotas).where(eq(userQuotas.userId, ctx.user.id)).limit(1);
    return { hasPassword: !!(rows[0]?.purgePasswordHash) };
  }),

  listSessions: protectedProcedure.query(async ({ ctx }) => listChatSessions(ctx.user.id)),

  getMessages: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const sessions = await listChatSessions(ctx.user.id);
      if (!sessions.some((s: any) => s.id === input.sessionId)) throw new TRPCError({ code: "FORBIDDEN" });
      return getChatSessionMessages(input.sessionId);
    }),

  createSession: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => { const id = await createChatSession(ctx.user.id, input.title); return { id }; }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => { await deleteChatSession(input.sessionId, ctx.user.id); return { success: true }; }),

  saveMessage: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      role: z.enum(["user", "assistant", "system", "tool"]),
      content: z.string(),
      model: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sessions = await listChatSessions(ctx.user.id);
      if (!sessions.some((s: any) => s.id === input.sessionId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Session not found" });
      }
      const id = await addChatMessage(input.sessionId, ctx.user.id, input.content, input.role, input.model);
      return { id };
    }),
});
