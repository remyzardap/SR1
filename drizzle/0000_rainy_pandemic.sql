CREATE TYPE "public"."api_key_provider" AS ENUM('kimi', 'openai', 'gemini', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."connection_type" AS ENUM('llm_api_key', 'oauth2', 'generic_api_key');--> statement-breakpoint
CREATE TYPE "public"."file_format" AS ENUM('pdf', 'docx', 'xlsx', 'pptx', 'md');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('preference', 'project', 'document', 'interaction', 'fact');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."processed_as" AS ENUM('receipt', 'task', 'procurement', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."procurement_status" AS ENUM('open', 'in_review', 'approved', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('auto', 'needs_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."skill_type" AS ENUM('prompt', 'workflow', 'tool_definition', 'behavior');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('whatsapp', 'web');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"sessionId" varchar(255) NOT NULL,
	"agentId" varchar(255) NOT NULL,
	"startedAt" bigint NOT NULL,
	"endedAt" bigint,
	"messageCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
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
CREATE TABLE "api_keys" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_keys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"provider" "api_key_provider" DEFAULT 'openai' NOT NULL,
	"encryptedKey" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
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
CREATE TABLE "beta_invite_codes" (
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
CREATE TABLE "businesses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "businesses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ownerId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"currency" varchar(10) DEFAULT 'IDR',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer,
	"session_id" varchar(36) NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"model" varchar(128),
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastMessageAt" bigint
);
--> statement-breakpoint
CREATE TABLE "connections" (
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
CREATE TABLE "email_verification_tokens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"token" varchar(128) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "file_shares" (
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
CREATE TABLE "files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"originalPrompt" text NOT NULL,
	"format" "file_format" NOT NULL,
	"styleLabel" varchar(128),
	"fileKey" varchar(512) NOT NULL,
	"fileUrl" text NOT NULL,
	"fileSizeBytes" bigint DEFAULT 0,
	"mimeType" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identities" (
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
CREATE TABLE "memories" (
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
CREATE TABLE "message_logs" (
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
CREATE TABLE "password_reset_tokens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"token" varchar(128) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "payments" (
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
CREATE TABLE "procurement_requests" (
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
CREATE TABLE "receipts" (
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
CREATE TABLE "skill_ratings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_ratings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"skillId" integer NOT NULL,
	"identityId" integer NOT NULL,
	"rating" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skills_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"identityId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" "skill_type" NOT NULL,
	"content" json NOT NULL,
	"sourceModel" varchar(128),
	"isPublic" boolean DEFAULT false NOT NULL,
	"usageCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
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
CREATE TABLE "users" (
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
