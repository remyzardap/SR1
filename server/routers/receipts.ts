import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createReceipt,
  deleteReceipt,
  getReceiptById,
  getReceipts,
  getReceiptsNeedingReview,
  updateReceipt,
} from "../db";
import { extractReceiptData } from "../aiService";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const receiptStatusEnum = z.enum(["auto", "needs_review", "approved", "rejected"]);

export const receiptsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return getReceipts(input);
    }),

  needsReview: protectedProcedure.query(async () => {
    return getReceiptsNeedingReview();
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const receipt = await getReceiptById(input.id);
      if (!receipt) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found" });
      return receipt;
    }),

  create: protectedProcedure
    .input(
      z.object({
        vendor: z.string().optional(),
        date: z.string().optional(),
        amount: z.number().optional(),
        taxAmount: z.number().optional(),
        currency: z.string().default("IDR"),
        category: z.string().optional(),
        paymentMethod: z.string().optional(),
        description: z.string().optional(),
        fileUrl: z.string().optional(),
        fileKey: z.string().optional(),
        status: receiptStatusEnum.default("auto"),
        source: z.enum(["whatsapp", "web"]).default("web"),
        rawText: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const receipt = await createReceipt({
        ...input,
        userId: ctx.user.id,
        date: input.date ? new Date(input.date) : undefined,
        amount: input.amount?.toString(),
        taxAmount: input.taxAmount?.toString(),
      });
      return receipt;
    }),

  extractFromText: protectedProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ input }) => {
      return extractReceiptData({ text: input.text });
    }),

  extractFromImage: protectedProcedure
    .input(z.object({ imageUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      return extractReceiptData({ imageUrl: input.imageUrl });
    }),

  uploadAndExtract: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileBase64: z.string(),
        mimeType: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const suffix = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      const fileKey = `receipts/${ctx.user.id}/${suffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      const extracted = await extractReceiptData({ imageUrl: url });

      const receipt = await createReceipt({
        userId: ctx.user.id,
        vendor: extracted.vendor ?? undefined,
        date: extracted.date ? new Date(extracted.date) : undefined,
        amount: extracted.amount?.toString(),
        taxAmount: extracted.taxAmount?.toString(),
        currency: extracted.currency,
        category: extracted.category ?? undefined,
        paymentMethod: extracted.paymentMethod ?? undefined,
        description: extracted.description ?? undefined,
        fileUrl: url,
        fileKey,
        rawText: extracted.rawText,
        ocrConfidence: extracted.confidence.toString(),
        status: extracted.needsReview ? "needs_review" : "auto",
        source: "web",
      });

      return { receipt, extracted };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        vendor: z.string().optional(),
        date: z.string().optional(),
        amount: z.number().optional(),
        taxAmount: z.number().optional(),
        currency: z.string().optional(),
        category: z.string().optional(),
        paymentMethod: z.string().optional(),
        description: z.string().optional(),
        status: receiptStatusEnum.optional(),
        rejectionNote: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, date, amount, taxAmount, ...rest } = input;
      return updateReceipt(id, {
        ...rest,
        date: date ? new Date(date) : undefined,
        amount: amount?.toString(),
        taxAmount: taxAmount?.toString(),
      });
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return updateReceipt(input.id, { status: "approved" });
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string().optional() }))
    .mutation(async ({ input }) => {
      return updateReceipt(input.id, { status: "rejected", rejectionNote: input.note });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteReceipt(input.id);
      return { success: true };
    }),
});
