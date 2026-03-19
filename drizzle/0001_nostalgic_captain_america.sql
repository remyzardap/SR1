CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` enum('kimi','openai','gemini') NOT NULL DEFAULT 'openai',
	`encryptedKey` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`originalPrompt` text NOT NULL,
	`format` enum('pdf','docx','xlsx','pptx','md') NOT NULL,
	`styleLabel` varchar(128),
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileSizeBytes` bigint DEFAULT 0,
	`mimeType` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
