CREATE TABLE `chat_messages` (
	`id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`role` varchar(16) NOT NULL,
	`content` text NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`handle` varchar(64),
	`displayName` varchar(255),
	`avatarUrl` text,
	`bio` text,
	`personalityTraits` json,
	`primaryLanguage` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `identities_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `identities_handle_unique` UNIQUE(`handle`)
);
--> statement-breakpoint
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
CREATE TABLE `password_reset_tokens` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`expiresAt` datetime NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
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
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `onboarded` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `totpSecret` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `totpEnabled` boolean DEFAULT false NOT NULL;