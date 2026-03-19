-- EYVA Core Data Model Migration
-- Adds: identities, skills, memories, connections tables

-- ─── identities ───────────────────────────────────────────────────────────────
CREATE TABLE `identities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `handle` varchar(64),
  `displayName` varchar(255),
  `avatarUrl` text,
  `bio` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `identities_id` PRIMARY KEY(`id`),
  CONSTRAINT `identities_userId_unique` UNIQUE(`userId`),
  CONSTRAINT `identities_handle_unique` UNIQUE(`handle`)
);
--> statement-breakpoint

-- ─── skills ───────────────────────────────────────────────────────────────────
CREATE TABLE `skills` (
  `id` int AUTO_INCREMENT NOT NULL,
  `identityId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `type` enum('prompt','workflow','tool_definition','behavior') NOT NULL,
  `content` json NOT NULL,
  `sourceModel` varchar(128),
  `isPublic` boolean NOT NULL DEFAULT false,
  `usageCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `skills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

-- ─── memories ─────────────────────────────────────────────────────────────────
CREATE TABLE `memories` (
  `id` int AUTO_INCREMENT NOT NULL,
  `identityId` int NOT NULL,
  `type` enum('preference','project','document','interaction','fact') NOT NULL,
  `title` varchar(255),
  `content` text NOT NULL,
  `structuredData` json,
  `sourceUrl` text,
  `sourceApp` varchar(128),
  `tags` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

-- ─── connections ──────────────────────────────────────────────────────────────
CREATE TABLE `connections` (
  `id` int AUTO_INCREMENT NOT NULL,
  `identityId` int NOT NULL,
  `provider` varchar(128) NOT NULL,
  `type` enum('llm_api_key','oauth2','generic_api_key') NOT NULL,
  `displayName` varchar(255),
  `encryptedCredentials` text NOT NULL,
  `scopes` json,
  `status` enum('active','revoked','expired') NOT NULL DEFAULT 'active',
  `lastUsedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

-- ─── Foreign key indexes ──────────────────────────────────────────────────────
ALTER TABLE `identities` ADD CONSTRAINT `identities_userId_fk`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `skills` ADD CONSTRAINT `skills_identityId_fk`
  FOREIGN KEY (`identityId`) REFERENCES `identities`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `memories` ADD CONSTRAINT `memories_identityId_fk`
  FOREIGN KEY (`identityId`) REFERENCES `identities`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `connections` ADD CONSTRAINT `connections_identityId_fk`
  FOREIGN KEY (`identityId`) REFERENCES `identities`(`id`) ON DELETE CASCADE;
