import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { kemmaExecute, type KemmaMessage } from "../kemma/engine";
import { checkQuota, getQuotaSummary, activateTrial } from "../core/quotaCheck";
import { getDb } from "../db";
import { userQuotas } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { listChatSessions, getChatSessionMessages, createChatSession, deleteChatSession, updateChatSessionTitle } from "../db";

const messageSchema = z.object({ role: z.enum(["user", "assistant", "system", "tool"]), content: z.string().nullable() });

export const kemmaRouter = router({
  execute: protectedProcedure
    .input(z.object({ messages: z.array(messageSchema), isThinking: z.boolean().default(false), isVoice: z.boolean().default(false), sessionId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const msgCheck = await checkQuota(ctx.user.id, "message");
      if (!msgCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: msgCheck.reason ?? "Daily message limit reached" });
      if (input.isThinking) {
        const thinkCheck = await checkQuota(ctx.user.id, "think");
        if (!thinkCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: thinkCheck.reason ?? "Daily Think limit reached" });
      }
      const quota = await getQuotaSummary(ctx.user.id);
      try {
        return await kemmaExecute({ userId: ctx.user.id, userName: ctx.user.name ?? undefined, messages: input.messages as KemmaMessage[], tier: quota.tier, isThinking: input.isThinking, isVoice: input.isVoice });
      } catch (e) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Kemma error: ${(e as Error).message}` });
      }
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
});
