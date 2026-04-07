import type Database from "better-sqlite3";

import type {
  HistoryAutocompleteItem,
  HistoryEntry,
  HistoryRecallItem,
} from "@shared/contracts";

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

type HistoryRow = {
  id: number;
  command_text: string;
  cwd: string;
  shell: string;
  session_id: string | null;
  started_at: string;
  duration_ms: number | null;
  exit_code: number | null;
  output_preview: string | null;
  output_path: string | null;
  cwd_match: number;
};

type RecallRow = {
  id: number;
  command_text: string;
  started_at: string;
  duration_ms: number | null;
  exit_code: number | null;
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

export function queryHistoryAutocomplete(
  db: Database.Database,
  input: {
    draft: string;
    cwd: string;
    limit: number;
  },
) {
  const normalizedDraft = input.draft.trim();
  const containsDraft = normalizedDraft
    ? `%${escapeLike(normalizedDraft)}%`
    : "%";

  const rows = db
    .prepare<[string, string, string], HistoryRow>(
      `
        SELECT
          id,
          command_text,
          cwd,
          shell,
          session_id,
          started_at,
          duration_ms,
          exit_code,
          output_preview,
          output_path,
          CASE WHEN cwd = ? THEN 1 ELSE 0 END AS cwd_match
        FROM command_history
        WHERE command_text LIKE ? ESCAPE '\\' COLLATE NOCASE
        ORDER BY
          CASE WHEN cwd = ? THEN 1 ELSE 0 END DESC,
          started_at DESC,
          id DESC
        LIMIT 240
      `,
    )
    .all(input.cwd, containsDraft, input.cwd);

  const seen = new Set<string>();
  const items: HistoryAutocompleteItem[] = [];

  for (const row of rows) {
    const commandKey = row.command_text.toLocaleLowerCase();

    if (
      seen.has(commandKey) ||
      commandKey === normalizedDraft.toLocaleLowerCase()
    ) {
      continue;
    }

    seen.add(commandKey);
    items.push({
      commandText: row.command_text,
      cwd: row.cwd,
      lastStartedAt: row.started_at,
      usageCount: countCommandUsage(db, row.command_text),
      lastExitCode: row.exit_code,
      outputPreview: row.output_preview ?? "",
      cwdMatch: Boolean(row.cwd_match),
    });

    if (items.length >= Math.max(input.limit * 4, 24)) {
      break;
    }
  }

  return {
    items: items
      .sort((left, right) => {
        return compareAutocompleteItems(left, right, normalizedDraft);
      })
      .slice(0, input.limit),
  };
}

export function queryHistorySearch(
  db: Database.Database,
  input: {
    query: string;
    cwd: string;
    limit: number;
  },
) {
  const normalizedQuery = input.query.trim();
  const searchTerms = tokenizeSearchQuery(normalizedQuery);
  const whereClauses = searchTerms.map(
    (_term, index) =>
      `(command_text LIKE @term${index} ESCAPE '\\' COLLATE NOCASE OR cwd LIKE @term${index} ESCAPE '\\' COLLATE NOCASE)`,
  );

  const params: Record<string, number | string> = {
    cwd: input.cwd,
    limit: input.limit,
    query: normalizedQuery,
    prefixQuery: `${escapeLike(normalizedQuery)}%`,
    containsQuery: `%${escapeLike(normalizedQuery)}%`,
  };

  for (const [index, term] of searchTerms.entries()) {
    params[`term${index}`] = `%${escapeLike(term)}%`;
  }

  const rows = db
    .prepare<Record<string, number | string>, HistoryRow>(
      `
        SELECT
          id,
          command_text,
          cwd,
          shell,
          session_id,
          started_at,
          duration_ms,
          exit_code,
          output_preview,
          output_path,
          CASE WHEN cwd = @cwd THEN 1 ELSE 0 END AS cwd_match
        FROM command_history
        ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""}
        ORDER BY
          CASE
            WHEN @query <> '' AND command_text = @query COLLATE NOCASE THEN 5
            WHEN @query <> '' AND command_text LIKE @prefixQuery ESCAPE '\\' COLLATE NOCASE THEN 4
            WHEN @query <> '' AND command_text LIKE @containsQuery ESCAPE '\\' COLLATE NOCASE THEN 3
            WHEN @query <> '' AND cwd LIKE @prefixQuery ESCAPE '\\' COLLATE NOCASE THEN 2
            WHEN @query <> '' AND cwd LIKE @containsQuery ESCAPE '\\' COLLATE NOCASE THEN 1
            ELSE 0
          END DESC,
          CASE WHEN cwd = @cwd THEN 1 ELSE 0 END DESC,
          started_at DESC,
          id DESC
        LIMIT @limit
      `,
    )
    .all(params);

  return {
    items: rows.map(mapHistoryEntry),
  };
}

export function queryHistoryRecall(
  db: Database.Database,
  input: {
    cwd: string;
    limit: number;
  },
) {
  const rows = db
    .prepare<[string, number], RecallRow>(
      `
        SELECT
          id,
          command_text,
          started_at,
          duration_ms,
          exit_code
        FROM command_history
        WHERE cwd = ?
        ORDER BY started_at DESC, id DESC
        LIMIT ?
      `,
    )
    .all(input.cwd, input.limit);

  return {
    items: rows.map(
      (row): HistoryRecallItem => ({
        id: row.id,
        commandText: row.command_text,
        startedAt: row.started_at,
        durationMs: row.duration_ms,
        exitCode: row.exit_code,
      }),
    ),
  };
}

function countCommandUsage(db: Database.Database, commandText: string) {
  const result = db
    .prepare<[string], { usage_count: number }>(
      `
        SELECT COUNT(*) AS usage_count
        FROM command_history
        WHERE command_text = ?
      `,
    )
    .get(commandText);

  return result?.usage_count ?? 1;
}

function compareAutocompleteItems(
  left: HistoryAutocompleteItem,
  right: HistoryAutocompleteItem,
  draft: string,
) {
  const scoreDifference =
    autocompleteScore(right, draft) - autocompleteScore(left, draft);

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  if (left.cwdMatch !== right.cwdMatch) {
    return Number(right.cwdMatch) - Number(left.cwdMatch);
  }

  const startedAtDifference =
    Date.parse(right.lastStartedAt) - Date.parse(left.lastStartedAt);

  if (startedAtDifference !== 0) {
    return startedAtDifference;
  }

  return left.commandText.localeCompare(right.commandText);
}

function autocompleteScore(item: HistoryAutocompleteItem, draft: string) {
  const normalizedDraft = draft.toLocaleLowerCase();
  const normalizedCommand = item.commandText.toLocaleLowerCase();

  if (!normalizedDraft) {
    return item.cwdMatch ? 2 : 1;
  }

  if (normalizedCommand === normalizedDraft) {
    return 0;
  }

  if (normalizedCommand.startsWith(normalizedDraft)) {
    return item.cwdMatch ? 6 : 5;
  }

  if (normalizedCommand.includes(normalizedDraft)) {
    return item.cwdMatch ? 4 : 3;
  }

  return item.cwdMatch ? 2 : 1;
}

function mapHistoryEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    commandText: row.command_text,
    cwd: row.cwd,
    shell: row.shell,
    sessionId: row.session_id,
    startedAt: row.started_at,
    durationMs: row.duration_ms,
    exitCode: row.exit_code,
    outputPreview: row.output_preview ?? "",
    outputPath: row.output_path,
    cwdMatch: Boolean(row.cwd_match),
  };
}

function tokenizeSearchQuery(query: string) {
  return query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
