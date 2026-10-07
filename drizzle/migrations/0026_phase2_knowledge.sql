-- Phase 2 schema (P2-01): memory lifecycle columns, knowledge chunks, parsed documents,
-- session files and the memory audit trail. No vector types - those live in
-- drizzle/optional/pgvector.sql so this file runs on plain Postgres too.
ALTER TABLE memories ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'active';   -- active|superseded|deleted
--> statement-breakpoint
ALTER TABLE memories ADD COLUMN IF NOT EXISTS tier varchar(16) NOT NULL DEFAULT 'episodic';   -- core|episodic
--> statement-breakpoint
ALTER TABLE memories ADD COLUMN IF NOT EXISTS superseded_by integer;
--> statement-breakpoint
ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence real;
--> statement-breakpoint
ALTER TABLE memories ADD COLUMN IF NOT EXISTS space_id varchar(36);
--> statement-breakpoint
ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_used_at timestamp;
--> statement-breakpoint
ALTER TABLE memories ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_json jsonb;
--> statement-breakpoint
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_model varchar(96);
--> statement-breakpoint
ALTER TABLE memories ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || content)) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS memories_tsv_idx ON memories USING gin (tsv);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS memories_identity_status_idx ON memories ("identityId", status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  scope_type varchar(16) NOT NULL,          -- file|chat|space|run|agent
  scope_id varchar(64) NOT NULL,
  source_ref varchar(256) NOT NULL,         -- sha256, message id, url
  source_title text,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer NOT NULL,
  embedding_json jsonb,
  embedding_model varchar(96),
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,   -- page, heading, url, published_at
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope_type, scope_id, source_ref, chunk_index)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS kc_scope_idx ON knowledge_chunks (user_id, scope_type, scope_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS kc_tsv_idx ON knowledge_chunks USING gin (tsv);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS parsed_documents (
  sha256 char(64) PRIMARY KEY,
  mime varchar(128) NOT NULL,
  parser varchar(32) NOT NULL,
  page_count integer,
  markdown text NOT NULL,
  pages jsonb,                               -- [{n, chars, ocr:boolean}]
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS session_files (
  session_id varchar(36) NOT NULL,
  user_id integer NOT NULL REFERENCES users(id),
  sha256 char(64) NOT NULL,
  filename text NOT NULL,
  mime varchar(128) NOT NULL,
  storage_key text,                          -- original bytes, for the sandbox (P2-11)
  indexed boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, sha256)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS memory_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  memory_id integer,
  op varchar(16) NOT NULL,                   -- add|update|delete|noop|used
  before text, after text,
  source varchar(32) NOT NULL,               -- auto|tool|user
  session_id varchar(36),
  created_at timestamp NOT NULL DEFAULT now()
);
