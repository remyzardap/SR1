-- ─── Task 5: Skill Ratings ───────────────────────────────────────────────────
ALTER TABLE `skills` ADD COLUMN `forkCount` int NOT NULL DEFAULT 0;
ALTER TABLE `skills` ADD COLUMN `averageRating` float NOT NULL DEFAULT 0;
ALTER TABLE `skills` ADD COLUMN `ratingCount` int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `skill_ratings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `skillId` int NOT NULL,
  `identityId` int NOT NULL,
  `rating` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `skill_ratings_skill_identity_unique` (`skillId`, `identityId`)
);

CREATE INDEX `idx_skill_ratings_skillId` ON `skill_ratings` (`skillId`);
CREATE INDEX `idx_skills_averageRating` ON `skills` (`averageRating`);
CREATE INDEX `idx_skills_forkCount` ON `skills` (`forkCount`);

-- ─── Task 8: Files & File Sharing ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `files` (
  `id` varchar(36) PRIMARY KEY,
  `identityId` int NOT NULL,
  `name` varchar(500) NOT NULL,
  `mimeType` varchar(255) NOT NULL,
  `size` int NOT NULL,
  `url` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX `idx_files_identityId` ON `files` (`identityId`);

CREATE TABLE IF NOT EXISTS `file_shares` (
  `id` varchar(36) PRIMARY KEY,
  `fileId` varchar(36) NOT NULL,
  `identityId` int NOT NULL,
  `token` varchar(64) NOT NULL UNIQUE,
  `passwordHash` varchar(64),
  `expiresAt` bigint,
  `maxAccessCount` int,
  `accessCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX `idx_file_shares_token` ON `file_shares` (`token`);
CREATE INDEX `idx_file_shares_fileId` ON `file_shares` (`fileId`);
CREATE INDEX `idx_file_shares_identityId` ON `file_shares` (`identityId`);

-- ─── Task 6: Memory Full-Text Search Index ───────────────────────────────────
ALTER TABLE `memories` ADD FULLTEXT INDEX `ft_memories_content` (`content`);
ALTER TABLE `chat_messages` ADD FULLTEXT INDEX `ft_chat_content` (`content`);
