-- Stage C2: per-thread and per-message settings, skill approval
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false;
UPDATE skills SET approved = true WHERE "isPublic" = true;
