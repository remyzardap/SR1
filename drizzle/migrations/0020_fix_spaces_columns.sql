-- Fix lowercase column names created by unquoted identifiers in 0018_spaces.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spaces' AND column_name = 'userid') THEN
    ALTER TABLE spaces RENAME COLUMN userid TO "userId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spaces' AND column_name = 'createdat') THEN
    ALTER TABLE spaces RENAME COLUMN createdat TO "createdAt";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spaces' AND column_name = 'updatedat') THEN
    ALTER TABLE spaces RENAME COLUMN updatedat TO "updatedAt";
  END IF;
END $$;
