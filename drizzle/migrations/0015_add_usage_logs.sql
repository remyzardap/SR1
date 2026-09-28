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
	"estimated_cost_usd" numeric(12, 6) DEFAULT '0',
	"purpose" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usage_logs_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action NOT VALID;
  END IF;
END $$;
