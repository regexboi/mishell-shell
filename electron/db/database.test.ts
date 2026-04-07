import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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
});
