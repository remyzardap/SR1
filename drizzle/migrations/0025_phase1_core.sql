-- Phase 1 core schema (P1-01): message metadata, session context cache, a shared kv cache, and approvals
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS context_cache jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS kv_cache (
  namespace varchar(32) NOT NULL,
  key varchar(128) NOT NULL,
  value jsonb NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, key)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS kv_cache_expires_idx ON kv_cache (expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS approvals (
  id varchar(36) PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  session_id varchar(36),
  run_id varchar(36),
  tool varchar(160) NOT NULL,
  risk varchar(16) NOT NULL,
  args jsonb NOT NULL,
  args_hash char(64) NOT NULL,                     -- sha256 of canonical JSON of the args that will run
  target_ref text,                                 -- e.g. drive:<fileId>, for edits of existing resources
  target_revision text,                            -- revision/etag/modifiedTime captured at request time
  preview jsonb,
  status varchar(16) NOT NULL DEFAULT 'pending',   -- pending|approved|rejected|expired|cancelled|executing|executed|failed
  decided_args jsonb,
  decided_at timestamp,
  executed_at timestamp,
  result jsonb,                                    -- compact outcome (ids, status), never full content
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS approvals_user_status_idx ON approvals (user_id, status);
