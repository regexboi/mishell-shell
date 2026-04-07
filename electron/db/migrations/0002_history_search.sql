CREATE INDEX IF NOT EXISTS command_history_cwd_started_at_idx
  ON command_history(cwd, started_at DESC);

CREATE INDEX IF NOT EXISTS command_history_command_text_started_at_idx
  ON command_history(command_text COLLATE NOCASE, started_at DESC);

CREATE INDEX IF NOT EXISTS command_history_cwd_command_text_started_at_idx
  ON command_history(cwd, command_text COLLATE NOCASE, started_at DESC);
