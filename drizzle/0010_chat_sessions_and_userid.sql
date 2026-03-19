-- Migration: 0010_chat_sessions_and_userid
-- Adds chat_sessions table and userId + model columns to chat_messages

-- 1. Create chat_sessions table
CREATE TABLE IF NOT EXISTS `chat_sessions` (
  `id` varchar(36) NOT NULL,
  `userId` int NOT NULL,
  `title` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `chat_sessions_userId_idx` (`userId`)
);

-- 2. Add userId column to chat_messages (nullable for backward compat with existing rows)
ALTER TABLE `chat_messages`
  ADD COLUMN IF NOT EXISTS `userId` int NULL AFTER `id`;

-- 3. Add model column to chat_messages
ALTER TABLE `chat_messages`
  ADD COLUMN IF NOT EXISTS `model` varchar(128) NULL AFTER `content`;

-- 4. Add index on chat_messages.userId for fast per-user queries
ALTER TABLE `chat_messages`
  ADD INDEX IF NOT EXISTS `chat_messages_userId_idx` (`userId`);
