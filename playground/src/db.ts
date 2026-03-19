import { Database } from "bun:sqlite";

/**
 * Open (or create) a SQLite database at the given path.
 * @param dbPath - Path where database should be created/opened
 * @returns Database instance configured with auto-create enabled
 */
export function getDb(dbPath: string): Database {
  return new Database(dbPath, { create: true });
}

/**
 * Run all schema migrations. Safe to call multiple times (idempotent).
 * @param db - Database instance to apply migrations to
 */
export function runMigrations(db: Database): void {
  // User table: stores authentication and profile information
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    )
  `);

  // Boards table: stores kanban boards owned by users
  db.run(`
    CREATE TABLE IF NOT EXISTS boards (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}
