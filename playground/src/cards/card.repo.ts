import { Database } from "bun:sqlite";
import type { Card, NewCard, CardColumn } from "../types";

/** Database row shape for the cards table */
interface CardRow {
  id: string;
  title: string;
  board_id: string;
  column_name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

/** Fields that can be updated on a card */
export interface CardUpdates {
  title?: string;
  column?: CardColumn;
  position?: number;
}

/**
 * Map a database row to a Card domain object.
 */
function rowToCard(row: CardRow): Card {
  return {
    id: row.id,
    title: row.title,
    boardId: row.board_id,
    column: row.column_name as CardColumn,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new card in the database.
 * @param db - Database instance
 * @param newCard - Card data without id or timestamps
 * @returns The created card with generated id and timestamps
 */
export async function createCard(
  db: Database,
  newCard: NewCard
): Promise<Card> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO cards (id, title, board_id, column_name, position, created_at, updated_at)
    VALUES ($id, $title, $boardId, $column, $position, $createdAt, $updatedAt)
  `);

  stmt.run({
    $id: id,
    $title: newCard.title,
    $boardId: newCard.boardId,
    $column: newCard.column,
    $position: newCard.position,
    $createdAt: now,
    $updatedAt: now,
  });

  return {
    id,
    title: newCard.title,
    boardId: newCard.boardId,
    column: newCard.column,
    position: newCard.position,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Find a card by its ID.
 * @param db - Database instance
 * @param id - Card ID to search for
 * @returns The card if found, null otherwise
 */
export async function findCardById(
  db: Database,
  id: string
): Promise<Card | null> {
  const stmt = db.prepare<CardRow, { $id: string }>(
    "SELECT * FROM cards WHERE id = $id"
  );

  const row = stmt.get({ $id: id });
  return row ? rowToCard(row) : null;
}

/**
 * Find all cards belonging to a board, ordered by column then position.
 * @param db - Database instance
 * @param boardId - Board ID to find cards for
 * @returns Array of cards (empty if none found)
 */
export async function findCardsByBoardId(
  db: Database,
  boardId: string
): Promise<Card[]> {
  const stmt = db.prepare<CardRow, { $boardId: string }>(`
    SELECT * FROM cards
    WHERE board_id = $boardId
    ORDER BY created_at ASC
  `);

  return stmt.all({ $boardId: boardId }).map(rowToCard);
}

/**
 * Find cards in a specific column of a board, ordered by position.
 * @param db - Database instance
 * @param boardId - Board ID to filter by
 * @param column - Column to filter by (todo/doing/done)
 * @returns Array of cards in the specified column
 */
export async function findCardsByBoardAndColumn(
  db: Database,
  boardId: string,
  column: CardColumn
): Promise<Card[]> {
  const stmt = db.prepare<CardRow, { $boardId: string; $column: string }>(`
    SELECT * FROM cards
    WHERE board_id = $boardId AND column_name = $column
    ORDER BY position ASC
  `);

  return stmt.all({ $boardId: boardId, $column: column }).map(rowToCard);
}

/**
 * Update a card's properties.
 * @param db - Database instance
 * @param id - Card ID to update
 * @param updates - Fields to update (title, column, position)
 * @returns The updated card if found, null otherwise
 */
export async function updateCard(
  db: Database,
  id: string,
  updates: CardUpdates
): Promise<Card | null> {
  const existing = await findCardById(db, id);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  const newTitle = updates.title ?? existing.title;
  const newColumn = updates.column ?? existing.column;
  const newPosition = updates.position ?? existing.position;

  const stmt = db.prepare(`
    UPDATE cards
    SET title = $title, column_name = $column, position = $position, updated_at = $updatedAt
    WHERE id = $id
  `);

  stmt.run({
    $id: id,
    $title: newTitle,
    $column: newColumn,
    $position: newPosition,
    $updatedAt: now,
  });

  return {
    id: existing.id,
    title: newTitle,
    boardId: existing.boardId,
    column: newColumn,
    position: newPosition,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
}

/**
 * Delete a card from the database.
 * @param db - Database instance
 * @param id - Card ID to delete
 * @returns true if card was deleted, false if not found
 */
export async function deleteCard(
  db: Database,
  id: string
): Promise<boolean> {
  const stmt = db.prepare("DELETE FROM cards WHERE id = $id");
  const result = stmt.run({ $id: id });

  return result.changes > 0;
}
