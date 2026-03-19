-- Migration: Create agents and agent_sessions tables for multi-agent chat
-- Also adds agentId column to chat_messages

CREATE TABLE IF NOT EXISTS `agents` (
  `id`           VARCHAR(255) NOT NULL PRIMARY KEY,
  `name`         VARCHAR(255) NOT NULL,
  `slug`         VARCHAR(255) NOT NULL UNIQUE,
  `description`  TEXT NOT NULL,
  `systemPrompt` TEXT NOT NULL,
  `avatarUrl`    VARCHAR(512),
  `color`        VARCHAR(50) NOT NULL DEFAULT '#6366f1',
  `isActive`     BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt`    BIGINT NOT NULL,
  `updatedAt`    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS `agent_sessions` (
  `id`           VARCHAR(255) NOT NULL PRIMARY KEY,
  `sessionId`    VARCHAR(255) NOT NULL,
  `agentId`      VARCHAR(255) NOT NULL,
  `startedAt`    BIGINT NOT NULL,
  `endedAt`      BIGINT,
  `messageCount` INT NOT NULL DEFAULT 0
  -- Foreign keys omitted for compatibility with partial migration states
);

-- Add agentId to chat_messages (nullable — null means user message)
ALTER TABLE `chat_messages` ADD COLUMN `agentId` VARCHAR(255);

-- Seed default agents
INSERT IGNORE INTO `agents` (`id`, `name`, `slug`, `description`, `systemPrompt`, `color`, `isActive`, `createdAt`, `updatedAt`) VALUES
  ('agent_general',  'General Assistant', 'general',  'A helpful all-around assistant.',    'You are a helpful, friendly, and knowledgeable assistant named Sutaeru. Be concise and clear.',                                                                                '#6366f1', TRUE, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('agent_code',     'Code Helper',       'code',     'Expert in software engineering.',    'You are an expert software engineer. Provide precise, well-commented code examples. Prefer TypeScript, follow best practices, and explain your reasoning.',                     '#10b981', TRUE, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('agent_creative', 'Creative Writer',   'creative', 'Specializes in creative content.',   'You are a creative writer with a vivid imagination. Craft engaging, original content with rich detail and emotional depth. Adapt tone to the request.',                         '#f59e0b', TRUE, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('agent_analyst',  'Data Analyst',      'analyst',  'Business and data analysis expert.', 'You are a precise data analyst and business consultant. Use structured analysis, provide actionable insights, and back your reasoning with logic and data.',                    '#3b82f6', TRUE, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000);
