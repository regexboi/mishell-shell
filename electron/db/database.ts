import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { migrations } from "./migrations";

export type DatabaseSnapshot = {
  path: string;
  appliedMigrations: string[];
};

export type DatabaseContext = {
  db: Database.Database;
  snapshot: DatabaseSnapshot;
};

export function initializeDatabase(dataDirectory: string): DatabaseContext {
  fs.mkdirSync(dataDirectory, { recursive: true });

  const databasePath = path.join(dataDirectory, "mishell.db");
  const db = new Database(databasePath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedMigrations = new Set<string>(
    db
      .prepare<[], { name: string }>("SELECT name FROM app_migrations ORDER BY id ASC")
      .all()
      .map((row) => row.name),
  );

  const insertMigration = db.prepare(
    "INSERT INTO app_migrations (name) VALUES (?)",
  );

  db.transaction(() => {
    for (const migration of migrations) {
      if (appliedMigrations.has(migration.name)) {
        continue;
      }

      db.exec(migration.sql);
      insertMigration.run(migration.name);
      appliedMigrations.add(migration.name);
    }
  })();

  return {
    db,
    snapshot: {
      path: databasePath,
      appliedMigrations: [...appliedMigrations],
    },
  };
}
