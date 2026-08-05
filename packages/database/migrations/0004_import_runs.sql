CREATE TABLE import_runs (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','skipped')),
  sessions_count INTEGER NOT NULL DEFAULT 0,
  messages_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX idx_import_runs_source
  ON import_runs(source_path, project_id, provider, started_at DESC);

CREATE INDEX idx_import_runs_hash
  ON import_runs(content_hash, project_id, provider, status);
