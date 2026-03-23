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

  // Add new columns to cards table if they don't exist
  const cardColumns = db.prepare("PRAGMA table_info(cards)").all() as { name: string }[];
  const cardColumnNames = cardColumns.map(c => c.name);
  
  if (!cardColumnNames.includes('due_date')) {
    db.exec("ALTER TABLE cards ADD COLUMN due_date TEXT DEFAULT NULL");
  }
  if (!cardColumnNames.includes('start_date')) {
    db.exec("ALTER TABLE cards ADD COLUMN start_date TEXT DEFAULT NULL");
  }
  if (!cardColumnNames.includes('checklist')) {
    db.exec("ALTER TABLE cards ADD COLUMN checklist TEXT DEFAULT '[]'");
  }
  if (!cardColumnNames.includes('updated_at')) {
    db.exec("ALTER TABLE cards ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
    // Set updated_at to created_at for existing cards
    db.exec("UPDATE cards SET updated_at = created_at WHERE updated_at = datetime('now')");
  }

  // Create labels table
  db.exec(`
    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK(length(name) <= 30),
      color TEXT NOT NULL,
      position INTEGER NOT NULL,
      UNIQUE(board_id, name)
    )
  `);

  // Create card_labels junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_labels (
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
      PRIMARY KEY (card_id, label_id)
    )
  `);

  // Create activity table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      detail TEXT DEFAULT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
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
  due_date: string | null;
  start_date: string | null;
  checklist: string;
  updated_at: string;
}

export interface ColumnWithCards extends ColumnRow {
  cards: CardRow[];
}

export interface LabelRow {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
}

export interface CardLabelRow {
  card_id: string;
  label_id: string;
}

export interface ActivityRow {
  id: string;
  card_id: string;
  board_id: string;
  action: string;
  detail: string | null;
  timestamp: string;
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
    `SELECT id, title, description, position, column_id, created_at, due_date, start_date, checklist, updated_at FROM cards WHERE column_id IN (${placeholders}) ORDER BY position`
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
    "SELECT id, title, description, position, column_id, created_at, due_date, start_date, checklist, updated_at FROM cards WHERE id = ?"
  ).get(id) as CardRow | null;
}

export function createCard(
  db: Database,
  title: string,
  columnId: string,
  description: string = ""
): CardRow | null {
  const col = db.query("SELECT id, board_id FROM columns WHERE id = ?").get(columnId) as { id: string; board_id: string } | null;
  if (!col) return null;

  const maxPos = db.query(
    "SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE column_id = ?"
  ).get(columnId) as { m: number };
  const id = nanoid();
  const position = maxPos.m + 1;
  db.query(
    "INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)"
  ).run(id, title, description, position, columnId);

  // Create activity for card creation
  createActivity(db, id, col.board_id, "created");

  return db.query(
    "SELECT id, title, description, position, column_id, created_at, due_date, start_date, checklist, updated_at FROM cards WHERE id = ?"
  ).get(id) as CardRow;
}

export function updateCard(
  db: Database,
  id: string,
  updates: {
    title?: string;
    description?: string;
    columnId?: string;
    position?: number;
    dueDate?: string | null;
    startDate?: string | null;
    checklist?: string;
  }
): CardRow | null {
  const existing = db.query(
    "SELECT id, title, description, position, column_id, created_at, due_date, start_date, checklist, updated_at FROM cards WHERE id = ?"
  ).get(id) as CardRow | null;
  if (!existing) return null;

  const newTitle = updates.title ?? existing.title;
  const newDescription = updates.description ?? existing.description;
  const newColumnId = updates.columnId ?? existing.column_id;
  const newPosition = updates.position ?? existing.position;
  const newDueDate = updates.dueDate !== undefined ? updates.dueDate : existing.due_date;
  const newStartDate = updates.startDate !== undefined ? updates.startDate : existing.start_date;
  const newChecklist = updates.checklist ?? existing.checklist;

  // Validate dates
  if (newStartDate && newDueDate && newStartDate > newDueDate) {
    return null; // Invalid date range
  }

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
    "UPDATE cards SET title = ?, description = ?, position = ?, column_id = ?, due_date = ?, start_date = ?, checklist = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(newTitle, newDescription, newPosition, newColumnId, newDueDate, newStartDate, newChecklist, id);

  return db.query(
    "SELECT id, title, description, position, column_id, created_at, due_date, start_date, checklist, updated_at FROM cards WHERE id = ?"
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

// --- Label helpers ---

export function getBoardLabels(db: Database, boardId: string): LabelRow[] {
  return db.query(
    "SELECT id, board_id, name, color, position FROM labels WHERE board_id = ? ORDER BY position"
  ).all(boardId) as LabelRow[];
}

export function getLabelById(db: Database, id: string): LabelRow | null {
  return db.query("SELECT id, board_id, name, color, position FROM labels WHERE id = ?").get(
    id
  ) as LabelRow | null;
}

export function createLabel(db: Database, boardId: string, name: string, color: string): LabelRow {
  const id = nanoid();
  
  // Get next position
  const result = db.query(
    "SELECT MAX(position) as maxPos FROM labels WHERE board_id = ?"
  ).get(boardId) as { maxPos: number | null };
  const position = (result.maxPos ?? -1) + 1;
  
  db.query(
    "INSERT INTO labels (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)"
  ).run(id, boardId, name, color, position);
  
  return db.query(
    "SELECT id, board_id, name, color, position FROM labels WHERE id = ?"
  ).get(id) as LabelRow;
}

export function updateLabel(
  db: Database,
  id: string,
  updates: { name?: string; color?: string; position?: number }
): LabelRow | null {
  const existing = db.query(
    "SELECT id, board_id, name, color, position FROM labels WHERE id = ?"
  ).get(id) as LabelRow | null;
  if (!existing) return null;
  
  const newName = updates.name ?? existing.name;
  const newColor = updates.color ?? existing.color;
  const newPosition = updates.position ?? existing.position;
  
  // Handle position reordering if position changed
  if (updates.position !== undefined && newPosition !== existing.position) {
    // Remove from current position
    db.query(
      "UPDATE labels SET position = position - 1 WHERE board_id = ? AND position > ?"
    ).run(existing.board_id, existing.position);
    
    // Make room at new position
    db.query(
      "UPDATE labels SET position = position + 1 WHERE board_id = ? AND position >= ?"
    ).run(existing.board_id, newPosition);
  }
  
  db.query(
    "UPDATE labels SET name = ?, color = ?, position = ? WHERE id = ?"
  ).run(newName, newColor, newPosition, id);
  
  return db.query(
    "SELECT id, board_id, name, color, position FROM labels WHERE id = ?"
  ).get(id) as LabelRow;
}

export function deleteLabel(db: Database, id: string): boolean {
  const existing = db.query(
    "SELECT id, board_id, position FROM labels WHERE id = ?"
  ).get(id) as { id: string; board_id: string; position: number } | null;
  if (!existing) return false;
  
  // Delete label (cascade will remove card-label associations)
  db.query("DELETE FROM labels WHERE id = ?").run(id);
  
  // Update positions
  db.query(
    "UPDATE labels SET position = position - 1 WHERE board_id = ? AND position > ?"
  ).run(existing.board_id, existing.position);
  
  return true;
}

// --- Card-Label helpers ---

export function getCardLabels(db: Database, cardId: string): LabelRow[] {
  return db.query(
    `SELECT l.id, l.board_id, l.name, l.color, l.position 
     FROM labels l 
     JOIN card_labels cl ON l.id = cl.label_id 
     WHERE cl.card_id = ? 
     ORDER BY l.position`
  ).all(cardId) as LabelRow[];
}

export function assignLabelToCard(db: Database, cardId: string, labelId: string): boolean {
  try {
    db.query("INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)").run(cardId, labelId);
    return true;
  } catch (err) {
    // Will fail if already assigned (unique constraint) or if card/label doesn't exist (FK constraint)
    return false;
  }
}

export function removeLabelFromCard(db: Database, cardId: string, labelId: string): boolean {
  const result = db.query(
    "DELETE FROM card_labels WHERE card_id = ? AND label_id = ?"
  ).run(cardId, labelId);
  return result.changes > 0;
}

// --- Activity helpers ---

export function createActivity(
  db: Database,
  cardId: string,
  boardId: string,
  action: string,
  detail: unknown = null
): ActivityRow {
  const id = nanoid();
  const detailJson = detail ? JSON.stringify(detail) : null;
  
  db.query(
    "INSERT INTO activity (id, card_id, board_id, action, detail) VALUES (?, ?, ?, ?, ?)"
  ).run(id, cardId, boardId, action, detailJson);
  
  return db.query(
    "SELECT id, card_id, board_id, action, detail, timestamp FROM activity WHERE id = ?"
  ).get(id) as ActivityRow;
}

export function getCardActivity(
  db: Database,
  cardId: string,
  limit: number = 50,
  offset: number = 0
): ActivityRow[] {
  return db.query(
    `SELECT id, card_id, board_id, action, detail, timestamp 
     FROM activity 
     WHERE card_id = ? 
     ORDER BY timestamp DESC 
     LIMIT ? OFFSET ?`
  ).all(cardId, limit, offset) as ActivityRow[];
}

export function updateCardWithActivity(
  db: Database,
  id: string,
  boardId: string,
  updates: {
    title?: string;
    description?: string;
    columnId?: string;
    position?: number;
    dueDate?: string | null;
    startDate?: string | null;
    checklist?: string;
  }
): CardRow | null {
  const existing = db.query(
    "SELECT id, title, description, position, column_id, created_at, due_date, start_date, checklist, updated_at FROM cards WHERE id = ?"
  ).get(id) as CardRow | null;
  if (!existing) return null;

  // Track what changed for activity logging
  const changes: string[] = [];
  const columnChanged = updates.columnId && updates.columnId !== existing.column_id;

  if (updates.title !== undefined && updates.title !== existing.title) {
    changes.push("title");
  }
  if (updates.description !== undefined && updates.description !== existing.description) {
    changes.push("description");
  }
  if ((updates.dueDate !== undefined && updates.dueDate !== existing.due_date) ||
      (updates.startDate !== undefined && updates.startDate !== existing.start_date)) {
    changes.push("dates");
  }
  if (updates.checklist !== undefined && updates.checklist !== existing.checklist) {
    changes.push("checklist");
  }

  // Perform the update
  const updatedCard = updateCard(db, id, updates);
  if (!updatedCard) return null;

  // Create activity entries
  if (columnChanged) {
    // Get column names for the activity detail
    const oldCol = getColumnById(db, existing.column_id);
    const newCol = getColumnById(db, updates.columnId!);
    if (oldCol && newCol) {
      createActivity(db, id, boardId, "moved", {
        from: oldCol.title,
        to: newCol.title
      });
    }
  } else if (changes.length > 0) {
    // Log edited activity if not a move
    if (changes.includes("dates")) {
      createActivity(db, id, boardId, "dates_changed");
    } else {
      createActivity(db, id, boardId, "edited");
    }
  }

  return updatedCard;
}

export interface CardDetail extends CardRow {
  labels: LabelRow[];
  activity: ActivityRow[];
  checklist_total: number;
  checklist_done: number;
}

export function getCardDetail(db: Database, cardId: string): CardDetail | null {
  const card = getCardById(db, cardId);
  if (!card) return null;

  const labels = getCardLabels(db, cardId);
  const activity = getCardActivity(db, cardId, 50); // Last 50 entries

  // Parse checklist to compute total/done
  let checklistTotal = 0;
  let checklistDone = 0;
  try {
    const checklist = JSON.parse(card.checklist) as Array<{ id: string; text: string; checked: boolean }>;
    checklistTotal = checklist.length;
    checklistDone = checklist.filter(item => item.checked).length;
  } catch {
    // Invalid JSON, defaults to 0
  }

  return {
    ...card,
    labels,
    activity,
    checklist_total: checklistTotal,
    checklist_done: checklistDone
  };
}

// --- Search helpers ---

function formatDateOnly(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export type SearchDueFilter = "overdue" | "today" | "week" | "none";

export interface CardSearchResult extends CardRow {
  column_title: string;
  labels: LabelRow[];
}

export function searchCards(
  db: Database,
  boardId: string,
  params: {
    q?: string;
    labelId?: string;
    due?: SearchDueFilter;
  }
): CardSearchResult[] {
  let sql = `
    SELECT DISTINCT 
      c.id, c.title, c.description, c.position, c.column_id, c.created_at,
      c.due_date, c.start_date, c.checklist, c.updated_at,
      col.title as column_title
    FROM cards c
    JOIN columns col ON c.column_id = col.id
    WHERE col.board_id = ?
  `;
  const sqlParams: (string | number)[] = [boardId];

  // Text search in title or description
  const query = params.q?.trim();
  if (query) {
    sql += " AND (LOWER(c.title) LIKE LOWER(?) ESCAPE '\\' OR LOWER(c.description) LIKE LOWER(?) ESCAPE '\\')";
    const searchPattern = `%${escapeLikePattern(query)}%`;
    sqlParams.push(searchPattern, searchPattern);
  }

  // Label filter
  if (params.labelId) {
    sql += " AND EXISTS (SELECT 1 FROM card_labels cl WHERE cl.card_id = c.id AND cl.label_id = ?)";
    sqlParams.push(params.labelId);
  }

  // Due date filter
  if (params.due) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const todayStr = formatDateOnly(today);

    switch (params.due) {
      case "overdue":
        sql += " AND c.due_date IS NOT NULL AND c.due_date < ?";
        sqlParams.push(todayStr);
        break;
      case "today":
        sql += " AND c.due_date = ?";
        sqlParams.push(todayStr);
        break;
      case "week":
        const weekFromNow = new Date(today);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        const weekStr = formatDateOnly(weekFromNow);
        sql += " AND c.due_date IS NOT NULL AND c.due_date > ? AND c.due_date <= ?";
        sqlParams.push(todayStr, weekStr);
        break;
      case "none":
        sql += " AND c.due_date IS NULL";
        break;
    }
  }

  sql += " ORDER BY col.position, c.position";

  const cards = db.query(sql).all(...sqlParams) as (CardRow & { column_title: string })[];

  // Fetch labels for all cards
  const cardIds = cards.map(c => c.id);
  if (cardIds.length === 0) return [];

  const placeholders = cardIds.map(() => "?").join(",");
  const labels = db.query(`
    SELECT cl.card_id, l.id, l.board_id, l.name, l.color, l.position
    FROM card_labels cl
    JOIN labels l ON cl.label_id = l.id
    WHERE cl.card_id IN (${placeholders})
    ORDER BY l.position
  `).all(...cardIds) as (LabelRow & { card_id: string })[];

  // Group labels by card
  const labelsByCard = new Map<string, LabelRow[]>();
  for (const labelWithCard of labels) {
    const { card_id, ...label } = labelWithCard;
    const list = labelsByCard.get(card_id) ?? [];
    list.push(label);
    labelsByCard.set(card_id, list);
  }

  // Combine cards with their labels
  return cards.map(card => ({
    ...card,
    labels: labelsByCard.get(card.id) ?? []
  }));
}

// --- Column reorder helpers ---

export function reorderColumns(db: Database, boardId: string, columnIds: string[]): boolean {
  // Verify all columns exist and belong to the board
  const existing = db.query(
    "SELECT id FROM columns WHERE board_id = ? ORDER BY position"
  ).all(boardId) as { id: string }[];

  const existingIds = existing.map(col => col.id);
  const existingSet = new Set(existingIds);
  const providedSet = new Set(columnIds);

  // Check if all existing columns are in the provided list
  if (
    existingIds.length !== columnIds.length ||
    providedSet.size !== columnIds.length ||
    !columnIds.every((id) => existingSet.has(id))
  ) {
    return false;
  }

  // Update positions
  const updateStmt = db.prepare("UPDATE columns SET position = ? WHERE id = ?");
  for (let i = 0; i < columnIds.length; i++) {
    const columnId = columnIds[i];
    if (columnId === undefined) {
      return false;
    }
    updateStmt.run(i, columnId);
  }

  return true;
}
