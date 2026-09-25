DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_kind') THEN
    CREATE TYPE "public"."file_kind" AS ENUM('document', 'image', 'video', 'audio', 'other');
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "kind" "file_kind" DEFAULT 'document' NOT NULL;
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "storageProvider" varchar(64) DEFAULT 'local' NOT NULL;
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "storageRef" varchar(512) DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "threadId" varchar(64);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "spaceId" varchar(64);
--> statement-breakpoint
UPDATE "files" SET "storageRef" = "fileKey" WHERE "storageRef" = '';
