import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Open (or create) a SQLite database at the given path.
 * @param dbPath - Path where database should be created/opened
 * @returns Database instance configured with auto-create enabled
 */
export function getDb(dbPath: string): Database {
  mkdirSync(dirname(dbPath), { recursive: true });
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

  // Cards table: stores kanban cards belonging to boards
  db.run(`
    CREATE TABLE IF NOT EXISTS cards (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT,
      board_id    TEXT NOT NULL,
      column_name TEXT NOT NULL,
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    )
  `);

  // Migration: add description column to existing cards tables
  try {
    db.run("ALTER TABLE cards ADD COLUMN description TEXT");
  } catch {
    // Column already exists
  }
}
