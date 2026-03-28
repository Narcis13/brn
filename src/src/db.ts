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
    db.exec("ALTER TABLE cards ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
    // Backfill: use created_at for existing rows, then rely on app logic for new inserts
    db.exec("UPDATE cards SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at = ''");
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

  // Add user_id column to activity table (nullable for legacy entries)
  const activityColumns = db.prepare("PRAGMA table_info(activity)").all() as { name: string }[];
  const activityColumnNames = activityColumns.map(c => c.name);
  if (!activityColumnNames.includes('user_id')) {
    db.exec("ALTER TABLE activity ADD COLUMN user_id TEXT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL");
  }

  // Migrate activity table: make card_id nullable (needed for board-level artifact activity)
  const activityCardCol = (db.prepare("PRAGMA table_info(activity)").all() as { name: string; notnull: number }[])
    .find(c => c.name === "card_id");
  if (activityCardCol && activityCardCol.notnull === 1) {
    db.exec(`
      CREATE TABLE activity_new (
        id TEXT PRIMARY KEY,
        card_id TEXT DEFAULT NULL REFERENCES cards(id) ON DELETE CASCADE,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        detail TEXT DEFAULT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        user_id TEXT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    db.exec("INSERT INTO activity_new SELECT id, card_id, board_id, action, detail, timestamp, user_id FROM activity");
    db.exec("DROP TABLE activity");
    db.exec("ALTER TABLE activity_new RENAME TO activity");
  }

  // Create board_members table
  db.exec(`
    CREATE TABLE IF NOT EXISTS board_members (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'member')),
      invited_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (board_id, user_id)
    )
  `);

  // Create comments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 5000),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create reactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL CHECK(target_type IN ('comment', 'activity')),
      target_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL CHECK(length(emoji) BETWEEN 1 AND 10),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(target_type, target_id, user_id, emoji)
    )
  `);

  // Create card_watchers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_watchers (
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (card_id, user_id)
    )
  `);

  // Backfill board_members for existing boards (add creators as owners)
  db.exec(`
    INSERT OR IGNORE INTO board_members (board_id, user_id, role)
    SELECT id, user_id, 'owner' FROM boards
  `);

  // Create artifacts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      card_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      filetype TEXT NOT NULL CHECK(filetype IN ('md', 'html', 'js', 'ts', 'sh')),
      content TEXT NOT NULL,
      position INTEGER NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(card_id, filename)
    )
  `);

  // Create unique index for board-level artifacts
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_board_artifacts_unique 
    ON artifacts(board_id, filename) 
    WHERE card_id IS NULL
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

export interface BoardCard extends CardRow {
  labels: LabelRow[];
  checklist_total: number;
  checklist_done: number;
}

export interface ColumnWithCards extends ColumnRow {
  cards: BoardCard[];
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
  card_id: string | null;
  board_id: string;
  action: string;
  detail: string | null;
  timestamp: string;
  user_id: string | null;
}

export interface BoardMemberRow {
  board_id: string;
  user_id: string;
  role: "owner" | "member";
  invited_at: string;
}

export interface CommentRow {
  id: string;
  card_id: string;
  board_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ArtifactRow {
  id: string;
  board_id: string;
  card_id: string | null;
  filename: string;
  filetype: "md" | "html" | "js" | "ts" | "sh";
  content: string;
  position: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
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
    `SELECT DISTINCT b.id, b.title, b.user_id, b.created_at
     FROM boards b
     JOIN board_members bm ON b.id = bm.board_id
     WHERE bm.user_id = ?
     ORDER BY b.created_at DESC`
  ).all(userId) as BoardRow[];
}

