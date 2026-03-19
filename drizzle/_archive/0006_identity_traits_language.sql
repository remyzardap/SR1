-- Migration: Add personalityTraits and primaryLanguage to identities table
ALTER TABLE `identities`
  ADD COLUMN `personalityTraits` json,
  ADD COLUMN `primaryLanguage` varchar(64);
