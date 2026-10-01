import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getBusinessesByUser,
  getBusinessById,
  createBusiness,
  updateBusiness,
  deleteBusiness,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const CURRENCY_OPTIONS = ["IDR", "USD", "EUR", "SGD", "MYR", "AUD", "GBP", "JPY"] as const;

export const businessesRouter = router({
  // ── List all businesses owned by the current user ──────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    return getBusinessesByUser(ctx.user.id);
  }),

  // ── Get a single business by ID (ownership enforced) ──────────────────────
  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const biz = await getBusinessById(input.id, ctx.user.id);
      if (!biz) throw new TRPCError({ code: "NOT_FOUND", message: "Business not found" });
      return biz;
    }),

  // ── Create a new business ─────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Business name is required").max(255),
        currency: z.enum(CURRENCY_OPTIONS).default("IDR"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const biz = await createBusiness({
        ownerId: ctx.user.id,
        name: input.name,
        currency: input.currency,
      });
      if (!biz) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create business" });
      return biz;
    }),

  // ── Update an existing business ───────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(255).optional(),
        currency: z.enum(CURRENCY_OPTIONS).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await getBusinessById(id, ctx.user.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Business not found" });
      const updated = await updateBusiness(id, ctx.user.id, data);
      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update business" });
      return updated;
    }),

  // ── Delete a business ─────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getBusinessById(input.id, ctx.user.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Business not found" });
      await deleteBusiness(input.id, ctx.user.id);
      return { success: true };
    }),
});
