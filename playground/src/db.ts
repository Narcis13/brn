import { Database } from "bun:sqlite";

/** Open (or create) a SQLite database at the given path. */
export function getDb(dbPath: string): Database {
  return new Database(dbPath, { create: true });
}

/** Run all schema migrations. Safe to call multiple times (idempotent). */
export function runMigrations(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    )
  `);
}
