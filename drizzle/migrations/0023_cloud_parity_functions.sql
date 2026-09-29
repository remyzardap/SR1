-- Cloud parity: the Lovable cloud functions now run as Express routes on this server.
-- monitors and monitor_runs back /api/fn/monitors; user_settings holds the living-memory switch.
CREATE TABLE IF NOT EXISTS "user_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"settings" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'monitor_frequency'
  ) THEN
    CREATE TYPE "public"."monitor_frequency" AS ENUM('daily', 'weekly');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitors" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"topic" text NOT NULL,
	"frequency" "monitor_frequency" DEFAULT 'weekly' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"monitor_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"report" text NOT NULL,
	"sources" json DEFAULT '[]'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'monitors_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "monitors" ADD CONSTRAINT "monitors_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'monitor_runs_monitor_id_monitors_id_fk'
  ) THEN
    ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_monitor_id_monitors_id_fk"
    FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id")
    ON DELETE no action ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'monitor_runs_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS monitors_user_created_idx ON monitors ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS monitor_runs_user_created_idx ON monitor_runs ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS monitor_runs_monitor_created_idx ON monitor_runs ("monitor_id", "created_at");
