-- Add embedding vector storage for semantic chat search
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS embedding jsonb;
