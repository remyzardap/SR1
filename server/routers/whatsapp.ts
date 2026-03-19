import { z } from "zod";
import { createMessageLog, createReceipt, createTask, createProcurement, getMessageLogs } from "../db";
import { extractReceiptData, parseWhatsAppMessage } from "../aiService";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";

export const whatsappRouter = router({
  /**
   * Simulated inbound WhatsApp message handler.
   * In production, wire this to the WhatsApp Cloud API webhook at POST /api/messages/whatsapp
   */
  inbound: publicProcedure
    .input(
      z.object({
        from: z.string().optional(),
        text: z.string().optional(),
        mediaUrl: z.string().optional(),
        mediaType: z.string().optional(),
        businessId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const logEntry = await createMessageLog({
        source: "whatsapp",
        direction: "inbound",
        content: input.text ?? "",
        mediaUrl: input.mediaUrl,
        mediaType: input.mediaType,
        businessId: input.businessId,
        metadata: { from: input.from } as any,
      });

      let processedAs: "receipt" | "task" | "procurement" | "unknown" = "unknown";
      let relatedId: number | undefined;
      let replyMessage = "";

      try {
        // Image → receipt extraction
        if (input.mediaUrl && input.mediaType?.startsWith("image")) {
          const extracted = await extractReceiptData({ imageUrl: input.mediaUrl });
          const receipt = await createReceipt({
            vendor: extracted.vendor ?? undefined,
            date: extracted.date ? new Date(extracted.date) : undefined,
            amount: extracted.amount?.toString(),
            taxAmount: extracted.taxAmount?.toString(),
            currency: extracted.currency,
            category: extracted.category ?? undefined,
            paymentMethod: extracted.paymentMethod ?? undefined,
            description: extracted.description ?? undefined,
            fileUrl: input.mediaUrl,
            rawText: extracted.rawText,
            ocrConfidence: extracted.confidence.toString(),
            status: extracted.needsReview ? "needs_review" : "auto",
            source: "whatsapp",
            businessId: input.businessId,
          });

          processedAs = "receipt";
          relatedId = receipt?.id;
          replyMessage = extracted.needsReview
            ? `Receipt received! I extracted: Vendor: ${extracted.vendor ?? "unknown"}, Amount: ${extracted.currency} ${extracted.amount ?? "unknown"}. Confidence is low — added to Review Queue for your approval.`
            : `Receipt processed! Vendor: ${extracted.vendor ?? "unknown"}, Amount: ${extracted.currency} ${extracted.amount ?? "unknown"}, Category: ${extracted.category ?? "unknown"}. Saved to ledger.`;

          if (extracted.needsReview) {
            await notifyOwner({
              title: "Receipt Needs Review",
              content: `A receipt from WhatsApp needs your review. Vendor: ${extracted.vendor ?? "unknown"}, Amount: ${extracted.amount ?? "unknown"} ${extracted.currency}.`,
            });
          }
        } else if (input.text) {
          // Text → parse intent
          const parsed = await parseWhatsAppMessage(input.text);
          processedAs = parsed.type;

          if (parsed.type === "task") {
            const d = parsed.data as any;
            const task = await createTask({
              text: d.text ?? input.text,
              dueDate: d.dueDate ? new Date(d.dueDate) : undefined,
              category: d.category ?? undefined,
              source: "whatsapp",
              businessId: input.businessId,
              status: "open",
              priority: "medium",
            });
            relatedId = task?.id;
            replyMessage = `Task created: "${d.text ?? input.text}"${d.dueDate ? ` (due: ${d.dueDate})` : ""}. You can view and manage it in the Tasks section.`;
          } else if (parsed.type === "procurement") {
            const d = parsed.data as any;
            const proc = await createProcurement({
              description: d.description ?? input.text,
              quantity: d.quantity ?? 1,
              budgetPerUnit: d.budgetPerUnit?.toString(),
              location: d.location ?? undefined,
              source: "whatsapp",
              businessId: input.businessId,
              status: "open",
              currency: "IDR",
            });
            relatedId = proc?.id;
            replyMessage = `Procurement request created: "${d.description ?? input.text}", Qty: ${d.quantity ?? 1}${d.budgetPerUnit ? `, Budget: IDR ${d.budgetPerUnit}/unit` : ""}. In the future this will search suppliers and return options.`;
          } else if (parsed.type === "receipt") {
            const d = parsed.data as any;
            const receipt = await createReceipt({
              vendor: d.vendor ?? undefined,
              amount: d.amount?.toString(),
              currency: d.currency ?? "IDR",
              description: d.description ?? input.text,
              rawText: input.text,
              status: "needs_review",
              source: "whatsapp",
              businessId: input.businessId,
            });
            relatedId = receipt?.id;
            replyMessage = `Receipt noted: ${d.vendor ?? "unknown vendor"}, Amount: ${d.currency ?? "IDR"} ${d.amount ?? "unknown"}. Added to Review Queue for confirmation.`;
          } else {
            replyMessage = `Message received. I'm not sure how to categorize it — it has been logged. You can view it in the Message Log.`;
          }
        }

        // Log outbound reply
        await createMessageLog({
          source: "whatsapp",
          direction: "outbound",
          content: replyMessage,
          businessId: input.businessId,
          processedAs,
          relatedId,
        });

        return {
          success: true,
          processedAs,
          relatedId,
          reply: replyMessage,
        };
      } catch (err) {
        console.error("[WhatsApp] Processing error:", err);
        return {
          success: false,
          processedAs: "unknown" as const,
          relatedId: undefined,
          reply: "An error occurred while processing your message. Please try again.",
        };
      }
    }),

  logs: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return getMessageLogs(input.limit);
    }),
});
