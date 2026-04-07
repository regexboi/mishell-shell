import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { insertCommandHistory } from "./command-history";
import { initializeDatabase } from "./database";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0, tempDirectories.length)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("initializeDatabase", () => {
  it("creates the database file and applies the foundation migration", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mishell-db-"));
    tempDirectories.push(directory);

    const { db, snapshot } = initializeDatabase(directory);
    const tables = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      )
      .all()
      .map((row) => row.name);

    expect(fs.existsSync(snapshot.path)).toBe(true);
    expect(snapshot.appliedMigrations).toContain("0001_foundation");
    expect(tables).toContain("command_history");

    db.close();
  });

  it("persists command execution metadata for later history queries", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mishell-db-"));
    tempDirectories.push(directory);

    const { db } = initializeDatabase(directory);

    insertCommandHistory(db, {
      commandText: "pwd",
      cwd: "/tmp/project",
      shell: "/bin/zsh",
      sessionId: "session-1",
      startedAt: "2026-04-06T12:00:00.000Z",
      durationMs: 42,
      exitCode: 0,
      outputPreview: "/tmp/project",
      outputPath: "/tmp/project/output.log",
    });

    const row = db
      .prepare<
        [],
        {
          command_text: string;
          cwd: string;
          duration_ms: number;
          exit_code: number;
          output_preview: string;
        }
      >(
        `
          SELECT command_text, cwd, duration_ms, exit_code, output_preview
          FROM command_history
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      .get();

    expect(row).toEqual({
      command_text: "pwd",
      cwd: "/tmp/project",
      duration_ms: 42,
      exit_code: 0,
      output_preview: "/tmp/project",
    });

    db.close();
  });
});
