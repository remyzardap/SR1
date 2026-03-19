-- Migration: Create audit_logs table
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(64) NOT NULL,
  `action` varchar(128) NOT NULL,
  `resourceType` varchar(64) NOT NULL,
  `resourceId` varchar(128),
  `changes` json,
  `metadata` json,
  `severity` varchar(16) NOT NULL DEFAULT 'info',
  `status` varchar(16) NOT NULL DEFAULT 'success',
  `errorMessage` text,
  `sessionId` varchar(128),
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE INDEX `audit_logs_user_id_idx` ON `audit_logs` (`userId`);
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`createdAt`);
CREATE INDEX `audit_logs_severity_idx` ON `audit_logs` (`severity`);
