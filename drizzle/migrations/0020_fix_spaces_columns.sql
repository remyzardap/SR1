-- Fix lowercase column names created by unquoted identifiers in 0018_spaces.sql
ALTER TABLE spaces RENAME COLUMN IF EXISTS userid TO "userId";
ALTER TABLE spaces RENAME COLUMN IF EXISTS createdat TO "createdAt";
ALTER TABLE spaces RENAME COLUMN IF EXISTS updatedat TO "updatedAt";
