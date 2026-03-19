CREATE TABLE `businesses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`currency` varchar(10) DEFAULT 'IDR',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `businesses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `message_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`businessId` int,
	`userId` int,
	`source` enum('whatsapp','web') NOT NULL DEFAULT 'whatsapp',
	`direction` enum('inbound','outbound') NOT NULL DEFAULT 'inbound',
	`content` text,
	`mediaUrl` text,
	`mediaType` varchar(64),
	`processedAs` enum('receipt','task','procurement','unknown'),
	`relatedId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stripePaymentIntentId` varchar(255),
	`stripeInvoiceId` varchar(255),
	`amount` int NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'usd',
	`status` varchar(64) NOT NULL,
	`description` text,
	`receiptUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `procurement_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`businessId` int,
	`userId` int,
	`description` text NOT NULL,
	`quantity` int DEFAULT 1,
	`budgetPerUnit` decimal(15,2),
	`totalBudget` decimal(15,2),
	`currency` varchar(10) DEFAULT 'IDR',
	`location` varchar(255),
	`vendorName` varchar(255),
	`vendorContact` varchar(255),
	`status` enum('open','in_review','approved','rejected','completed') NOT NULL DEFAULT 'open',
	`approvalNote` text,
	`source` enum('whatsapp','web') NOT NULL DEFAULT 'web',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `procurement_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`businessId` int,
	`userId` int,
	`date` timestamp,
	`vendor` varchar(255),
	`description` text,
	`amount` decimal(15,2),
	`taxAmount` decimal(15,2),
	`currency` varchar(10) DEFAULT 'IDR',
	`category` varchar(100),
	`paymentMethod` varchar(64),
	`fileUrl` text,
	`fileKey` varchar(512),
	`status` enum('auto','needs_review','approved','rejected') NOT NULL DEFAULT 'auto',
	`rejectionNote` text,
	`rawText` text,
	`ocrConfidence` decimal(5,2),
	`source` enum('whatsapp','web') NOT NULL DEFAULT 'web',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `receipts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`businessId` int,
	`userId` int,
	`text` text NOT NULL,
	`dueDate` timestamp,
	`category` varchar(100),
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`status` enum('open','in_progress','done','cancelled') NOT NULL DEFAULT 'open',
	`source` enum('whatsapp','web') NOT NULL DEFAULT 'web',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `api_keys` MODIFY COLUMN `provider` enum('kimi','openai','gemini','anthropic') NOT NULL DEFAULT 'openai';