-- Migration: Add email verification support
-- Adds emailVerified flag to users and creates email_verification_tokens table

ALTER TABLE `users`
  ADD COLUMN `emailVerified` boolean NOT NULL DEFAULT false;

CREATE TABLE `email_verification_tokens` (
  `id` varchar(36) NOT NULL,
  `userId` int NOT NULL,
  `token` varchar(128) NOT NULL,
  `expiresAt` datetime NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `email_verification_tokens_id` PRIMARY KEY(`id`),
  CONSTRAINT `email_verification_tokens_token_unique` UNIQUE(`token`)
);
