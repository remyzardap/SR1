import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { identities } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import speakeasy from "speakeasy";
import qrcode from "qrcode";
import { getSessionCookieOptions } from "./_core/cookies";
import { sendPasswordResetEmail, sendEmailVerification } from "./_core/email";
import { systemRouter } from "./_core/systemRouter";
import { embed, upsertVector, removeVector, searchSimilar, isVectorSearchConfigured } from "./services/vectorSearch";
import { auditRouter } from "./routers/audit";
import { agentsRouter } from "./routers/agents";
import { fileSharingRouter } from "./routers/file-sharing";
import { kemmaRouter } from "./routers/kemma";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  createFile,
  getFilesByUser,
  getFileById,
  renameFile,
  deleteFile,
  upsertApiKey,
  getApiKeyByUser,
  getAllUsersWithStats,
  getOrCreateIdentity,
  upsertIdentity,
  getIdentityByHandle,
  getSkillsByIdentity,
  createSkill,
  deleteSkill,
  getMemoriesByIdentity,
  createMemory,
  deleteMemory,
  getConnectionsByIdentity,
  addConnection,
  revokeConnection,
  getPublicSkills,
  getPublicSkillsByHandle,
  cloneSkillToIdentity,
  getUserByEmail,
  getUserByHandle,
  getUserById,
  setUserPasswordHash,
  upsertUser,
  createPasswordResetToken,
  getPasswordResetToken,
  deletePasswordResetToken,
  markUserOnboarded,
  setUserTotpSecret,
  setUserTotpEnabled,
  createEmailVerificationToken,
  getEmailVerificationToken,
  deleteEmailVerificationToken,
  markEmailVerified,
  listChatSessions,
  getChatSessionMessages,
  createChatSession,
  updateChatSessionTitle,
  deleteChatSession,
} from "./db";
import { generateStyleOptions, generateDocumentContent } from "./llmProvider";
import { generateFile, STYLE_DEFINITIONS } from "./fileGenerator";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";
import { sdk } from "./_core/sdk";
import { receiptsRouter } from "./routers/receipts";
import { tasksRouter } from "./routers/tasks";
import { procurementRouter } from "./routers/procurement";
import { reportsRouter } from "./routers/reports";
import { whatsappRouter } from "./routers/whatsapp";
import { paymentsRouter } from "./routers/payments";
import { agentRouter } from "./routers/agent";
import { businessesRouter } from "./routers/businesses";
import { imageGenRouter } from "./routers/imageGen";
import { healthRouter } from "./routers/health";
import { kpisRouter } from "./routers/kpis";
import { betaInvitesRouter } from "./routers/betaInvites";
import { blocksRouter } from "./routers/blocks";
import { googleRouter } from "./routers/google";
import { telegramRouter } from "./routers/telegramRouter";
import { openclawRouter } from "./routers/openclawRouter";

const FORMAT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  md: "text/markdown",
};