export function createBoard(db: Database, title: string, userId: string): BoardRow {
  const id = nanoid();
  db.query("INSERT INTO boards (id, title, user_id) VALUES (?, ?, ?)").run(id, title, userId);

  // Auto-insert creator as board owner
  db.query("INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, 'owner')").run(id, userId);

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

// --- Board member helpers ---

export function isBoardMember(db: Database, boardId: string, userId: string): boolean {
  const row = db.query(
    "SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?"
  ).get(boardId, userId);
  return row !== null;
}

export function isBoardOwner(db: Database, boardId: string, userId: string): boolean {
  const row = db.query(
    "SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ? AND role = 'owner'"
  ).get(boardId, userId);
  return row !== null;
}

export function getBoardMembers(db: Database, boardId: string): (BoardMemberRow & { username: string })[] {
  return db.query(
    `SELECT bm.board_id, bm.user_id, bm.role, bm.invited_at, u.username
     FROM board_members bm
     JOIN users u ON bm.user_id = u.id
     WHERE bm.board_id = ?
     ORDER BY bm.role = 'owner' DESC, bm.invited_at ASC`
  ).all(boardId) as (BoardMemberRow & { username: string })[];
}

export function addBoardMember(db: Database, boardId: string, userId: string, role: "owner" | "member" = "member"): BoardMemberRow & { username: string } {
  db.query(
    "INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)"
  ).run(boardId, userId, role);
  return db.query(
    `SELECT bm.board_id, bm.user_id, bm.role, bm.invited_at, u.username
     FROM board_members bm
     JOIN users u ON bm.user_id = u.id
     WHERE bm.board_id = ? AND bm.user_id = ?`
  ).get(boardId, userId) as BoardMemberRow & { username: string };
}

export function removeBoardMember(db: Database, boardId: string, userId: string): boolean {
  const result = db.query(
    "DELETE FROM board_members WHERE board_id = ? AND user_id = ?"
  ).run(boardId, userId);
  return result.changes > 0;
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

  const labelsByCard = getLabelsByCardId(db, cards.map((card) => card.id));

  return cols.map((col) => ({
    ...col,
    cards: (cardsByColumn.get(col.id) ?? []).map((card) => {
      const checklistStats = getChecklistStats(card.checklist);
      return {
        ...card,
        labels: labelsByCard.get(card.id) ?? [],
        checklist_total: checklistStats.total,
        checklist_done: checklistStats.done,
      };
    }),
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
  const existing = db.query("SELECT id, board_id, position FROM columns WHERE id = ?").get(id) as {
    id: string;
    board_id: string;
    position: number;
  } | null;
  if (!existing) return false;
  db.query("DELETE FROM columns WHERE id = ?").run(id);
  db.query(
    "UPDATE columns SET position = position - 1 WHERE board_id = ? AND position > ?"
  ).run(existing.board_id, existing.position);
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
  description: string = "",
  dueDate: string | null = null,
  userId: string | null = null
): CardRow | null {
  const col = db.query("SELECT id, board_id FROM columns WHERE id = ?").get(columnId) as { id: string; board_id: string } | null;
  if (!col) return null;

  const maxPos = db.query(
    "SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE column_id = ?"
  ).get(columnId) as { m: number };
  const id = nanoid();
  const position = maxPos.m + 1;
  db.query(
    "INSERT INTO cards (id, title, description, position, column_id, due_date, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(id, title, description, position, columnId, dueDate);

  // Create activity for card creation
  createActivity(db, id, col.board_id, "created", null, userId);

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
  cardId: string | null,
  boardId: string,
  action: string,
  detail: unknown = null,
  userId: string | null = null
): ActivityRow {
  const id = nanoid();
  const detailJson = detail ? JSON.stringify(detail) : null;

  db.query(
    "INSERT INTO activity (id, card_id, board_id, action, detail, user_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, cardId, boardId, action, detailJson, userId);

  return db.query(
    "SELECT id, card_id, board_id, action, detail, timestamp, user_id FROM activity WHERE id = ?"
  ).get(id) as ActivityRow;
}

export function getCardActivity(
  db: Database,
  cardId: string,
  limit: number = 50,
  offset: number = 0
): ActivityRow[] {
  return db.query(
    `SELECT id, card_id, board_id, action, detail, timestamp, user_id
     FROM activity
     WHERE card_id = ?
     ORDER BY timestamp DESC
     LIMIT ? OFFSET ?`
  ).all(cardId, limit, offset) as ActivityRow[];
}

function getLabelsByCardId(
  db: Database,
  cardIds: string[]
): Map<string, LabelRow[]> {
  const labelsByCard = new Map<string, LabelRow[]>();
  if (cardIds.length === 0) {
    return labelsByCard;
  }

  const placeholders = cardIds.map(() => "?").join(",");
  const labels = db.query(`
    SELECT cl.card_id, l.id, l.board_id, l.name, l.color, l.position
    FROM card_labels cl
    JOIN labels l ON cl.label_id = l.id
    WHERE cl.card_id IN (${placeholders})
    ORDER BY l.position
  `).all(...cardIds) as (LabelRow & { card_id: string })[];

  for (const labelWithCard of labels) {
    const { card_id, ...label } = labelWithCard;
    const list = labelsByCard.get(card_id) ?? [];
    list.push(label);
    labelsByCard.set(card_id, list);
  }

  return labelsByCard;
}

function getChecklistStats(checklistJson: string): {
  total: number;
  done: number;
} {
  try {
    const checklist = JSON.parse(checklistJson) as Array<{
      id: string;
      text: string;
      checked: boolean;
    }>;
    return {
      total: checklist.length,
      done: checklist.filter((item) => item.checked).length,
    };
  } catch {
    return {
      total: 0,
      done: 0,
    };
  }
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
  },
  userId: string | null = null
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
      }, userId);
    }
  } else if (changes.length > 0) {
    // Log edited activity if not a move
    if (changes.includes("dates")) {
      createActivity(db, id, boardId, "dates_changed", {
        start_date: updatedCard.start_date,
        due_date: updatedCard.due_date,
        prev_start_date: existing.start_date,
        prev_due_date: existing.due_date,
      }, userId);
    } else {
      createActivity(db, id, boardId, "edited", {
        fields: changes,
      }, userId);
    }
  }

  return updatedCard;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  user_ids: string[];
}

export interface TimelineComment {
  type: "comment";
  id: string;
  content: string;
  user_id: string;
  username: string;
  created_at: string;
  updated_at: string;
  reactions: ReactionGroup[];
}

export interface TimelineActivity {
  type: "activity";
  id: string;
  action: string;
  detail: string | null;
  user_id: string | null;
  username: string | null;
  timestamp: string;
  reactions: ReactionGroup[];
}

export type TimelineItem = TimelineComment | TimelineActivity;

export interface CardDetail extends CardRow {
  labels: LabelRow[];
  timeline: TimelineItem[];
  is_watching: boolean;
  watcher_count: number;
  board_members: { id: string; username: string }[];
  checklist_total: number;
  checklist_done: number;
}

export function getCardComments(db: Database, cardId: string): CommentWithUser[] {
  return db.query(
    `SELECT c.id, c.card_id, c.board_id, c.user_id, u.username, c.content, c.created_at, c.updated_at
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.card_id = ?
     ORDER BY c.created_at DESC`
  ).all(cardId) as CommentWithUser[];
}

export function getReactionsGrouped(
  db: Database,
  targetType: "comment" | "activity",
  targetIds: string[]
): Map<string, ReactionGroup[]> {
  const result = new Map<string, ReactionGroup[]>();
  if (targetIds.length === 0) return result;

  const placeholders = targetIds.map(() => "?").join(",");
  const rows = db.query(
    `SELECT target_id, emoji, user_id
     FROM reactions
     WHERE target_type = ? AND target_id IN (${placeholders})
     ORDER BY created_at ASC`
  ).all(targetType, ...targetIds) as { target_id: string; emoji: string; user_id: string }[];

  // Group by target_id then by emoji
  for (const row of rows) {
    const groups = result.get(row.target_id) ?? [];
    const existing = groups.find(g => g.emoji === row.emoji);
    if (existing) {
      existing.count++;
      existing.user_ids.push(row.user_id);
    } else {
      groups.push({ emoji: row.emoji, count: 1, user_ids: [row.user_id] });
    }
    result.set(row.target_id, groups);
  }

  return result;
}

export function getCardDetail(db: Database, cardId: string, userId: string): CardDetail | null {
  const card = getCardById(db, cardId);
  if (!card) return null;

  const labels = getCardLabels(db, cardId);
  const checklistStats = getChecklistStats(card.checklist);

  // Get comments and activity for this card
  const comments = getCardComments(db, cardId);
  const activity = getCardActivity(db, cardId, 200); // Get all recent

  // Get reactions for both comments and activity
  const commentReactions = getReactionsGrouped(db, "comment", comments.map(c => c.id));
  const activityReactions = getReactionsGrouped(db, "activity", activity.map(a => a.id));

  // Build timeline items
  const commentItems: TimelineComment[] = comments.map(c => ({
    type: "comment" as const,
    id: c.id,
    content: c.content,
    user_id: c.user_id,
    username: c.username,
    created_at: c.created_at,
    updated_at: c.updated_at,
    reactions: commentReactions.get(c.id) ?? [],
  }));

  // Get usernames for activity entries
  const activityUserIds = [...new Set(activity.filter(a => a.user_id).map(a => a.user_id as string))];
  const usernameMap = new Map<string, string>();
  for (const uid of activityUserIds) {
    const user = db.query("SELECT username FROM users WHERE id = ?").get(uid) as { username: string } | null;
    if (user) usernameMap.set(uid, user.username);
  }

  const activityItems: TimelineActivity[] = activity.map(a => ({
    type: "activity" as const,
    id: a.id,
    action: a.action,
    detail: a.detail,
    user_id: a.user_id,
    username: a.user_id ? (usernameMap.get(a.user_id) ?? null) : null,
    timestamp: a.timestamp,
    reactions: activityReactions.get(a.id) ?? [],
  }));

  // Merge and sort newest first
  const timeline: TimelineItem[] = [...commentItems, ...activityItems].sort((a, b) => {
    const timeA = a.type === "comment" ? a.created_at : a.timestamp;
    const timeB = b.type === "comment" ? b.created_at : b.timestamp;
    return timeB.localeCompare(timeA);
  });

  // Get board_id from card's column
  const col = getColumnById(db, card.column_id);
  const boardId = col?.board_id ?? "";

  // Get board members for @mention autocomplete
  const members = getBoardMembers(db, boardId).map(m => ({
    id: m.user_id,
    username: m.username,
  }));

  return {
    ...card,
    labels,
    timeline,
    is_watching: isWatching(db, cardId, userId),
    watcher_count: getWatcherCount(db, cardId),
    board_members: members,
    checklist_total: checklistStats.total,
    checklist_done: checklistStats.done,
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
  // Optional artifact match information
  artifact_match?: {
    filename: string;
    match_context: string;
  };
}

export interface CalendarCardResult extends CardRow {
  column_title: string;
  labels: LabelRow[];
  checklist_total: number;
  checklist_done: number;
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
    sql += `
      AND (
        LOWER(c.title) LIKE LOWER(?) ESCAPE '\\'
        OR LOWER(c.description) LIKE LOWER(?) ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM card_labels cl
          JOIN labels l ON cl.label_id = l.id
          WHERE cl.card_id = c.id
            AND LOWER(l.name) LIKE LOWER(?) ESCAPE '\\'
        )
        OR EXISTS (
          SELECT 1
          FROM artifacts a
          WHERE a.card_id = c.id
            AND (
              LOWER(a.filename) LIKE LOWER(?) ESCAPE '\\'
              OR LOWER(a.content) LIKE LOWER(?) ESCAPE '\\'
            )
        )
      )
    `;
    const searchPattern = `%${escapeLikePattern(query)}%`;
    sqlParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
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
  const labelsByCard = getLabelsByCardId(db, cardIds);

  // Combine cards with their labels
  const results: CardSearchResult[] = cards.map(card => ({
    ...card,
    labels: labelsByCard.get(card.id) ?? []
  }));

  // If searching, check for artifact matches to add context
  if (query && cardIds.length > 0) {
    const searchPattern = `%${escapeLikePattern(query)}%`;
    
    // Get artifact matches for cards
    const artifactMatches = db.query(`
      SELECT a.card_id, a.filename, a.content
      FROM artifacts a
      WHERE a.card_id IN (${cardIds.map(() => '?').join(',')})
        AND (
          LOWER(a.filename) LIKE LOWER(?) ESCAPE '\\'
          OR LOWER(a.content) LIKE LOWER(?) ESCAPE '\\'
        )
    `).all(...cardIds, searchPattern, searchPattern) as {
      card_id: string;
      filename: string;
      content: string;
    }[];

    // Create a map of card ID to first artifact match
    const artifactMatchByCard = new Map<string, { filename: string; match_context: string }>();
    
    for (const match of artifactMatches) {
      if (!artifactMatchByCard.has(match.card_id)) {
        // Extract context around the match
        const lowerContent = match.content.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const matchIndex = lowerContent.indexOf(lowerQuery);
        
        let context = '';
        if (matchIndex >= 0) {
          // Get up to 50 chars before and after the match
          const contextStart = Math.max(0, matchIndex - 50);
          const contextEnd = Math.min(match.content.length, matchIndex + lowerQuery.length + 50);
          context = match.content.substring(contextStart, contextEnd);
          if (contextStart > 0) context = '...' + context;
          if (contextEnd < match.content.length) context = context + '...';
        } else if (match.filename.toLowerCase().includes(lowerQuery)) {
          context = `Filename: ${match.filename}`;
        }
        
        artifactMatchByCard.set(match.card_id, {
          filename: match.filename,
          match_context: context
        });
      }
    }

    // Add artifact match info to results
    for (const result of results) {
      const artifactMatch = artifactMatchByCard.get(result.id);
      if (artifactMatch) {
        result.artifact_match = artifactMatch;
      }
    }
  }

  return results;
}

// Search for board-level artifacts
export interface BoardArtifactSearchResult {
  board_id: string;
  filename: string;
  filetype: string;
  match_context: string;
}

export function searchBoardArtifacts(
  db: Database,
  boardId: string,
  query: string
): BoardArtifactSearchResult[] {
  if (!query?.trim()) return [];
  
  const searchPattern = `%${escapeLikePattern(query.trim())}%`;
  
  const matches = db.query(`
    SELECT board_id, filename, filetype, content
    FROM artifacts
    WHERE board_id = ? 
      AND card_id IS NULL
      AND (
        LOWER(filename) LIKE LOWER(?) ESCAPE '\\'
        OR LOWER(content) LIKE LOWER(?) ESCAPE '\\'
      )
    ORDER BY position
  `).all(boardId, searchPattern, searchPattern) as {
    board_id: string;
    filename: string;
    filetype: string;
    content: string;
  }[];
  
  return matches.map(match => {
    // Extract context around the match
    const lowerContent = match.content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matchIndex = lowerContent.indexOf(lowerQuery);
    
    let context = '';
    if (matchIndex >= 0) {
      // Get up to 50 chars before and after the match
      const contextStart = Math.max(0, matchIndex - 50);
      const contextEnd = Math.min(match.content.length, matchIndex + lowerQuery.length + 50);
      context = match.content.substring(contextStart, contextEnd);
      if (contextStart > 0) context = '...' + context;
      if (contextEnd < match.content.length) context = context + '...';
    } else if (match.filename.toLowerCase().includes(lowerQuery)) {
      context = `Filename: ${match.filename}`;
    }
    
    return {
      board_id: match.board_id,
      filename: match.filename,
      filetype: match.filetype,
      match_context: context
    };
  });
}

// --- Calendar view helpers ---

export function getCalendarCards(
  db: Database,
  boardId: string,
  startDate: string,
  endDate: string
): CalendarCardResult[] {
  // Get cards that overlap with the date range
  // A card overlaps if:
  // - due_date is within range, OR
  // - start_date is within range, OR
  // - card spans the range (start before, due after)
  const sql = `
    SELECT DISTINCT
      c.id, c.title, c.description, c.position, c.column_id, c.created_at,
      c.due_date, c.start_date, c.checklist, c.updated_at,
      col.title as column_title
    FROM cards c
    JOIN columns col ON c.column_id = col.id
    WHERE col.board_id = ?
      AND (
        -- Due date in range
        (c.due_date IS NOT NULL AND c.due_date >= ? AND c.due_date <= ?)
        OR
        -- Start date in range
        (c.start_date IS NOT NULL AND c.start_date >= ? AND c.start_date <= ?)
        OR
        -- Spans the range
        (c.start_date IS NOT NULL AND c.due_date IS NOT NULL 
         AND c.start_date <= ? AND c.due_date >= ?)
      )
    ORDER BY COALESCE(c.due_date, c.start_date), c.position
  `;
  
  const cards = db.query(sql).all(
    boardId,
    startDate, endDate,
    startDate, endDate,
    endDate, startDate
  ) as (CardRow & { column_title: string })[];
  
  // Fetch labels for all cards
  const cardIds = cards.map(c => c.id);
  if (cardIds.length === 0) return [];
  const labelsByCard = getLabelsByCardId(db, cardIds);
  
  // Calculate checklist counts and combine with labels
  return cards.map(card => {
    let checklist_total = 0;
    let checklist_done = 0;
    
    if (card.checklist) {
      try {
        const items = JSON.parse(card.checklist) as Array<{ checked: boolean }>;
        checklist_total = items.length;
        checklist_done = items.filter(item => item.checked).length;
      } catch {}
    }
    
    return {
      ...card,
      labels: labelsByCard.get(card.id) ?? [],
      checklist_total,
      checklist_done
    };
  });
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

// --- Comment helpers ---

export interface CommentWithUser {
  id: string;
  card_id: string;
  board_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export function createComment(
  db: Database,
  cardId: string,
  boardId: string,
  userId: string,
  content: string
): CommentWithUser {
  const id = nanoid();

  db.query(
    "INSERT INTO comments (id, card_id, board_id, user_id, content) VALUES (?, ?, ?, ?, ?)"
  ).run(id, cardId, boardId, userId, content);

  // Create "commented" activity entry
  createActivity(db, cardId, boardId, "commented", null, userId);

  // Auto-watch card for commenter
  addCardWatcher(db, cardId, userId);

  return db.query(
    `SELECT c.id, c.card_id, c.board_id, c.user_id, u.username, c.content, c.created_at, c.updated_at
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.id = ?`
  ).get(id) as CommentWithUser;
}

export function getCommentById(db: Database, commentId: string): CommentWithUser | null {
  return db.query(
    `SELECT c.id, c.card_id, c.board_id, c.user_id, u.username, c.content, c.created_at, c.updated_at
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.id = ?`
  ).get(commentId) as CommentWithUser | null;
}

export function updateComment(db: Database, commentId: string, content: string): CommentWithUser | null {
  const existing = db.query("SELECT id FROM comments WHERE id = ?").get(commentId);
  if (!existing) return null;

  db.query(
    "UPDATE comments SET content = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(content, commentId);

  return getCommentById(db, commentId);
}

export function deleteComment(db: Database, commentId: string): boolean {
  const result = db.query("DELETE FROM comments WHERE id = ?").run(commentId);
  return result.changes > 0;
}

// --- Reaction helpers ---

const ALLOWED_EMOJI = new Set(["👍", "👎", "❤️", "🎉", "😄", "😕", "🚀", "👀"]);

export function isAllowedEmoji(emoji: string): boolean {
  return ALLOWED_EMOJI.has(emoji);
}

export interface ReactionRow {
  id: string;
  target_type: "comment" | "activity";
  target_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export function toggleReaction(
  db: Database,
  targetType: "comment" | "activity",
  targetId: string,
  userId: string,
  emoji: string
): { action: "added" | "removed"; reaction: { id: string; emoji: string; user_id: string } } {
  // Check if reaction already exists
  const existing = db.query(
    "SELECT id, emoji, user_id FROM reactions WHERE target_type = ? AND target_id = ? AND user_id = ? AND emoji = ?"
  ).get(targetType, targetId, userId, emoji) as { id: string; emoji: string; user_id: string } | null;

  if (existing) {
    // Remove existing reaction
    db.query("DELETE FROM reactions WHERE id = ?").run(existing.id);
    return { action: "removed", reaction: { id: existing.id, emoji: existing.emoji, user_id: existing.user_id } };
  }

  // Add new reaction
  const id = nanoid();
  db.query(
    "INSERT INTO reactions (id, target_type, target_id, user_id, emoji) VALUES (?, ?, ?, ?, ?)"
  ).run(id, targetType, targetId, userId, emoji);
  return { action: "added", reaction: { id, emoji, user_id: userId } };
}

export function targetExists(db: Database, targetType: "comment" | "activity", targetId: string): boolean {
  const table = targetType === "comment" ? "comments" : "activity";
  const row = db.query(`SELECT id FROM ${table} WHERE id = ?`).get(targetId);
  return row !== null;
}

export function getTargetBoardId(db: Database, targetType: "comment" | "activity", targetId: string): string | null {
  const table = targetType === "comment" ? "comments" : "activity";
  const row = db.query(`SELECT board_id FROM ${table} WHERE id = ?`).get(targetId) as { board_id: string } | null;
  return row?.board_id ?? null;
}

// --- Card watcher helpers ---

export function addCardWatcher(db: Database, cardId: string, userId: string): void {
  db.query(
    "INSERT OR IGNORE INTO card_watchers (card_id, user_id) VALUES (?, ?)"
  ).run(cardId, userId);
}

export function toggleCardWatcher(
  db: Database,
  cardId: string,
  userId: string
): boolean {
  const existing = db.query(
    "SELECT 1 FROM card_watchers WHERE card_id = ? AND user_id = ?"
  ).get(cardId, userId);

  if (existing) {
    db.query("DELETE FROM card_watchers WHERE card_id = ? AND user_id = ?").run(cardId, userId);
    return false; // no longer watching
  }

  db.query("INSERT INTO card_watchers (card_id, user_id) VALUES (?, ?)").run(cardId, userId);
  return true; // now watching
}

export function isWatching(db: Database, cardId: string, userId: string): boolean {
  const row = db.query(
    "SELECT 1 FROM card_watchers WHERE card_id = ? AND user_id = ?"
  ).get(cardId, userId);
  return row !== null;
}

export function getWatcherCount(db: Database, cardId: string): number {
  const row = db.query(
    "SELECT COUNT(*) as count FROM card_watchers WHERE card_id = ?"
  ).get(cardId) as { count: number };
  return row.count;
}

// --- Board-wide activity feed ---

export interface BoardFeedItem {
  type: "comment" | "activity";
  id: string;
  card_id: string;
  card_title: string;
  user_id: string | null;
  username: string | null;
  timestamp: string;
  // comment-specific
  content?: string;
  // activity-specific
  action?: string;
  detail?: string | null;
  reactions: ReactionGroup[];
}

export interface BoardFeedResult {
  items: BoardFeedItem[];
  has_more: boolean;
}

export function getBoardFeed(
  db: Database,
  boardId: string,
  limit: number = 30,
  before?: string
): BoardFeedResult {
  const effectiveLimit = Math.min(Math.max(limit, 1), 100);

  // Get comments for this board
  const commentWhere = before
    ? "WHERE c.board_id = ? AND c.created_at < ?"
    : "WHERE c.board_id = ?";
  const commentParams = before ? [boardId, before] : [boardId];

  const comments = db.query(
    `SELECT c.id, c.card_id, c.user_id, u.username, c.content, c.created_at as timestamp,
            cards.title as card_title
     FROM comments c
     JOIN users u ON c.user_id = u.id
     JOIN cards ON c.card_id = cards.id
     ${commentWhere}
     ORDER BY c.created_at DESC`
  ).all(...commentParams) as {
    id: string; card_id: string; user_id: string; username: string;
    content: string; timestamp: string; card_title: string;
  }[];

  // Get activity for this board
  const activityWhere = before
    ? "WHERE a.board_id = ? AND a.timestamp < ?"
    : "WHERE a.board_id = ?";
  const activityParams = before ? [boardId, before] : [boardId];

  const activities = db.query(
    `SELECT a.id, a.card_id, a.action, a.detail, a.user_id, a.timestamp,
            cards.title as card_title
     FROM activity a
     JOIN cards ON a.card_id = cards.id
     ${activityWhere}
     ORDER BY a.timestamp DESC`
  ).all(...activityParams) as {
    id: string; card_id: string; action: string; detail: string | null;
    user_id: string | null; timestamp: string; card_title: string;
  }[];

  // Get usernames for activity entries
  const activityUserIds = [...new Set(activities.filter(a => a.user_id).map(a => a.user_id as string))];
  const usernameMap = new Map<string, string>();
  for (const uid of activityUserIds) {
    const user = db.query("SELECT username FROM users WHERE id = ?").get(uid) as { username: string } | null;
    if (user) usernameMap.set(uid, user.username);
  }

  // Build feed items
  const commentItems: BoardFeedItem[] = comments.map(c => ({
    type: "comment" as const,
    id: c.id,
    card_id: c.card_id,
    card_title: c.card_title,
    user_id: c.user_id,
    username: c.username,
    timestamp: c.timestamp,
    content: c.content,
    reactions: [],
  }));

  const activityItems: BoardFeedItem[] = activities.map(a => ({
    type: "activity" as const,
    id: a.id,
    card_id: a.card_id,
    card_title: a.card_title,
    user_id: a.user_id,
    username: a.user_id ? (usernameMap.get(a.user_id) ?? null) : null,
    timestamp: a.timestamp,
    action: a.action,
    detail: a.detail,
    reactions: [],
  }));

  // Merge, sort newest first, apply limit + 1 to detect has_more
  const allItems = [...commentItems, ...activityItems]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const hasMore = allItems.length > effectiveLimit;
  const items = allItems.slice(0, effectiveLimit);

  // Get reactions for the items we're returning
  const commentIds = items.filter(i => i.type === "comment").map(i => i.id);
  const activityIds = items.filter(i => i.type === "activity").map(i => i.id);

  const commentReactions = getReactionsGrouped(db, "comment", commentIds);
  const activityReactions = getReactionsGrouped(db, "activity", activityIds);

  for (const item of items) {
    const reactions = item.type === "comment"
      ? commentReactions.get(item.id)
      : activityReactions.get(item.id);
    if (reactions) item.reactions = reactions;
  }

  return { items, has_more: hasMore };
}

// --- Artifact helpers ---

export function createArtifact(
  db: Database,
  boardId: string,
  cardId: string | null,
  filename: string,
  filetype: ArtifactRow["filetype"],
  content: string,
  userId: string | null
): ArtifactRow {
  // Validate content size (100KB limit)
  if (content.length > 100 * 1024) {
    throw new Error(`Content exceeds 100KB limit (got ${Math.round(content.length / 1024)}KB)`);
  }

  // Validate filetype
  const validFiletypes: ArtifactRow["filetype"][] = ["md", "html", "js", "ts", "sh"];
  if (!validFiletypes.includes(filetype)) {
    throw new Error(`Invalid filetype: ${filetype}. Must be one of: ${validFiletypes.join(", ")}`);
  }

  // Get next position
  const maxPos = cardId
    ? db.query<{ max_pos: number | null }, [string]>(
        "SELECT MAX(position) as max_pos FROM artifacts WHERE card_id = ?"
      ).get(cardId)
    : db.query<{ max_pos: number | null }, [string]>(
        "SELECT MAX(position) as max_pos FROM artifacts WHERE board_id = ? AND card_id IS NULL"
      ).get(boardId);

  const position = (maxPos?.max_pos ?? -1) + 1;
  const id = nanoid();
  const now = new Date().toISOString();

  db.query(
    `INSERT INTO artifacts (id, board_id, card_id, filename, filetype, content, position, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, boardId, cardId, filename, filetype, content, position, userId, now, now);

  return getArtifact(db, id)!;
}

export function getArtifact(db: Database, id: string): ArtifactRow | null {
  return db.query<ArtifactRow, [string]>(
    "SELECT * FROM artifacts WHERE id = ?"
  ).get(id) ?? null;
}

export function getCardArtifacts(db: Database, cardId: string): ArtifactRow[] {
  return db.query<ArtifactRow, [string]>(
    "SELECT * FROM artifacts WHERE card_id = ? ORDER BY position ASC"
  ).all(cardId);
}

export function getBoardArtifacts(db: Database, boardId: string): ArtifactRow[] {
  return db.query<ArtifactRow, [string]>(
    "SELECT * FROM artifacts WHERE board_id = ? AND card_id IS NULL ORDER BY position ASC"
  ).all(boardId);
}

export function updateArtifact(
  db: Database,
  id: string,
  updates: { filename?: string; content?: string }
): ArtifactRow | null {
  const artifact = getArtifact(db, id);
  if (!artifact) return null;

  if (updates.content && updates.content.length > 100 * 1024) {
    throw new Error(`Content exceeds 100KB limit (got ${Math.round(updates.content.length / 1024)}KB)`);
  }

  const fields: string[] = ["updated_at = ?"];
  const values: string[] = [new Date().toISOString()];

  if (updates.filename !== undefined) {
    fields.push("filename = ?");
    values.push(updates.filename);
  }
  if (updates.content !== undefined) {
    fields.push("content = ?");
    values.push(updates.content);
  }

  values.push(id);

  // Use apply to spread the values array
  const stmt = db.query(`UPDATE artifacts SET ${fields.join(", ")} WHERE id = ?`);
  stmt.run.apply(stmt, values);

  return getArtifact(db, id);
}

export function deleteArtifact(db: Database, id: string): void {
  const artifact = getArtifact(db, id);
  if (!artifact) return;

  // Delete the artifact
  db.query("DELETE FROM artifacts WHERE id = ?").run(id);

  // Adjust positions of remaining siblings
  if (artifact.card_id) {
    db.query(
      `UPDATE artifacts 
       SET position = position - 1 
       WHERE card_id = ? AND position > ?`
    ).run(artifact.card_id, artifact.position);
  } else {
    db.query(
      `UPDATE artifacts 
       SET position = position - 1 
       WHERE board_id = ? AND card_id IS NULL AND position > ?`
    ).run(artifact.board_id, artifact.position);
  }
}

export function getArtifactByCardAndFilename(
  db: Database,
  cardId: string,
  filename: string
): ArtifactRow | null {
  return db.query<ArtifactRow, [string, string]>(
    "SELECT * FROM artifacts WHERE card_id = ? AND filename = ?"
  ).get(cardId, filename) ?? null;
}

export function getArtifactByBoardAndFilename(
  db: Database,
  boardId: string,
  filename: string
): ArtifactRow | null {
  return db.query<ArtifactRow, [string, string]>(
    "SELECT * FROM artifacts WHERE board_id = ? AND card_id IS NULL AND filename = ?"
  ).get(boardId, filename) ?? null;
}
