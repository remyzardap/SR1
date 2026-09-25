-- Fix lowercase spaceid column created by unquoted identifier in 0018_spaces.sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'spaceid'
  ) THEN
    ALTER TABLE chat_sessions RENAME COLUMN spaceid TO "spaceId";
  END IF;
END $$;