// Helper: get user's API key config or null
async function getUserLLMConfig(userId: number) {
  const keyRecord = await getApiKeyByUser(userId);
  if (!keyRecord) return null;
  return { provider: keyRecord.provider, apiKey: keyRecord.encryptedKey } as {
    provider: "kimi" | "openai" | "gemini";
    apiKey: string;
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => {
      if (!opts.ctx.user) return null;
      const { passwordHash, totpSecret, ...safeUser } = opts.ctx.user;
      return safeUser;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    register: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        email: z.string().email(),
        password: z.string().min(8).max(128),
        inviteCode: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const betaMode = process.env.BETA_MODE === "true";
        if (betaMode && !input.inviteCode) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This is a closed beta. Please provide an invite code to register." });
        }
        const existing = await getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
        }
        const openId = `email:${nanoid(21)}`;
        const passwordHash = await bcrypt.hash(input.password, 12);
        await upsertUser({ openId, name: input.name, email: input.email, loginMethod: "email", lastSignedIn: new Date() });
        await setUserPasswordHash(openId, passwordHash);
        const user = await getUserByEmail(input.email);
        if (user?.id) {
          await getOrCreateIdentity(user.id).catch(() => {});
          if (input.inviteCode) {
            const { useBetaInviteCode } = await import("./db/betaInvites");
            const result = await useBetaInviteCode(input.inviteCode, user.id);
            if (!result.valid) {
              throw new TRPCError({ code: "BAD_REQUEST", message: result.reason || "Invalid invite code" });
            }
          }
          // Send email verification (non-blocking — failure must not break registration)
          try {
            const verifyToken = crypto.randomBytes(32).toString("hex");
            const ONE_DAY = 24 * 60 * 60 * 1000;
            await createEmailVerificationToken(user.id, verifyToken, new Date(Date.now() + ONE_DAY));
            await sendEmailVerification(input.email, verifyToken);
          } catch (emailErr) {
            console.warn("[Auth] Failed to send verification email:", emailErr);
          }
        }
        const sessionToken = await sdk.createSessionToken(openId, { name: input.name, expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true } as const;
      }),

    verifyEmail: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const record = await getEmailVerificationToken(input.token);
        if (!record || record.expiresAt < new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired verification link." });
        }
        await markEmailVerified(record.userId);
        await deleteEmailVerificationToken(input.token);
        return { success: true };
      }),

    resendVerificationEmail: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No email address on file." });
      }
      if (ctx.user.emailVerified) {
        return { success: true, alreadyVerified: true };
      }
      const verifyToken = crypto.randomBytes(32).toString("hex");
      const ONE_DAY = 24 * 60 * 60 * 1000;
      await createEmailVerificationToken(ctx.user.id, verifyToken, new Date(Date.now() + ONE_DAY));
      await sendEmailVerification(ctx.user.email, verifyToken);
      return { success: true, alreadyVerified: false };
    }),
    login: publicProcedure
      .input(z.object({
        email: z.string().min(1), // accepts email or @handle
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // Resolve user by email or by handle (for founders who have no email)
        const isEmail = input.email.includes("@") && input.email.includes(".");
        const handle = input.email.startsWith("@") ? input.email.slice(1) : input.email;
        const user = isEmail
          ? await getUserByEmail(input.email)
          : await getUserByHandle(handle);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email/handle or password." });
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email/handle or password." });
        }
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "", expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true, token: sessionToken } as const;
      }),
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        if (user) {
          const token = crypto.randomBytes(32).toString("hex");
          const ONE_HOUR = 60 * 60 * 1000;
          const expiresAt = new Date(Date.now() + ONE_HOUR);
          await createPasswordResetToken(user.id, token, expiresAt);
          await sendPasswordResetEmail(user.email!, token);
        }
        // Always return success to prevent email enumeration
        return { success: true };
      }),

    resetPassword: publicProcedure
      .input(z.object({
        token: z.string(),
        password: z.string().min(8).max(128),
      }))
      .mutation(async ({ input }) => {
        const tokenRecord = await getPasswordResetToken(input.token);
        if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired password reset token." });
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        const user = await getUserById(tokenRecord.userId);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User not found." });
        }
        await setUserPasswordHash(user.openId, passwordHash);
        await deletePasswordResetToken(input.token);
        return { success: true };
      }),

    // ─── 2FA / TOTP ────────────────────────────────────────────────────────
    setup2fa: protectedProcedure.mutation(async ({ ctx }) => {
      const email = ctx.user.email || ctx.user.name || "user";
      const generated = speakeasy.generateSecret({ name: `Sutaeru (${email})`, length: 20 });
      await setUserTotpSecret(ctx.user.id, generated.base32);
      const qrDataUrl = await qrcode.toDataURL(generated.otpauth_url!);
      return { qrDataUrl, secret: generated.base32 };
    }),

    verify2fa: protectedProcedure
      .input(z.object({ token: z.string().length(6) }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserById(ctx.user.id);
        if (!user?.totpSecret) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "2FA not set up. Please generate a QR code first." });
        }
        const isValid = speakeasy.totp.verify({ secret: user.totpSecret, encoding: "base32", token: input.token, window: 1 });
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid code. Please try again." });
        }
        await setUserTotpEnabled(ctx.user.id, true);
        return { success: true };
      }),

    disable2fa: protectedProcedure
      .input(z.object({ token: z.string().length(6) }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserById(ctx.user.id);
        if (!user?.totpSecret || !user.totpEnabled) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "2FA is not enabled." });
        }
        const isValid = speakeasy.totp.verify({ secret: user.totpSecret, encoding: "base32", token: input.token, window: 1 });
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid code. Please try again." });
        }
        await setUserTotpEnabled(ctx.user.id, false);
        await setUserTotpSecret(ctx.user.id, null);
        return { success: true };
      }),

    login2fa: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1), token: z.string().length(6) }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
        }
        if (!user.totpSecret) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "2FA not configured." });
        }
        const isValid = speakeasy.totp.verify({ secret: user.totpSecret, encoding: "base32", token: input.token, window: 1 });
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid authenticator code." });
        }
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "", expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true };
      }),

    check2faRequired: publicProcedure
      .input(z.object({ email: z.string().min(1) }))
      .query(async ({ input }) => {
        const isEmail = input.email.includes("@") && input.email.includes(".");
        const handle = input.email.startsWith("@") ? input.email.slice(1) : input.email;
        const user = isEmail ? await getUserByEmail(input.email) : await getUserByHandle(handle);
        return { required: !!(user?.totpEnabled) };
      }),

    get2faStatus: protectedProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      return { enabled: !!(user?.totpEnabled) };
    }),

    // ─── Founder handle-based login (exclusive) ────────────────────────────────
    founderLogin: publicProcedure
      .input(z.object({
        handle: z.string().min(1).max(64),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const identity = await db.select().from(identities).where(eq(identities.handle, input.handle.toLowerCase())).limit(1);
        if (!identity[0]) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid handle or password." });
        }
        const user = await getUserById(identity[0].userId);
        if (!user || user.loginMethod !== "founder" || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid handle or password." });
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid handle or password." });
        }
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "", expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true, token: sessionToken };
      }),
  }),

  // ─── Files router ───────────────────────────────────────────────────────────
  files: router({
    // Step 1: generate style options for a prompt
    getStyleOptions: protectedProcedure
      .input(
        z.object({
          prompt: z.string().min(3).max(2000),
          format: z.enum(["pdf", "docx", "xlsx", "pptx", "md"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const llmConfig = await getUserLLMConfig(ctx.user.id);
        const aiOptions = await generateStyleOptions(
          input.prompt,
          input.format,
          llmConfig
        );
        // Merge AI-generated options with our predefined visual styles
        return STYLE_DEFINITIONS.map((styleDef, i) => ({
          ...styleDef,
          label: aiOptions[i]?.label ?? styleDef.label,
          description: aiOptions[i]?.description ?? styleDef.description,
          previewText: aiOptions[i]?.previewText ?? "",
        }));
      }),

    // Step 2: generate the actual file
    generate: protectedProcedure
      .input(
        z.object({
          prompt: z.string().min(3).max(2000),
          format: z.enum(["pdf", "docx", "xlsx", "pptx", "md"]),
          styleId: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const style = STYLE_DEFINITIONS.find((s) => s.id === input.styleId);
        if (!style) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid style" });

        const llmConfig = await getUserLLMConfig(ctx.user.id);

        // Generate document content via LLM
        const content = await generateDocumentContent(
          input.prompt,
          input.format,
          style.label,
          llmConfig
        );

        // Generate file bytes
        const generated = await generateFile(content, input.format, style);

        // Upload to S3
        const suffix = nanoid(8);
        const safeName = content.title.replace(/[^a-z0-9]/gi, "_").substring(0, 40);
        const fileKey = `user-${ctx.user.id}/files/${safeName}-${suffix}.${generated.extension}`;
        const { url } = await storagePut(fileKey, generated.buffer, generated.mimeType);

        // Save metadata to DB
        await createFile({
          userId: ctx.user.id,
          name: content.title,
          originalPrompt: input.prompt,
          format: input.format,
          styleLabel: style.label,
          fileKey,
          fileUrl: url,
          fileSizeBytes: generated.buffer.length,
          mimeType: generated.mimeType,
        });

        // Fetch the newly created record
        const userFiles = await getFilesByUser(ctx.user.id);
        const newFile = userFiles[userFiles.length - 1];

        return { file: newFile, downloadUrl: url };
      }),

    // List all files for the current user
    list: protectedProcedure.query(async ({ ctx }) => {
      return getFilesByUser(ctx.user.id);
    }),

    // Rename a file
    rename: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        const file = await getFileById(input.id, ctx.user.id);
        if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
        await renameFile(input.id, ctx.user.id, input.name);
        return { success: true };
      }),

    // Delete a file
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteFile(input.id, ctx.user.id);
        return { success: true };
      }),

    // Get a single file record (for preview/download)
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const file = await getFileById(input.id, ctx.user.id);
        if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
        return file;
      }),
  }),

  // ─── Settings router ────────────────────────────────────────────────────────
  // ─── Back Office routers ──────────────────────────────────────────────────
  businesses: businessesRouter,
  receipts: receiptsRouter,
  tasks: tasksRouter,
  procurement: procurementRouter,
  reports: reportsRouter,
  whatsapp: whatsappRouter,
  blocks: blocksRouter,
  google: googleRouter,
  telegram: telegramRouter,
  openclaw: openclawRouter,
  payments: paymentsRouter,
  agent: agentRouter,
  imageGen: imageGenRouter,
  health: healthRouter,
  kpis: kpisRouter,
  kemma: kemmaRouter,
  // ─── Settings router ────────────────────────────────────────────────────────
  settings: router({
    saveApiKey: protectedProcedure
      .input(
        z.object({
          provider: z.enum(["kimi", "openai", "gemini", "anthropic"]),
          apiKey: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await upsertApiKey({
          userId: ctx.user.id,
          provider: input.provider,
          encryptedKey: input.apiKey,
        });
        return { success: true };
      }),

    getApiKey: protectedProcedure.query(async ({ ctx }) => {
      const record = await getApiKeyByUser(ctx.user.id);
      if (!record) return null;
      // Mask the key for display
      const masked =
        record.encryptedKey.length > 8
          ? record.encryptedKey.substring(0, 4) +
            "•".repeat(record.encryptedKey.length - 8) +
            record.encryptedKey.slice(-4)
          : "••••••••";
      return { provider: record.provider, maskedKey: masked };
    }),

    clearApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { apiKeys } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) await db.delete(apiKeys).where(eq(apiKeys.userId, ctx.user.id));
      return { success: true };
    }),

    // ─── Avatar upload ─────────────────────────────────────────────────────
    uploadAvatar: protectedProcedure
      .input(
        z.object({
          // base64-encoded image data (without the data: prefix)
          base64: z.string().min(1),
          mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.mimeType.split("/")[1] ?? "jpg";
        const fileKey = `user-${ctx.user.id}/avatars/avatar-${nanoid(8)}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        // Persist the avatar URL on the identity
        await upsertIdentity(ctx.user.id, { avatarUrl: url });
        return { url };
      }),
  }),
  // ─── Sutaeru: Identity router ─────────────────────────────────────────────────────────
  identity: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const identity = await getOrCreateIdentity(ctx.user.id);
      return identity;
    }),
    upsert: protectedProcedure
      .input(
        z.object({
          handle: z.string().max(64).optional(),
          displayName: z.string().max(255).optional(),
          bio: z.string().optional(),
          avatarUrl: z.string().url().optional().or(z.literal("")),
          personalityTraits: z.array(z.string()).optional(),
          primaryLanguage: z.string().max(64).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Check handle uniqueness before upserting
        if (input.handle) {
          const existing = await getIdentityByHandle(input.handle);
          if (existing && existing.userId !== ctx.user.id) {
            throw new TRPCError({ code: "CONFLICT", message: `The handle @${input.handle} is already taken.` });
          }
        }
        const identity = await upsertIdentity(ctx.user.id, input);
        return identity;
      }),
    completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
      await markUserOnboarded(ctx.user.id);
      return { success: true };
    }),
    getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
      return { onboarded: ctx.user.onboarded ?? false };
    }),
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const identity = await getOrCreateIdentity(ctx.user.id);
      if (!identity) return { skillsCount: 0, memoriesCount: 0, connectionsCount: 0 };
      const [skills, memories, connections] = await Promise.all([
        getSkillsByIdentity(identity.id),
        getMemoriesByIdentity(identity.id),
        getConnectionsByIdentity(identity.id),
      ]);
      return {
        skillsCount: skills.length,
        memoriesCount: memories.length,
        connectionsCount: connections.length,
      };
    }),
    uploadAvatar: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileBase64: z.string(),
          mimeType: z.string().refine((m) => m.startsWith("image/"), { message: "Only image files are allowed" }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "jpg";
        const fileKey = `avatars/${ctx.user.id}/${Date.now()}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        await upsertIdentity(ctx.user.id, { avatarUrl: url });
        return { url };
      }),
    saveNotificationPrefs: protectedProcedure
      .input(
        z.object({
          emailDigest: z.boolean(),
          memoryAlerts: z.boolean(),
          skillUpdates: z.boolean(),
          connectionAlerts: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await upsertIdentity(ctx.user.id, { notificationPrefs: input });
        return { success: true };
      }),
    getNotificationPrefs: protectedProcedure.query(async ({ ctx }) => {
      const identity = await getOrCreateIdentity(ctx.user.id);
      return identity?.notificationPrefs ?? {
        emailDigest: true,
        memoryAlerts: false,
        skillUpdates: true,
        connectionAlerts: true,
      };
    }),
  }),

  // ─── Sutaeru: Skills router ───────────────────────────────────────────────────
  skills: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const identity = await getOrCreateIdentity(ctx.user.id);
      if (!identity) return [];
      return getSkillsByIdentity(identity.id);
    }),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          description: z.string().optional(),
          type: z.enum(["prompt", "workflow", "tool_definition", "behavior"]),
          content: z.any(),
          sourceModel: z.string().max(128).optional(),
          isPublic: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const identity = await getOrCreateIdentity(ctx.user.id);
        if (!identity) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Identity not found" });
        await createSkill({ ...input, identityId: identity.id });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const identity = await getOrCreateIdentity(ctx.user.id);
        if (!identity) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Identity not found" });
        await deleteSkill(input.id, identity.id);
        return { success: true };
      }),
    discover: protectedProcedure.query(async () => {
      return getPublicSkills();
    }),
    collect: protectedProcedure
      .input(z.object({ skillId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const identity = await getOrCreateIdentity(ctx.user.id);
        if (!identity) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Identity not found" });
        await cloneSkillToIdentity(input.skillId, identity.id);
        return { success: true };
      }),
    // ─── Skill ratings (stubs — full implementation from Kimi Agent 2) ─────────
    rateSkill: protectedProcedure
      .input(z.object({ skillId: z.string(), userId: z.string(), rating: z.number().min(1).max(5) }))
      .mutation(async () => {
        // TODO: implement with skill_ratings table (Kimi Agent 2 Task 5)
        return { success: true };
      }),
    getReviews: publicProcedure
      .input(z.object({ skillId: z.string() }))
      .query(async () => {
        // TODO: implement with skill_reviews table (Kimi Agent 2 Task 5)
        return [] as { id: string; authorName: string; rating: number; comment: string; createdAt: number }[];
      }),
    submitReview: protectedProcedure
      .input(z.object({ skillId: z.string(), userId: z.string(), rating: z.number().min(1).max(5), comment: z.string() }))
      .mutation(async () => {
        // TODO: implement with skill_reviews table (Kimi Agent 2 Task 5)
        return { success: true };
      }),
  }),

  // ─── Sutaeru: Memories router ─────────────────────────────────────────────────
  memories: router({
    list: protectedProcedure
      .input(z.object({ type: z.enum(["preference", "project", "document", "interaction", "fact"]).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const identity = await getOrCreateIdentity(ctx.user.id);
        if (!identity) return [];
        return getMemoriesByIdentity(identity.id, input?.type);
      }),
    create: protectedProcedure
      .input(
        z.object({
          type: z.enum(["preference", "project", "document", "interaction", "fact"]),
          title: z.string().max(255).optional(),
          content: z.string().min(1),
          tags: z.string().optional(),
          sourceApp: z.string().max(128).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const identity = await getOrCreateIdentity(ctx.user.id);
        if (!identity) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Identity not found" });
        const tagsArray = input.tags ? input.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
        const memory = await createMemory({
          identityId: identity.id,
          type: input.type,
          title: input.title,
          content: input.content,
          tags: tagsArray,
          sourceApp: input.sourceApp,
        });
        // Async vector upsert — does not block response, gracefully skips if not configured
        if (memory && isVectorSearchConfigured()) {
          embed(`${input.title ?? ""} ${input.content}`)
            .then((vector) => upsertVector(memory.id, vector, identity.id))
            .catch((err) => console.warn("[VectorSearch] upsert failed:", err));
        }
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const identity = await getOrCreateIdentity(ctx.user.id);
        if (!identity) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Identity not found" });
        await deleteMemory(input.id, identity.id);
        // Remove from vector index (non-blocking)
        if (isVectorSearchConfigured()) {
          removeVector(input.id).catch((err) => console.warn("[VectorSearch] remove failed:", err));
        }
        return { success: true };
      }),
    // Semantic context retrieval for chat — returns the most relevant memories for a given message
    getContext: protectedProcedure
      .input(z.object({
        message: z.string().min(1),
        maxSemantic: z.number().int().min(1).max(10).default(3),
        maxRecent: z.number().int().min(1).max(5).default(2),
      }))
      .query(async ({ ctx, input }) => {
        const identity = await getOrCreateIdentity(ctx.user.id);
        if (!identity) return { context: "", memories: [], source: "none" as const };
        // If Vertex AI is configured, do semantic search
        if (isVectorSearchConfigured()) {
          try {
            const queryVector = await embed(input.message);
            const similar = await searchSimilar(queryVector, identity.id, input.maxSemantic);
            if (similar.length > 0) {
              const allMemories = await getMemoriesByIdentity(identity.id);
              const ids = similar.map((s) => s.id);
              const semanticMemories = ids
                .map((id) => allMemories.find((m) => m.id === id))
                .filter((m): m is NonNullable<typeof m> => Boolean(m));
              const recentMemories = allMemories
                .filter((m) => !ids.includes(m.id))
                .slice(0, input.maxRecent);
              const combined = [...semanticMemories, ...recentMemories];
              return {
                context: combined.map((m) => `[${m.type}] ${m.title ?? ""}: ${m.content}`).join("\n"),
                memories: combined,
                source: "semantic" as const,
              };
            }
          } catch (err) {
            console.warn("[VectorSearch] semantic search failed, falling back to recent:", err);
          }
        }
        // Fallback: return most recent memories
        const recentMemories = await getMemoriesByIdentity(identity.id);
        const limited = recentMemories.slice(0, input.maxSemantic + input.maxRecent);
        return {
          context: limited.map((m) => `[${m.type}] ${m.title ?? ""}: ${m.content}`).join("\n"),
          memories: limited,
          source: "recent" as const,
        };
      }),
  }),

  // ─── Sutaeru: Connections router ──────────────────────────────────────────────
  connections: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const identity = await getOrCreateIdentity(ctx.user.id);
      if (!identity) return [];
      return getConnectionsByIdentity(identity.id);
    }),
    add: protectedProcedure
      .input(
        z.object({
          provider: z.string().min(1).max(128),
          type: z.enum(["llm_api_key", "oauth2", "generic_api_key"]),
          displayName: z.string().max(255).optional(),
          encryptedCredentials: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const identity = await getOrCreateIdentity(ctx.user.id);
        if (!identity) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Identity not found" });
        await addConnection({ ...input, identityId: identity.id });
        return { success: true };
      }),
    revoke: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const identity = await getOrCreateIdentity(ctx.user.id);
        if (!identity) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Identity not found" });
        await revokeConnection(input.id, identity.id);
        return { success: true };
      }),
  }),

  // ─── Sutaeru: Public profile router ──────────────────────────────────────────────────
  profile: router({
    getByHandle: publicProcedure
      .input(z.object({ handle: z.string().min(1).max(64) }))
      .query(async ({ input }) => {
        const identity = await getIdentityByHandle(input.handle);
        if (!identity) throw new TRPCError({ code: "NOT_FOUND", message: `No profile found for @${input.handle}` });
        const publicSkills = await getPublicSkillsByHandle(input.handle);
        return {
          handle: identity.handle,
          displayName: identity.displayName,
          bio: identity.bio,
          avatarUrl: identity.avatarUrl,
          skills: publicSkills,
        };
      }),
  }),
  // ─── Chat Sessions router ──────────────────────────────────────────────────
  chat: router({
    listSessions: protectedProcedure.query(async ({ ctx }) => {
      return listChatSessions(ctx.user.id);
    }),
    getMessages: protectedProcedure
      .input(z.object({ sessionId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const sessions = await listChatSessions(ctx.user.id);
        const owns = sessions.some((s) => s.id === input.sessionId);
        if (!owns) throw new TRPCError({ code: "FORBIDDEN" });
        return getChatSessionMessages(input.sessionId);
      }),
    createSession: protectedProcedure
      .input(z.object({ title: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        const id = await createChatSession(ctx.user.id, input.title);
        return { id };
      }),
    renameSession: protectedProcedure
      .input(z.object({ sessionId: z.string().uuid(), title: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        const sessions = await listChatSessions(ctx.user.id);
        const owns = sessions.some((s) => s.id === input.sessionId);
        if (!owns) throw new TRPCError({ code: "FORBIDDEN" });
        await updateChatSessionTitle(input.sessionId, input.title);
        return { success: true };
      }),
    deleteSession: protectedProcedure
      .input(z.object({ sessionId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await deleteChatSession(input.sessionId, ctx.user.id);
        return { success: true };
      }),
  }),
  // ─── Audit router ──────────────────────────────────────────────────────────
  audit: auditRouter,
  // ─── Agents router (multi-agent chat) ─────────────────────────────────────
  agents: agentsRouter,
  fileSharing: fileSharingRouter,
  // ─── Admin router ─────────────────────────────────────────────────────────
  admin: router({
    userStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      const users = await getAllUsersWithStats();
      return users;
    }),
    betaInvites: betaInvitesRouter,
  }),
});

export type AppRouter = typeof appRouter;
