import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  listSpaces,
  getSpace,
  createSpace,
  updateSpace,
  deleteSpace,
  listChatSessions,
  updateChatSessionSpace,
  getFilesByUser,
  moveFileToSpace,
} from "../db";

export const spacesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => listSpaces(ctx.user.id)),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const space = await getSpace(input.id, ctx.user.id);
      if (!space) throw new TRPCError({ code: "NOT_FOUND" });
      return space;
    }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(255), description: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const id = await createSpace(ctx.user.id, input.name, input.description);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1).max(255).optional(), description: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const space = await getSpace(input.id, ctx.user.id);
      if (!space) throw new TRPCError({ code: "NOT_FOUND" });
      await updateSpace(input.id, ctx.user.id, { name: input.name, description: input.description });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const space = await getSpace(input.id, ctx.user.id);
      if (!space) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteSpace(input.id, ctx.user.id);
      return { success: true };
    }),

  chats: protectedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const space = await getSpace(input.spaceId, ctx.user.id);
      if (!space) throw new TRPCError({ code: "NOT_FOUND" });
      return listChatSessions(ctx.user.id, input.spaceId);
    }),

  files: protectedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const space = await getSpace(input.spaceId, ctx.user.id);
      if (!space) throw new TRPCError({ code: "NOT_FOUND" });
      const files = await getFilesByUser(ctx.user.id);
      return files.filter((f) => f.spaceId === input.spaceId && !f.trashed);
    }),

  moveChat: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), spaceId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.spaceId) {
        const space = await getSpace(input.spaceId, ctx.user.id);
        if (!space) throw new TRPCError({ code: "NOT_FOUND" });
      }
      await updateChatSessionSpace(input.sessionId, ctx.user.id, input.spaceId);
      return { success: true };
    }),

  moveFile: protectedProcedure
    .input(z.object({ fileId: z.number(), spaceId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.spaceId) {
        const space = await getSpace(input.spaceId, ctx.user.id);
        if (!space) throw new TRPCError({ code: "NOT_FOUND" });
      }
      await moveFileToSpace(input.fileId, ctx.user.id, input.spaceId);
      return { success: true };
    }),
});
