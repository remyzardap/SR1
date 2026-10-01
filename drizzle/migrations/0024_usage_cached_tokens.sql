-- Track prompt-cache hits per call so cache effectiveness and discounted cost can be measured
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS cached_input_tokens integer DEFAULT 0 NOT NULL;
