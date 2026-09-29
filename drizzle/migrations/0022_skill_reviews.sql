-- One review per skill content hash; a skill is usable only while a row for its current hash has approvedAt set
CREATE TABLE IF NOT EXISTS skill_reviews (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "skillSlug" varchar(128) NOT NULL,
  "contentHash" varchar(64) NOT NULL,
  verdict varchar(16) NOT NULL,
  report json NOT NULL,
  "reviewedAt" timestamp DEFAULT now() NOT NULL,
  "approvedAt" timestamp,
  "approvedBy" integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS skill_reviews_slug_hash ON skill_reviews ("skillSlug", "contentHash");
