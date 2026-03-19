CREATE TABLE `beta_invite_codes` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `code` varchar(32) NOT NULL UNIQUE,
  `createdBy` int NOT NULL,
  `usedBy` int,
  `maxUses` int,
  `usageCount` int NOT NULL DEFAULT 0,
  `expiresAt` datetime,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
  FOREIGN KEY (`usedBy`) REFERENCES `users`(`id`)
);
