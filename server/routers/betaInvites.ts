import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  generateBetaInviteCode,
  getAllBetaInviteCodes,
  deactivateBetaInviteCode,
} from "../db/betaInvites";

export const betaInvitesRouter = router({
  generateCode: protectedProcedure
    .input(
      z.object({
        maxUses: z.number().int().positive().optional(),
        expiresInDays: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      const code = await generateBetaInviteCode(ctx.user.id, {
        maxUses: input.maxUses,
        expiresAt: input.expiresInDays
          ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
          : undefined,
      });
      return { code };
    }),

  listCodes: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
      });
    }
    return getAllBetaInviteCodes();
  }),

  deactivateCode: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      await deactivateBetaInviteCode(input.id);
      return { success: true };
    }),
});
