-- Migration: Add chat_messages table for persistent chat history
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id`         VARCHAR(36)  NOT NULL PRIMARY KEY,
  `session_id` VARCHAR(36)  NOT NULL,
  `role`       VARCHAR(16)  NOT NULL,
  `content`    TEXT         NOT NULL,
  `created_at` DATETIME     NOT NULL,
  INDEX `idx_session` (`session_id`)
);
