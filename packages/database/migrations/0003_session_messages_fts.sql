CREATE TABLE IF NOT EXISTS session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_session_messages_session_ordinal
  ON session_messages(session_id, ordinal);

CREATE VIRTUAL TABLE IF NOT EXISTS session_messages_fts USING fts5(
  message_id UNINDEXED,
  session_id UNINDEXED,
  role UNINDEXED,
  content,
  tokenize = 'unicode61'
);
