import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { nanoid } from "nanoid";

const DB_PATH = import.meta.dir + "/../../data/kanban.db";

function openDatabase(path: string): Database {
  mkdirSync(path.substring(0, path.lastIndexOf("/")), { recursive: true });
  return new Database(path, { create: true });
}

let _db: Database | null = null;

export function getDb(path: string = DB_PATH): Database {
  if (_db) return _db;
  _db = openDatabase(path);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  migrate(_db);
  return _db;
}

/** Create a fresh database for testing — no singleton caching */
export function createTestDb(path: string): Database {
  const db = openDatabase(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function resetDb(): void {
  _db = null;
}

function migrate(db: Database): void {
  // Handle legacy schema (columns without board_id)
  const tableExists = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='columns'"
  ).get();
  if (tableExists) {
    const colInfo = db.prepare("PRAGMA table_info(columns)").all() as { name: string }[];
    const hasBoardId = colInfo.some((c) => c.name === "board_id");
    if (!hasBoardId) {
      db.exec("DROP TABLE IF EXISTS cards");
      db.exec("DROP TABLE IF EXISTS columns");
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

// --- Types ---

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface BoardRow {
  id: string;
  title: string;
  user_id: string;
  created_at: string;
}

export interface ColumnRow {
  id: string;
  title: string;
  position: number;
  board_id: string;
}

export interface CardRow {
  id: string;
  title: string;
  description: string;
  position: number;
  column_id: string;
  created_at: string;
}

export interface ColumnWithCards extends ColumnRow {
  cards: CardRow[];
}

// --- User helpers ---

export function createUser(db: Database, username: string, passwordHash: string): UserRow {
  const id = nanoid();
  db.query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)").run(
    id,
    username,
    passwordHash
  );
  return db.query("SELECT id, username, password_hash, created_at FROM users WHERE id = ?").get(
    id
  ) as UserRow;
}

export function getUserByUsername(db: Database, username: string): UserRow | null {
  return db.query(
    "SELECT id, username, password_hash, created_at FROM users WHERE username = ?"
  ).get(username) as UserRow | null;
}

export function getUserById(db: Database, id: string): UserRow | null {
  return db.query("SELECT id, username, password_hash, created_at FROM users WHERE id = ?").get(
    id
  ) as UserRow | null;
}

// --- Board helpers ---

export function getUserBoards(db: Database, userId: string): BoardRow[] {
  return db.query(
    "SELECT id, title, user_id, created_at FROM boards WHERE user_id = ? ORDER BY created_at DESC"
  ).all(userId) as BoardRow[];
}

export function createBoard(db: Database, title: string, userId: string): BoardRow {
  const id = nanoid();
  db.query("INSERT INTO boards (id, title, user_id) VALUES (?, ?, ?)").run(id, title, userId);

  // Seed 3 default columns
  const defaults = ["To Do", "In Progress", "Done"];
  const insert = db.prepare(
    "INSERT INTO columns (id, title, position, board_id) VALUES (?, ?, ?, ?)"
  );
  for (let i = 0; i < defaults.length; i++) {
    insert.run(nanoid(), defaults[i]!, i, id);
  }

  return db.query("SELECT id, title, user_id, created_at FROM boards WHERE id = ?").get(
    id
  ) as BoardRow;
}

export function getBoardById(db: Database, id: string): BoardRow | null {
  return db.query("SELECT id, title, user_id, created_at FROM boards WHERE id = ?").get(
    id
  ) as BoardRow | null;
}

export function deleteBoard(db: Database, id: string): boolean {
  const existing = db.query("SELECT id FROM boards WHERE id = ?").get(id);
  if (!existing) return false;
  db.query("DELETE FROM boards WHERE id = ?").run(id);
  return true;
}

// --- Column helpers ---

export function getAllColumns(db: Database, boardId: string): ColumnWithCards[] {
  const cols = db.query(
    "SELECT id, title, position, board_id FROM columns WHERE board_id = ? ORDER BY position"
  ).all(boardId) as ColumnRow[];

  if (cols.length === 0) return [];

  const colIds = cols.map((c) => c.id);
  const placeholders = colIds.map(() => "?").join(",");
  const cards = db.query(
    `SELECT id, title, description, position, column_id, created_at FROM cards WHERE column_id IN (${placeholders}) ORDER BY position`
  ).all(...colIds) as CardRow[];

  const cardsByColumn = new Map<string, CardRow[]>();
  for (const card of cards) {
    const list = cardsByColumn.get(card.column_id) ?? [];
    list.push(card);
    cardsByColumn.set(card.column_id, list);
  }

  return cols.map((col) => ({
    ...col,
    cards: cardsByColumn.get(col.id) ?? [],
  }));
}

export function getColumnById(db: Database, id: string): ColumnRow | null {
  return db.query("SELECT id, title, position, board_id FROM columns WHERE id = ?").get(
    id
  ) as ColumnRow | null;
}

export function createColumn(db: Database, boardId: string, title: string): ColumnRow {
  const maxPos = db.query(
    "SELECT COALESCE(MAX(position), -1) as m FROM columns WHERE board_id = ?"
  ).get(boardId) as { m: number };
  const id = nanoid();
  const position = maxPos.m + 1;
  db.query("INSERT INTO columns (id, title, position, board_id) VALUES (?, ?, ?, ?)").run(
    id,
    title,
    position,
    boardId
  );
  return { id, title, position, board_id: boardId };
}

export function updateColumn(db: Database, id: string, title: string): ColumnRow | null {
  const existing = db.query("SELECT id, title, position, board_id FROM columns WHERE id = ?").get(
    id
  ) as ColumnRow | null;
  if (!existing) return null;
  db.query("UPDATE columns SET title = ? WHERE id = ?").run(title, id);
  return { ...existing, title };
}

export function deleteColumn(db: Database, id: string): boolean {
  const existing = db.query("SELECT id FROM columns WHERE id = ?").get(id);
  if (!existing) return false;
  db.query("DELETE FROM columns WHERE id = ?").run(id);
  return true;
}

// --- Card helpers ---

export function getCardById(db: Database, id: string): CardRow | null {
  return db.query(
    "SELECT id, title, description, position, column_id, created_at FROM cards WHERE id = ?"
  ).get(id) as CardRow | null;
}

export function createCard(
  db: Database,
  title: string,
  columnId: string,
  description: string = ""
): CardRow | null {
  const col = db.query("SELECT id FROM columns WHERE id = ?").get(columnId);
  if (!col) return null;

  const maxPos = db.query(
    "SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE column_id = ?"
  ).get(columnId) as { m: number };
  const id = nanoid();
  const position = maxPos.m + 1;
  db.query(
    "INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)"
  ).run(id, title, description, position, columnId);

  return db.query(
    "SELECT id, title, description, position, column_id, created_at FROM cards WHERE id = ?"
  ).get(id) as CardRow;
}

export function updateCard(
  db: Database,
  id: string,
  updates: { title?: string; description?: string; columnId?: string; position?: number }
): CardRow | null {
  const existing = db.query(
    "SELECT id, title, description, position, column_id, created_at FROM cards WHERE id = ?"
  ).get(id) as CardRow | null;
  if (!existing) return null;

  const newTitle = updates.title ?? existing.title;
  const newDescription = updates.description ?? existing.description;
  const newColumnId = updates.columnId ?? existing.column_id;
  const newPosition = updates.position ?? existing.position;

  const columnChanged = newColumnId !== existing.column_id;
  const positionChanged = newPosition !== existing.position;

  if (columnChanged || positionChanged) {
    db.query(
      "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?"
    ).run(existing.column_id, existing.position);

    db.query(
      "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?"
    ).run(newColumnId, newPosition);
  }

  db.query(
    "UPDATE cards SET title = ?, description = ?, position = ?, column_id = ? WHERE id = ?"
  ).run(newTitle, newDescription, newPosition, newColumnId, id);

  return db.query(
    "SELECT id, title, description, position, column_id, created_at FROM cards WHERE id = ?"
  ).get(id) as CardRow;
}

export function deleteCard(db: Database, id: string): boolean {
  const existing = db.query("SELECT id, position, column_id FROM cards WHERE id = ?").get(id) as {
    id: string;
    position: number;
    column_id: string;
  } | null;
  if (!existing) return false;

  db.query("DELETE FROM cards WHERE id = ?").run(id);
  db.query(
    "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?"
  ).run(existing.column_id, existing.position);
  return true;
}
