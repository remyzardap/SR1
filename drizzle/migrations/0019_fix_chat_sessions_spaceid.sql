-- Fix lowercase spaceid column created by unquoted identifier in 0018_spaces.sql
ALTER TABLE chat_sessions RENAME COLUMN spaceid TO "spaceId";
