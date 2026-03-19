import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createProcurement,
  deleteProcurement,
  getProcurementById,
  getProcurements,
  updateProcurement,
  getUserById,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { emailService } from "../services/email";
import {
  generateProcurementApprovedEmail,
  generateProcurementRejectedEmail,
} from "../templates/procurement-email";
import { ENV } from "../_core/env";

export const procurementRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return getProcurements(input);
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const item = await getProcurementById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Procurement request not found" });
      return item;
    }),

  create: protectedProcedure
    .input(
      z.object({
        description: z.string().min(1),
        quantity: z.number().min(1).default(1),
        budgetPerUnit: z.number().optional(),
        totalBudget: z.number().optional(),
        currency: z.string().default("IDR"),
        location: z.string().optional(),
        vendorName: z.string().optional(),
        vendorContact: z.string().optional(),
        source: z.enum(["whatsapp", "web"]).default("web"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const totalBudget =
        input.totalBudget ??
        (input.budgetPerUnit ? input.budgetPerUnit * input.quantity : undefined);
      return createProcurement({
        ...input,
        userId: ctx.user.id,
        budgetPerUnit: input.budgetPerUnit?.toString(),
        totalBudget: totalBudget?.toString(),
        status: "open",
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        description: z.string().optional(),
        quantity: z.number().optional(),
        budgetPerUnit: z.number().optional(),
        totalBudget: z.number().optional(),
        currency: z.string().optional(),
        location: z.string().optional(),
        vendorName: z.string().optional(),
        vendorContact: z.string().optional(),
        status: z
          .enum(["open", "in_review", "approved", "rejected", "completed"])
          .optional(),
        approvalNote: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, budgetPerUnit, totalBudget, ...rest } = input;
      return updateProcurement(id, {
        ...rest,
        budgetPerUnit: budgetPerUnit?.toString(),
        totalBudget: totalBudget?.toString(),
      });
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string().optional() }))
    .mutation(async ({ input }) => {
      const updated = await updateProcurement(input.id, {
        status: "approved",
        approvalNote: input.note,
      });
      // Send approval email notification to requester
      if (updated?.userId) {
        try {
          const requester = await getUserById(updated.userId);
          if (requester?.email) {
            const emailData = {
              businessName: "Sutaeru Business",
              requesterName: requester.name ?? requester.email,
              requesterEmail: requester.email,
              description: updated.description,
              quantity: updated.quantity ?? 1,
              totalBudget: updated.totalBudget ?? undefined,
              currency: updated.currency ?? "IDR",
              vendorName: updated.vendorName ?? undefined,
              location: updated.location ?? undefined,
              approvalNote: input.note,
              procurementId: updated.id,
              dashboardUrl: ENV.appUrl,
            };
            const { subject, html, text } = generateProcurementApprovedEmail(emailData);
            await emailService.sendEmail({ to: requester.email, subject, html, text });
          }
        } catch (e) {
          console.error("[procurement] Failed to send approval email:", e);
        }
      }
      return updated;
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string().optional() }))
    .mutation(async ({ input }) => {
      const updated = await updateProcurement(input.id, {
        status: "rejected",
        approvalNote: input.note,
      });
      // Send rejection email notification to requester
      if (updated?.userId) {
        try {
          const requester = await getUserById(updated.userId);
          if (requester?.email) {
            const emailData = {
              businessName: "Sutaeru Business",
              requesterName: requester.name ?? requester.email,
              requesterEmail: requester.email,
              description: updated.description,
              quantity: updated.quantity ?? 1,
              totalBudget: updated.totalBudget ?? undefined,
              currency: updated.currency ?? "IDR",
              vendorName: updated.vendorName ?? undefined,
              location: updated.location ?? undefined,
              approvalNote: input.note,
              procurementId: updated.id,
              dashboardUrl: ENV.appUrl,
            };
            const { subject, html, text } = generateProcurementRejectedEmail(emailData);
            await emailService.sendEmail({ to: requester.email, subject, html, text });
          }
        } catch (e) {
          console.error("[procurement] Failed to send rejection email:", e);
        }
      }
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteProcurement(input.id);
      return { success: true };
    }),
});
