-- Blocks table — universal content unit for Sutaeru
-- Every chat response, Atelier section, memory, task, transcript, and note is a block

CREATE TYPE "block_type" AS ENUM ('chat', 'atelier', 'memory', 'task', 'media', 'transcript', 'widget', 'note');
CREATE TYPE "block_source" AS ENUM ('s1', 'atelier', 'her', 'user', 'feed', 'system');

CREATE TABLE IF NOT EXISTS "blocks" (
  "id"         VARCHAR(36) PRIMARY KEY,
  "userId"     INTEGER NOT NULL,
  "type"       "block_type" NOT NULL,
  "source"     "block_source" NOT NULL DEFAULT 'user',
  "parentId"   VARCHAR(36),
  "sessionId"  VARCHAR(36),
  "title"      TEXT,
  "content"    JSON NOT NULL DEFAULT '{}',
  "agentId"    VARCHAR(64),
  "pinned"     BOOLEAN NOT NULL DEFAULT FALSE,
  "locked"     BOOLEAN NOT NULL DEFAULT FALSE,
  "archived"   BOOLEAN NOT NULL DEFAULT FALSE,
  "tags"       JSON DEFAULT '[]',
  "position"   INTEGER DEFAULT 0,
  "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "blocks_userId_idx"    ON "blocks" ("userId");
CREATE INDEX IF NOT EXISTS "blocks_type_idx"      ON "blocks" ("userId", "type");
CREATE INDEX IF NOT EXISTS "blocks_pinned_idx"    ON "blocks" ("userId", "pinned");
CREATE INDEX IF NOT EXISTS "blocks_sessionId_idx" ON "blocks" ("sessionId");
CREATE INDEX IF NOT EXISTS "blocks_parentId_idx"  ON "blocks" ("parentId");
