-- Create user_quotas table for Kemma agent
CREATE TABLE IF NOT EXISTS "user_quotas" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
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
