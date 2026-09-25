-- Stage D: Spaces (project folders)
CREATE TABLE IF NOT EXISTS spaces (
  id varchar(36) PRIMARY KEY,
  userId integer NOT NULL,
  name varchar(255) NOT NULL,
  description text,
  settings jsonb DEFAULT '{}'::jsonb,
  createdAt timestamp DEFAULT now() NOT NULL,
  updatedAt timestamp DEFAULT now() NOT NULL
);

ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS spaceId varchar(36);

CREATE INDEX IF NOT EXISTS idx_spaces_userId ON spaces(userId);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_spaceId ON chat_sessions(spaceId);
