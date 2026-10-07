-- P2-01: optional pgvector columns and indexes.
--
-- This file is NOT part of the journaled migration chain. server/migrate.ts runs it only when
-- pg_available_extensions offers 'vector', so a plain Postgres database still migrates cleanly.
-- Every statement is idempotent: install the extension (ops/postgres/README.md), then re-run the
-- migrations or feed this file to psql to get the vector columns on an existing database.
--
-- The vector columns are deliberately absent from drizzle/schema.ts so that drizzle-kit type
-- generation keeps working against a database without the extension; the retrieval layer (P2-03)
-- reaches them through raw sql only. chat_messages already has a jsonb "embedding" column, so the
-- vector column there is named embedding_vec.

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(1024);
--> statement-breakpoint
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding vector(1024);
--> statement-breakpoint
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS embedding_vec vector(1024);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS memories_embedding_hnsw ON memories USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS kc_embedding_hnsw ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
