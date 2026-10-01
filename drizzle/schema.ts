
import {
  boolean,
  numeric,
  integer,
  json,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  bigint,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const fileFormatEnum = pgEnum("file_format", ["pdf", "docx", "xlsx", "pptx", "md"]);
export const fileKindEnum = pgEnum("file_kind", ["document", "image", "video", "audio", "other"]);
export const apiKeyProviderEnum = pgEnum("api_key_provider", ["kimi", "openai", "gemini", "anthropic"]);
export const receiptStatusEnum = pgEnum("receipt_status", ["auto", "needs_review", "approved", "rejected"]);
export const sourceEnum = pgEnum("source", ["whatsapp", "web"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high"]);
export const taskStatusEnum = pgEnum("task_status", ["open", "in_progress", "done", "cancelled"]);
export const procurementStatusEnum = pgEnum("procurement_status", ["open", "in_review", "approved", "rejected", "completed"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const processedAsEnum = pgEnum("processed_as", ["receipt", "task", "procurement", "unknown"]);
export const connectionTypeEnum = pgEnum("connection_type", ["llm_api_key", "oauth2", "generic_api_key"]);
export const connectionStatusEnum = pgEnum("connection_status", ["active", "revoked", "expired"]);
export const skillTypeEnum = pgEnum("skill_type", ["prompt", "workflow", "tool_definition", "behavior"]);
export const memoryTypeEnum = pgEnum("memory_type", ["preference", "project", "document", "interaction", "fact"]);
export const monitorFrequencyEnum = pgEnum("monitor_frequency", ["daily", "weekly"]);

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  stripePriceId: varchar("stripePriceId", { length: 255 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  onboarded: boolean("onboarded").default(false).notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  totpSecret: varchar("totpSecret", { length: 255 }),
  totpEnabled: boolean("totpEnabled").default(false).notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Generated Files ──────────────────────────────────────────────────────────
export const files = pgTable("files", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  originalPrompt: text("originalPrompt").notNull(),
  format: fileFormatEnum("format").notNull(),
  styleLabel: varchar("styleLabel", { length: 128 }),
  kind: fileKindEnum("kind").default("document").notNull(),
  storageProvider: varchar("storageProvider", { length: 64 }).default("local").notNull(),
  storageRef: varchar("storageRef", { length: 512 }).default("").notNull(),
  threadId: varchar("threadId", { length: 64 }),
  spaceId: varchar("spaceId", { length: 64 }),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileSizeBytes: bigint("fileSizeBytes", { mode: "number" }).default(0),
  mimeType: varchar("mimeType", { length: 128 }),
  trashed: boolean("trashed").notNull().default(false),
  trashedAt: timestamp("trashedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type FileRecord = typeof files.$inferSelect;
export type InsertFileRecord = typeof files.$inferInsert;

// ─── Per-user LLM API key ─────────────────────────────────────────────────────
export const apiKeys = pgTable("api_keys", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("userId").notNull().unique(),
  provider: apiKeyProviderEnum("provider").default("openai").notNull(),
  encryptedKey: text("encryptedKey").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// ─── Businesses ───────────────────────────────────────────────────────────────
export const businesses = pgTable("businesses", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ownerId: integer("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("IDR"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = typeof businesses.$inferInsert;

// ─── Receipts ─────────────────────────────────────────────────────────────────
export const receipts = pgTable("receipts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  businessId: integer("businessId"),
  userId: integer("userId"),
  date: timestamp("date"),
  vendor: varchar("vendor", { length: 255 }),
  description: text("description"),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  taxAmount: numeric("taxAmount", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("IDR"),
  category: varchar("category", { length: 100 }),
  paymentMethod: varchar("paymentMethod", { length: 64 }),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  status: receiptStatusEnum("status").default("auto").notNull(),
  rejectionNote: text("rejectionNote"),
  rawText: text("rawText"),
  ocrConfidence: numeric("ocrConfidence", { precision: 5, scale: 2 }),
  source: sourceEnum("source").default("web").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = typeof receipts.$inferInsert;

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasks = pgTable("tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  businessId: integer("businessId"),
  userId: integer("userId"),
  text: text("text").notNull(),
  dueDate: timestamp("dueDate"),
  category: varchar("category", { length: 100 }),
  priority: taskPriorityEnum("priority").default("medium").notNull(),
  status: taskStatusEnum("status").default("open").notNull(),
  source: sourceEnum("source").default("web").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Procurement Requests ─────────────────────────────────────────────────────
export const procurementRequests = pgTable("procurement_requests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  businessId: integer("businessId"),
  userId: integer("userId"),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1),
  budgetPerUnit: numeric("budgetPerUnit", { precision: 15, scale: 2 }),
  totalBudget: numeric("totalBudget", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("IDR"),
  location: varchar("location", { length: 255 }),
  vendorName: varchar("vendorName", { length: 255 }),
  vendorContact: varchar("vendorContact", { length: 255 }),
  status: procurementStatusEnum("status").default("open").notNull(),
  approvalNote: text("approvalNote"),
  source: sourceEnum("source").default("web").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ProcurementRequest = typeof procurementRequests.$inferSelect;
export type InsertProcurementRequest = typeof procurementRequests.$inferInsert;

// ─── Message Log ──────────────────────────────────────────────────────────────
export const messageLogs = pgTable("message_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  businessId: integer("businessId"),
  userId: integer("userId"),
  source: sourceEnum("source").default("whatsapp").notNull(),
  direction: messageDirectionEnum("direction").default("inbound").notNull(),
  content: text("content"),
  mediaUrl: text("mediaUrl"),
  mediaType: varchar("mediaType", { length: 64 }),
  processedAs: processedAsEnum("processedAs"),
  relatedId: integer("relatedId"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MessageLog = typeof messageLogs.$inferSelect;
export type InsertMessageLog = typeof messageLogs.$inferInsert;

// ─── Payments ─────────────────────────────────────────────────────────────────
export const payments = pgTable("payments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("userId").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripeInvoiceId: varchar("stripeInvoiceId", { length: 255 }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("usd").notNull(),
  status: varchar("status", { length: 64 }).notNull(),
  description: text("description"),
  receiptUrl: text("receiptUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// ─── EYVA: Identities ─────────────────────────────────────────────────────────
export const identities = pgTable("identities", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("userId").notNull().unique(),
  handle: varchar("handle", { length: 64 }).unique(),
  displayName: varchar("displayName", { length: 255 }),
  avatarUrl: text("avatarUrl"),
  bio: text("bio"),
  personalityTraits: json("personalityTraits").$type<string[]>(),
  primaryLanguage: varchar("primaryLanguage", { length: 64 }),
  notificationPrefs: json("notificationPrefs").$type<{
    emailDigest: boolean;
    memoryAlerts: boolean;
    skillUpdates: boolean;
    connectionAlerts: boolean;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Identity = typeof identities.$inferSelect;
export type InsertIdentity = typeof identities.$inferInsert;

// ─── EYVA: Skills ─────────────────────────────────────────────────────────────
export const skills = pgTable("skills", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  identityId: integer("identityId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: skillTypeEnum("type").notNull(),
  content: json("content").notNull(),
  sourceModel: varchar("sourceModel", { length: 128 }),
  isPublic: boolean("isPublic").default(false).notNull(),
  approved: boolean("approved").default(false).notNull(),
  usageCount: integer("usageCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Skill = typeof skills.$inferSelect;
export type InsertSkill = typeof skills.$inferInsert;

// ─── EYVA: Memories ───────────────────────────────────────────────────────────
export const memories = pgTable("memories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  identityId: integer("identityId").notNull(),
  type: memoryTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }),
  content: text("content").notNull(),
  structuredData: json("structuredData"),
  sourceUrl: text("sourceUrl"),
  sourceApp: varchar("sourceApp", { length: 128 }),
  tags: json("tags"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Memory = typeof memories.$inferSelect;
export type InsertMemory = typeof memories.$inferInsert;

// ─── EYVA: Connections ────────────────────────────────────────────────────────
export const connections = pgTable("connections", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  identityId: integer("identityId").notNull(),
  provider: varchar("provider", { length: 128 }).notNull(),
  type: connectionTypeEnum("type").notNull(),
  displayName: varchar("displayName", { length: 255 }),
  encryptedCredentials: text("encryptedCredentials").notNull(),
  scopes: json("scopes"),
  status: connectionStatusEnum("status").default("active").notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Connection = typeof connections.$inferSelect;
export type InsertConnection = typeof connections.$inferInsert;

// ─── Auth: Email Verification Tokens ────────────────────────────────────────
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

// ─── Auth: Password Reset Tokens ──────────────────────────────────────────────
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// ─── Sutaeru: Chat Sessions ────────────────────────────────────────────────────
export const spaces = pgTable("spaces", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  settings: json("settings").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Space = typeof spaces.$inferSelect;
export type InsertSpace = typeof spaces.$inferInsert;

export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("userId").notNull(),
  spaceId: varchar("spaceId", { length: 36 }),
  title: varchar("title", { length: 255 }),
  settings: json("settings").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastMessageAt: bigint("lastMessageAt", { mode: "number" }),
});
export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatSession = typeof chatSessions.$inferInsert;

// ─── Sutaeru: Chat Messages ─────────────────────────────────────────────────────
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("userId"),
  sessionId: varchar("session_id", { length: 36 }).notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  model: varchar("model", { length: 128 }),
  settings: json("settings").$type<Record<string, unknown>>().default({}),
  embedding: json("embedding").$type<number[]>(),
  createdAt: timestamp("created_at").notNull(),
});
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// ─── Audit Logs ────────────────────────────────────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  resourceType: varchar("resourceType", { length: 64 }).notNull(),
  resourceId: varchar("resourceId", { length: 128 }),
  changes: json("changes"),
  metadata: json("metadata"),
  severity: varchar("severity", { length: 16 }).notNull().default("info"),
  status: varchar("status", { length: 16 }).notNull().default("success"),
  errorMessage: text("errorMessage"),
  sessionId: varchar("sessionId", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export const AuditActions = {
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",
  USER_LOGIN_FAILED: "user.login_failed",
  USER_PASSWORD_CHANGE: "user.password_change",
  USER_CREATE: "user.create",
  USER_DELETE: "user.delete",
  USER_ROLE_UPDATE: "user.role_update",
  BUSINESS_CREATE: "business.create",
  BUSINESS_DELETE: "business.delete",
  RECEIPT_APPROVE: "receipt.approve",
  PROCUREMENT_APPROVE: "procurement.approve",
  FILE_UPLOAD: "file.upload",
  FILE_DELETE: "file.delete",
  FILE_SHARE: "file.share",
  ADMIN_SEED_RUN: "admin.seed_run",
  SYSTEM_HEALTH_CHECK: "system.health_check",
  RATE_LIMIT_EXCEEDED: "security.rate_limit_exceeded",
  PERMISSION_DENIED: "security.permission_denied",
} as const;
export type AuditAction = typeof AuditActions[keyof typeof AuditActions];

// ─── Agents (Multi-Agent Chat) ────────────────────────────────────────────────
export const agents = pgTable("agents", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description").notNull(),
  systemPrompt: text("systemPrompt").notNull(),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  color: varchar("color", { length: 50 }).notNull().default("#6366f1"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export const agentSessions = pgTable("agent_sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  sessionId: varchar("sessionId", { length: 255 }).notNull(),
  agentId: varchar("agentId", { length: 255 }).notNull(),
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  endedAt: bigint("endedAt", { mode: "number" }),
  messageCount: integer("messageCount").notNull().default(0),
});

// ─── File Shares ──────────────────────────────────────────────────────────────
export const fileShares = pgTable("file_shares", {
  id: varchar("id", { length: 36 }).primaryKey(),
  fileId: integer("fileId").notNull(),
  identityId: integer("identityId").notNull(),
  token: varchar("token", { length: 64 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 64 }),
  expiresAt: bigint("expiresAt", { mode: "number" }),
  maxAccessCount: integer("maxAccessCount"),
  accessCount: integer("accessCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type FileShare = typeof fileShares.$inferSelect;
export type InsertFileShare = typeof fileShares.$inferInsert;

// ─── Beta Invite Codes ────────────────────────────────────────────────────────
export const betaInviteCodes = pgTable("beta_invite_codes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  createdBy: integer("createdBy").notNull(),
  usedBy: integer("usedBy"),
  maxUses: integer("maxUses"),
  usageCount: integer("usageCount").default(0).notNull(),
  expiresAt: timestamp("expiresAt"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type BetaInviteCode = typeof betaInviteCodes.$inferSelect;
export type InsertBetaInviteCode = typeof betaInviteCodes.$inferInsert;

// ─── Skill Ratings ────────────────────────────────────────────────────────────
export const skillRatings = pgTable("skill_ratings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  skillId: integer("skillId").notNull(),
  identityId: integer("identityId").notNull(),
  rating: integer("rating").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SkillRating = typeof skillRatings.$inferSelect;
export type InsertSkillRating = typeof skillRatings.$inferInsert;

// ─── Blocks ───────────────────────────────────────────────────────────────────
export const blockTypeEnum = pgEnum("block_type", [
  "chat", "atelier", "memory", "task", "media", "transcript", "widget", "note"
]);
// NOTE: DB enum changed from "her" to "kemma". Existing rows with "her" value
// will need a data migration: UPDATE blocks SET source = 'kemma' WHERE source = 'her';
export const blockSourceEnum = pgEnum("block_source", [
  "s1", "atelier", "kemma", "user", "feed", "system"
]);

export const blocks = pgTable("blocks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("userId").notNull(),
  type: blockTypeEnum("type").notNull(),
  source: blockSourceEnum("source").notNull().default("user"),
  parentId: varchar("parentId", { length: 36 }),
  sessionId: varchar("sessionId", { length: 36 }),
  title: text("title"),
  content: json("content").notNull().default({}),
  agentId: varchar("agentId", { length: 64 }),
  pinned: boolean("pinned").default(false).notNull(),
  locked: boolean("locked").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
  tags: json("tags").default([]),
  position: integer("position").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = typeof blocks.$inferInsert;

// ─── Google OAuth Tokens ─────────────────────────────────────────────────────
export const googleTokens = pgTable("google_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("userId").notNull().unique(),
  email: varchar("email", { length: 320 }),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  scopes: text("scopes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type GoogleToken = typeof googleTokens.$inferSelect;
export type InsertGoogleToken = typeof googleTokens.$inferInsert;

// ─── User Quotas (Kemma agent) ────────────────────────────────────────────────
export const userQuotas = pgTable("user_quotas", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  tier: text("tier", { enum: ["free", "trial", "pro", "max"] }).notNull().default("free"),
  messagesToday: integer("messages_today").notNull().default(0),
  thinkPressesToday: integer("think_presses_today").notNull().default(0),
  tokensToday: integer("tokens_today").notNull().default(0),
  dailyResetAt: timestamp("daily_reset_at").notNull().defaultNow(),
  agenticTasksThisMonth: integer("agentic_tasks_this_month").notNull().default(0),
  voiceMinutesThisMonth: integer("voice_minutes_this_month").notNull().default(0),
  monthlyResetAt: timestamp("monthly_reset_at").notNull().defaultNow(),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  hasByos: boolean("has_byos").notNull().default(false),
  byosBonusTasks: integer("byos_bonus_tasks").notNull().default(0),
  purgePasswordHash: text("purge_password_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type UserQuota = typeof userQuotas.$inferSelect;
export type InsertUserQuota = typeof userQuotas.$inferInsert;

// ─── Kemma Usage Logs (per-provider, per-report) ─────────────────────────────
export const usageLogs = pgTable("usage_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  sessionId: varchar("session_id", { length: 128 }),
  reportId: varchar("report_id", { length: 128 }),
  provider: varchar("provider", { length: 64 }).notNull(),
  model: varchar("model", { length: 128 }).notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  // Prompt tokens served from the provider's prompt cache (a subset of inputTokens).
  cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).default("0"),
  purpose: varchar("purpose", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type UsageLog = typeof usageLogs.$inferSelect;
export type InsertUsageLog = typeof usageLogs.$inferInsert;

// ─── Per-user app settings (living memory switch) ─────────────────────────────
export const userSettings = pgTable("user_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  settings: json("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;

// ─── Research monitors: recurring topics that file a cited briefing ───────────
export const monitors = pgTable("monitors", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  topic: text("topic").notNull(),
  frequency: monitorFrequencyEnum("frequency").notNull().default("weekly"),
  active: boolean("active").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type MonitorRow = typeof monitors.$inferSelect;
export type InsertMonitor = typeof monitors.$inferInsert;

export const monitorRuns = pgTable("monitor_runs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  monitorId: varchar("monitor_id", { length: 36 }).notNull().references(() => monitors.id),
  userId: integer("user_id").notNull().references(() => users.id),
  report: text("report").notNull(),
  sources: json("sources").$type<Array<{ title: string; url: string }>>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type MonitorRunRow = typeof monitorRuns.$inferSelect;
export type InsertMonitorRun = typeof monitorRuns.$inferInsert;

// ─── Agent skills: one review per content hash, usable only after approval ────
export const skillReviews = pgTable(
  "skill_reviews",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    skillSlug: varchar("skillSlug", { length: 128 }).notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    verdict: varchar("verdict", { length: 16 }).notNull(),
    report: json("report").notNull(),
    reviewedAt: timestamp("reviewedAt").defaultNow().notNull(),
    approvedAt: timestamp("approvedAt"),
    approvedBy: integer("approvedBy"),
  },
  (t) => [uniqueIndex("skill_reviews_slug_hash").on(t.skillSlug, t.contentHash)],
);
export type SkillReviewRow = typeof skillReviews.$inferSelect;
