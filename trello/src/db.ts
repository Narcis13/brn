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
  seed(_db);
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      position INTEGER NOT NULL
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

function seed(db: Database): void {
  const count = db.query("SELECT COUNT(*) as c FROM columns").get() as { c: number };
  if (count.c > 0) return;

  const defaults = ["To Do", "In Progress", "Done"];
  const insert = db.prepare("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)");
  for (let i = 0; i < defaults.length; i++) {
    insert.run(nanoid(), defaults[i]!, i);
  }
}

// --- Column helpers ---

export interface ColumnRow {
  id: string;
  title: string;
  position: number;
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

export function getAllColumns(db: Database): ColumnWithCards[] {
  const cols = db.query("SELECT id, title, position FROM columns ORDER BY position").all() as ColumnRow[];
  const cards = db.query("SELECT id, title, description, position, column_id, created_at FROM cards ORDER BY position").all() as CardRow[];

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

export function createColumn(db: Database, title: string): ColumnRow {
  const maxPos = db.query("SELECT COALESCE(MAX(position), -1) as m FROM columns").get() as { m: number };
  const id = nanoid();
  const position = maxPos.m + 1;
  db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run(id, title, position);
  return { id, title, position };
}

export function updateColumn(db: Database, id: string, title: string): ColumnRow | null {
  const existing = db.query("SELECT id, title, position FROM columns WHERE id = ?").get(id) as ColumnRow | null;
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

export function createCard(db: Database, title: string, columnId: string, description: string = ""): CardRow | null {
  const col = db.query("SELECT id FROM columns WHERE id = ?").get(columnId);
  if (!col) return null;

  const maxPos = db.query("SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE column_id = ?").get(columnId) as { m: number };
  const id = nanoid();
  const position = maxPos.m + 1;
  db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run(id, title, description, position, columnId);

  const row = db.query("SELECT id, title, description, position, column_id, created_at FROM cards WHERE id = ?").get(id) as CardRow;
  return row;
}

export function updateCard(
  db: Database,
  id: string,
  updates: { title?: string; description?: string; columnId?: string; position?: number }
): CardRow | null {
  const existing = db.query("SELECT id, title, description, position, column_id, created_at FROM cards WHERE id = ?").get(id) as CardRow | null;
  if (!existing) return null;

  const newTitle = updates.title ?? existing.title;
  const newDescription = updates.description ?? existing.description;
  const newColumnId = updates.columnId ?? existing.column_id;
  const newPosition = updates.position ?? existing.position;

  const columnChanged = newColumnId !== existing.column_id;
  const positionChanged = newPosition !== existing.position;

  if (columnChanged || positionChanged) {
    // Remove from old position
    db.query("UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?").run(
      existing.column_id,
      existing.position
    );

    // Make space in target column
    db.query("UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?").run(
      newColumnId,
      newPosition
    );
  }

  db.query("UPDATE cards SET title = ?, description = ?, position = ?, column_id = ? WHERE id = ?").run(
    newTitle,
    newDescription,
    newPosition,
    newColumnId,
    id
  );

  return db.query("SELECT id, title, description, position, column_id, created_at FROM cards WHERE id = ?").get(id) as CardRow;
}

export function deleteCard(db: Database, id: string): boolean {
  const existing = db.query("SELECT id, position, column_id FROM cards WHERE id = ?").get(id) as { id: string; position: number; column_id: string } | null;
  if (!existing) return false;

  db.query("DELETE FROM cards WHERE id = ?").run(id);
  // Reorder remaining cards
  db.query("UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?").run(
    existing.column_id,
    existing.position
  );
  return true;
}
