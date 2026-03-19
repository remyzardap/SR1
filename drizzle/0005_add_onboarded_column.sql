-- Migration: Add onboarded column to users table
-- Tracks whether a user has completed the onboarding flow
ALTER TABLE `users` ADD COLUMN `onboarded` boolean NOT NULL DEFAULT false;
