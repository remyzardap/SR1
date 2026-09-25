/**
 * Image Generation Router
 * Generates images via Gemini (with DALL-E fallback) and persists bytes to the
 * configured storage adapter so they appear in the Library.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { generateImage } from "../_core/imageGeneration";
import { getStorageAdapter } from "../storageAdapter";
import { getDb } from "../db";
import { files } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export const imageGenRouter = router({
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

        const adapter = getStorageAdapter();
        const fileName = `generated-image-${Date.now()}`;
        const ext = result.mimeType === "image/jpeg" ? "jpg" : "png";
        const key = `users/${ctx.user.id}/images/${fileName}.${ext}`;
        const stored = await adapter.put(key, result.buffer, result.mimeType);

        const db = await getDb();
        if (db) {
          await db.insert(files).values({
            userId: ctx.user.id,
            name: `${fileName}.${ext}`,
            originalPrompt: input.prompt,
            format: "md",
            kind: "image",
            storageProvider: stored.provider,
            storageRef: stored.key,
            fileKey: stored.key,
            fileUrl: stored.url,
            fileSizeBytes: stored.sizeBytes,
            mimeType: result.mimeType,
          });
        }

        return { url: stored.url, revisedPrompt: result.revisedPrompt };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Image generation failed",
        });
      }
    }),

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
      return rows.filter((r) => r.kind === "image" || r.mimeType?.startsWith("image/"));
    }),
});
