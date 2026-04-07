import type Database from "better-sqlite3";

export type CommandHistoryInsert = {
  commandText: string;
  cwd: string;
  shell: string;
  sessionId: string | null;
  startedAt: string;
  durationMs: number | null;
  exitCode: number | null;
  outputPreview: string;
  outputPath: string | null;
};

export function insertCommandHistory(
  db: Database.Database,
  entry: CommandHistoryInsert,
) {
  db.prepare(
    `
      INSERT INTO command_history (
        command_text,
        cwd,
        shell,
        session_id,
        started_at,
        duration_ms,
        exit_code,
        output_preview,
        output_path
      ) VALUES (
        @commandText,
        @cwd,
        @shell,
        @sessionId,
        @startedAt,
        @durationMs,
        @exitCode,
        @outputPreview,
        @outputPath
      )
    `,
  ).run(entry);
}
