-- Migration: 0011_chat_sessions_lastmessageat
-- Adds lastMessageAt column to chat_sessions for sorting by recent activity
ALTER TABLE `chat_sessions`
  ADD COLUMN IF NOT EXISTS `lastMessageAt` bigint NULL AFTER `updatedAt`;

-- Backfill with updatedAt value for existing rows
UPDATE `chat_sessions` SET `lastMessageAt` = UNIX_TIMESTAMP(`updatedAt`) * 1000 WHERE `lastMessageAt` IS NULL;
