-- Admin-managed accounts: a password the holder must replace, and a switch an admin can throw.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabledAt" timestamp;
