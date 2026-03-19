/**
 * Image Generation Router (Task 11)
 * Provides AI-powered image generation and history via the Forge API.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { generateImage } from "../_core/imageGeneration";
import { getDb } from "../db";
import { files } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

export const imageGenRouter = router({
  /**
   * Generate an image from a text prompt.
   * Optionally accepts a reference image URL for editing/variation.
   */
  generate: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(2000),
        referenceImageUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await generateImage({
          prompt: input.prompt,
          originalImages: input.referenceImageUrl
            ? [{ url: input.referenceImageUrl, mimeType: "image/jpeg" }]
            : [],
        });

        if (!result.url) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Image generation returned no URL",
          });
        }

        // Save a record to the files table so it appears in My Files
        const db = await getDb();
        if (db) {
          const fileName = `generated-image-${Date.now()}.png`;
          await db.insert(files).values({
            userId: ctx.user.id,
            name: fileName,
            originalPrompt: input.prompt,
            format: "md" as any,
            fileKey: result.url,
            fileUrl: result.url,
            fileSizeBytes: 0,
            mimeType: "image/png",
          });
        }

        return { url: result.url, revisedPrompt: result.revisedPrompt };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Image generation failed",
        });
      }
    }),

  /**
   * List recent generated images for the current user.
   */
  history: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(files)
        .where(eq(files.userId, ctx.user.id))
        .orderBy(desc(files.createdAt))
        .limit(input.limit);
      // Filter to only image files
      return rows.filter((r) => r.mimeType?.startsWith("image/"));
    }),
});
