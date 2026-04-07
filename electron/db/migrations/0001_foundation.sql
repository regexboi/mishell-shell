CREATE TABLE IF NOT EXISTS app_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS command_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_text TEXT NOT NULL,
  cwd TEXT NOT NULL,
  shell TEXT NOT NULL,
  session_id TEXT,
  started_at TEXT NOT NULL,
  duration_ms INTEGER,
  exit_code INTEGER,
  output_preview TEXT,
  output_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS command_history_started_at_idx
  ON command_history(started_at DESC);

CREATE INDEX IF NOT EXISTS command_history_cwd_idx
  ON command_history(cwd);
