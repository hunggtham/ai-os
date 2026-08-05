ALTER TABLE memories ADD COLUMN expires_at TEXT;
ALTER TABLE memories ADD COLUMN supersedes TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_expiry
  ON memories(status, expires_at);
