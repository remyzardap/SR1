-- Idempotent base schema, generated from drizzle/schema.ts (drizzle-kit generate, then made re-runnable).
-- server/migrate.ts applies this BEFORE the journaled migrations in drizzle/migrations/, which start at 0015
-- and assume users, chat_sessions, files, skills, ... already exist. Safe on an empty or an existing database:
-- tables/enums are created only if missing and foreign keys are added NOT VALID (existing rows are not scanned).
-- It does not alter columns of tables that already exist; that is what the numbered migrations are for.
-- Regenerate when schema.ts gains a table: drizzle-kit generate to a scratch dir, then re-apply the same rewrites.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'api_key_provider') THEN
    CREATE TYPE "public"."api_key_provider" AS ENUM('kimi', 'openai', 'gemini', 'anthropic');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'block_source') THEN
    CREATE TYPE "public"."block_source" AS ENUM('s1', 'atelier', 'kemma', 'user', 'feed', 'system');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'block_type') THEN
    CREATE TYPE "public"."block_type" AS ENUM('chat', 'atelier', 'memory', 'task', 'media', 'transcript', 'widget', 'note');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connection_status') THEN
    CREATE TYPE "public"."connection_status" AS ENUM('active', 'revoked', 'expired');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connection_type') THEN
    CREATE TYPE "public"."connection_type" AS ENUM('llm_api_key', 'oauth2', 'generic_api_key');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_format') THEN
    CREATE TYPE "public"."file_format" AS ENUM('pdf', 'docx', 'xlsx', 'pptx', 'md');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_kind') THEN
    CREATE TYPE "public"."file_kind" AS ENUM('document', 'image', 'video', 'audio', 'other');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'memory_type') THEN
    CREATE TYPE "public"."memory_type" AS ENUM('preference', 'project', 'document', 'interaction', 'fact');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_direction') THEN
    CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processed_as') THEN
    CREATE TYPE "public"."processed_as" AS ENUM('receipt', 'task', 'procurement', 'unknown');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'procurement_status') THEN
    CREATE TYPE "public"."procurement_status" AS ENUM('open', 'in_review', 'approved', 'rejected', 'completed');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'receipt_status') THEN
    CREATE TYPE "public"."receipt_status" AS ENUM('auto', 'needs_review', 'approved', 'rejected');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role') THEN
    CREATE TYPE "public"."role" AS ENUM('user', 'admin');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_type') THEN
    CREATE TYPE "public"."skill_type" AS ENUM('prompt', 'workflow', 'tool_definition', 'behavior');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source') THEN
    CREATE TYPE "public"."source" AS ENUM('whatsapp', 'web');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'done', 'cancelled');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"sessionId" varchar(255) NOT NULL,
	"agentId" varchar(255) NOT NULL,
	"startedAt" bigint NOT NULL,
	"endedAt" bigint,
	"messageCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agents" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"systemPrompt" text NOT NULL,
	"avatarUrl" varchar(512),
	"color" varchar(50) DEFAULT '#6366f1' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_keys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"provider" "api_key_provider" DEFAULT 'openai' NOT NULL,
	"encryptedKey" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" varchar(64) NOT NULL,
	"action" varchar(128) NOT NULL,
	"resourceType" varchar(64) NOT NULL,
	"resourceId" varchar(128),
	"changes" json,
	"metadata" json,
	"severity" varchar(16) DEFAULT 'info' NOT NULL,
	"status" varchar(16) DEFAULT 'success' NOT NULL,
	"errorMessage" text,
	"sessionId" varchar(128),
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "beta_invite_codes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"createdBy" integer NOT NULL,
	"usedBy" integer,
	"maxUses" integer,
	"usageCount" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "beta_invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blocks" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"type" "block_type" NOT NULL,
	"source" "block_source" DEFAULT 'user' NOT NULL,
	"parentId" varchar(36),
	"sessionId" varchar(36),
	"title" text,
	"content" json DEFAULT '{}'::json NOT NULL,
	"agentId" varchar(64),
	"pinned" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"tags" json DEFAULT '[]'::json,
	"position" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "businesses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "businesses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ownerId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"currency" varchar(10) DEFAULT 'IDR',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer,
	"session_id" varchar(36) NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"model" varchar(128),
	"settings" json DEFAULT '{}'::json,
	"embedding" json,
	"created_at" timestamp NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"spaceId" varchar(36),
	"title" varchar(255),
	"settings" json DEFAULT '{}'::json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastMessageAt" bigint,
	"context_cache" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"identityId" integer NOT NULL,
	"provider" varchar(128) NOT NULL,
	"type" "connection_type" NOT NULL,
	"displayName" varchar(255),
	"encryptedCredentials" text NOT NULL,
	"scopes" json,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"lastUsedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"token" varchar(128) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "file_shares" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"fileId" integer NOT NULL,
	"identityId" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"passwordHash" varchar(64),
	"expiresAt" bigint,
	"maxAccessCount" integer,
	"accessCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"originalPrompt" text NOT NULL,
	"format" "file_format" NOT NULL,
	"styleLabel" varchar(128),
	"kind" "file_kind" DEFAULT 'document' NOT NULL,
	"storageProvider" varchar(64) DEFAULT 'local' NOT NULL,
	"storageRef" varchar(512) DEFAULT '' NOT NULL,
	"threadId" varchar(64),
	"spaceId" varchar(64),
	"fileKey" varchar(512) NOT NULL,
	"fileUrl" text NOT NULL,
	"fileSizeBytes" bigint DEFAULT 0,
	"mimeType" varchar(128),
	"trashed" boolean DEFAULT false NOT NULL,
	"trashedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_tokens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "google_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"email" varchar(320),
	"accessToken" text NOT NULL,
	"refreshToken" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"scopes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_tokens_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"handle" varchar(64),
	"displayName" varchar(255),
	"avatarUrl" text,
	"bio" text,
	"personalityTraits" json,
	"primaryLanguage" varchar(64),
	"notificationPrefs" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "identities_userId_unique" UNIQUE("userId"),
	CONSTRAINT "identities_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "memories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"identityId" integer NOT NULL,
	"type" "memory_type" NOT NULL,
	"title" varchar(255),
	"content" text NOT NULL,
	"structuredData" json,
	"sourceUrl" text,
	"sourceApp" varchar(128),
	"tags" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "message_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"businessId" integer,
	"userId" integer,
	"source" "source" DEFAULT 'whatsapp' NOT NULL,
	"direction" "message_direction" DEFAULT 'inbound' NOT NULL,
	"content" text,
	"mediaUrl" text,
	"mediaType" varchar(64),
	"processedAs" "processed_as",
	"relatedId" integer,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"token" varchar(128) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"stripePaymentIntentId" varchar(255),
	"stripeInvoiceId" varchar(255),
	"amount" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd' NOT NULL,
	"status" varchar(64) NOT NULL,
	"description" text,
	"receiptUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "procurement_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "procurement_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"businessId" integer,
	"userId" integer,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1,
	"budgetPerUnit" numeric(15, 2),
	"totalBudget" numeric(15, 2),
	"currency" varchar(10) DEFAULT 'IDR',
	"location" varchar(255),
	"vendorName" varchar(255),
	"vendorContact" varchar(255),
	"status" "procurement_status" DEFAULT 'open' NOT NULL,
	"approvalNote" text,
	"source" "source" DEFAULT 'web' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receipts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "receipts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"businessId" integer,
	"userId" integer,
	"date" timestamp,
	"vendor" varchar(255),
	"description" text,
	"amount" numeric(15, 2),
	"taxAmount" numeric(15, 2),
	"currency" varchar(10) DEFAULT 'IDR',
	"category" varchar(100),
	"paymentMethod" varchar(64),
	"fileUrl" text,
	"fileKey" varchar(512),
	"status" "receipt_status" DEFAULT 'auto' NOT NULL,
	"rejectionNote" text,
	"rawText" text,
	"ocrConfidence" numeric(5, 2),
	"source" "source" DEFAULT 'web' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_ratings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_ratings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"skillId" integer NOT NULL,
	"identityId" integer NOT NULL,
	"rating" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skills_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"identityId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" "skill_type" NOT NULL,
	"content" json NOT NULL,
	"sourceModel" varchar(128),
	"isPublic" boolean DEFAULT false NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"usageCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spaces" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"settings" json DEFAULT '{}'::json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"businessId" integer,
	"userId" integer,
	"text" text NOT NULL,
	"dueDate" timestamp,
	"category" varchar(100),
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"source" "source" DEFAULT 'web' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usage_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"session_id" varchar(128),
	"report_id" varchar(128),
	"provider" varchar(64) NOT NULL,
	"model" varchar(128) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(12, 6) DEFAULT '0',
	"purpose" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_quotas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_quotas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"messages_today" integer DEFAULT 0 NOT NULL,
	"think_presses_today" integer DEFAULT 0 NOT NULL,
	"tokens_today" integer DEFAULT 0 NOT NULL,
	"daily_reset_at" timestamp DEFAULT now() NOT NULL,
	"agentic_tasks_this_month" integer DEFAULT 0 NOT NULL,
	"voice_minutes_this_month" integer DEFAULT 0 NOT NULL,
	"monthly_reset_at" timestamp DEFAULT now() NOT NULL,
	"trial_started_at" timestamp,
	"trial_ends_at" timestamp,
	"has_byos" boolean DEFAULT false NOT NULL,
	"byos_bonus_tasks" integer DEFAULT 0 NOT NULL,
	"purge_password_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_quotas_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	"stripeCustomerId" varchar(255),
	"stripeSubscriptionId" varchar(255),
	"stripePriceId" varchar(255),
	"passwordHash" varchar(255),
	"onboarded" boolean DEFAULT false NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"totpSecret" varchar(255),
	"totpEnabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_logs_user_id_users_id_fk') THEN
    ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_quotas_user_id_users_id_fk') THEN
    ALTER TABLE "user_quotas" ADD CONSTRAINT "user_quotas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action NOT VALID;
  END IF;
END $$;
