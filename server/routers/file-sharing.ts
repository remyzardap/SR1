import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { fileShares, files } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { getDb } from "../db";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string, hash: string): boolean {
  const inputHash = createHash("sha256").update(password).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(inputHash), Buffer.from(hash));
  } catch {
    return false;
  }
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export const fileSharingRouter = router({
  createShareLink: protectedProcedure
    .input(z.object({
      fileId: z.number().int().positive(),
      options: z.object({
        expiresInHours: z.number().min(1).max(720).optional(),
        maxAccessCount: z.number().min(1).optional(),
        password: z.string().min(4).max(100).optional(),
      }).default({}),
    }))
    .mutation(async ({ ctx, input }) => {
      const { fileId, options } = input;
      const now = Date.now();

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const file = await db.select().from(files).where(eq(files.id, fileId)).limit(1);

      if (!file[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      }

      if (file[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to share this file" });
      }

      const expiresAt = options.expiresInHours
        ? now + options.expiresInHours * 60 * 60 * 1000
        : undefined;

      const passwordHash = options.password ? hashPassword(options.password) : undefined;
      const token = generateToken();
      const id = nanoid();

      await db.insert(fileShares).values({
        id,
        fileId,
        identityId: ctx.user.id,
        token,
        expiresAt,
        accessCount: 0,
        maxAccessCount: options.maxAccessCount,
        passwordHash,
      });

      return {
        id,
        token,
        shareUrl: `${process.env.APP_URL}/share/${token}`,
        expiresAt,
        maxAccessCount: options.maxAccessCount,
        hasPassword: !!options.password,
      };
    }),

  revokeShareLink: protectedProcedure
    .input(z.object({ shareId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const share = await db.select().from(fileShares).where(eq(fileShares.id, input.shareId)).limit(1);

      if (!share[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Share link not found" });
      if (share[0].identityId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "No permission" });

      await db.delete(fileShares).where(eq(fileShares.id, input.shareId));
      return { success: true };
    }),

  listShareLinks: protectedProcedure
    .input(z.object({ fileId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const shares = await db.select().from(fileShares).where(eq(fileShares.fileId, input.fileId));

      return shares
        .filter((s) => s.identityId === ctx.user.id)
        .sort((a, b) => (b.createdAt instanceof Date ? b.createdAt.getTime() : 0) - (a.createdAt instanceof Date ? a.createdAt.getTime() : 0))
        .map((share) => ({
          id: share.id,
          shareUrl: `${process.env.APP_URL}/share/${share.token}`,
          createdAt: share.createdAt,
          expiresAt: share.expiresAt,
          accessCount: share.accessCount,
          maxAccessCount: share.maxAccessCount,
          hasPassword: !!share.passwordHash,
          isExpired: share.expiresAt ? share.expiresAt < Date.now() : false,
          isExhausted: share.maxAccessCount ? (share.accessCount ?? 0) >= share.maxAccessCount : false,
        }));
    }),

  getSharedFile: publicProcedure
    .input(z.object({ token: z.string(), password: z.string().optional() }))
    .query(async ({ input }) => {
      const { token, password } = input;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const share = await db.select().from(fileShares).where(eq(fileShares.token, token)).limit(1);

      if (!share[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Share link not found or expired" });

      const s = share[0];

      if (s.expiresAt && s.expiresAt < Date.now()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share link has expired" });
      }

      if (s.maxAccessCount && (s.accessCount ?? 0) >= s.maxAccessCount) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share link access limit reached" });
      }

      if (s.passwordHash) {
        if (!password) throw new TRPCError({ code: "UNAUTHORIZED", message: "Password required" });
        if (!verifyPassword(password, s.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid password" });
        }
      }

      await db.update(fileShares).set({
        accessCount: sql`${fileShares.accessCount} + 1`,
      }).where(eq(fileShares.id, s.id));

      const file = await db.select().from(files).where(eq(files.id, s.fileId)).limit(1);
      if (!file[0]) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });

      return {
        file: {
          id: file[0].id,
          name: file[0].name,
          mimeType: file[0].mimeType,
          url: file[0].fileUrl,
        },
        accessCount: (s.accessCount ?? 0) + 1,
        maxAccessCount: s.maxAccessCount,
      };
    }),
});
