import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import type { Bookmark } from "./types.ts";

let db: Database | null = null;

export function getDb(dbPath = "playground/data/bookmarks.db"): Database {
  if (db) return db;

  // Ensure parent directory exists (bun:sqlite won't create it)
  const lastSlash = dbPath.lastIndexOf("/");
  if (lastSlash > 0) {
    mkdirSync(dbPath.slice(0, lastSlash), { recursive: true });
  }

  db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )
  `);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function resetDb(): void {
  db = null;
}

export function insertBookmark(database: Database, bookmark: Bookmark): void {
  database
    .prepare(
      "INSERT INTO bookmarks (id, url, title, tags, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      bookmark.id,
      bookmark.url,
      bookmark.title,
      JSON.stringify(bookmark.tags),
      bookmark.created_at
    );
}

export function getAllBookmarks(
  database: Database,
  query?: string,
  tag?: string
): Bookmark[] {
  let sql = "SELECT * FROM bookmarks";
  const conditions: string[] = [];
  const params: string[] = [];

  if (query) {
    conditions.push("(title LIKE ? OR url LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }

  if (tag) {
    conditions.push("tags LIKE ?");
    params.push(`%"${tag}"%`);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY created_at DESC";

  const rows = database.prepare(sql).all(...params) as Array<{
    id: string;
    url: string;
    title: string;
    tags: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    ...row,
    tags: JSON.parse(row.tags) as string[],
  }));
}

export function deleteBookmark(database: Database, id: string): boolean {
  const result = database.prepare("DELETE FROM bookmarks WHERE id = ?").run(id);
  return result.changes > 0;
}

export function bookmarkExistsByUrl(
  database: Database,
  url: string
): boolean {
  const row = database
    .prepare("SELECT 1 FROM bookmarks WHERE url = ?")
    .get(url);
  return row !== null;
}
