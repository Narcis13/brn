import { Database } from "bun:sqlite";
import type { Board, NewBoard } from "../types";

/**
 * Create a new board in the database.
 * @param db - Database instance
 * @param board - Board data without id or timestamps
 * @returns The created board with generated id and timestamps
 */
export async function createBoard(db: Database, board: NewBoard): Promise<Board> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO boards (id, name, user_id, created_at, updated_at)
    VALUES ($id, $name, $userId, $createdAt, $updatedAt)
  `);
  
  stmt.run({
    $id: id,
    $name: board.name,
    $userId: board.userId,
    $createdAt: now,
    $updatedAt: now
  });
  
  return {
    id,
    name: board.name,
    userId: board.userId,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Find all boards owned by a specific user.
 * @param db - Database instance
 * @param userId - ID of the user to find boards for
 * @returns Array of boards (empty if none found)
 */
export async function findBoardsByUserId(db: Database, userId: string): Promise<Board[]> {
  const stmt = db.prepare<Board, { $userId: string }>(`
    SELECT id, name, user_id as userId, created_at as createdAt, updated_at as updatedAt
    FROM boards
    WHERE user_id = $userId
    ORDER BY created_at ASC
  `);
  
  return stmt.all({ $userId: userId });
}

/**
 * Find a board by its ID.
 * @param db - Database instance
 * @param id - Board ID to search for
 * @returns The board if found, null otherwise
 */
export async function findBoardById(db: Database, id: string): Promise<Board | null> {
  const stmt = db.prepare<Board, { $id: string }>(`
    SELECT id, name, user_id as userId, created_at as createdAt, updated_at as updatedAt
    FROM boards
    WHERE id = $id
  `);
  
  return stmt.get({ $id: id }) || null;
}

/**
 * Update a board's properties.
 * @param db - Database instance
 * @param id - Board ID to update
 * @param updates - Fields to update (currently only name)
 * @returns The updated board if found, null otherwise
 */
export async function updateBoard(
  db: Database,
  id: string,
  updates: { name: string }
): Promise<Board | null> {
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    UPDATE boards
    SET name = $name, updated_at = $updatedAt
    WHERE id = $id
  `);
  
  const result = stmt.run({
    $id: id,
    $name: updates.name,
    $updatedAt: now
  });
  
  if (result.changes === 0) {
    return null;
  }
  
  return findBoardById(db, id);
}

/**
 * Delete a board from the database.
 * @param db - Database instance
 * @param id - Board ID to delete
 * @returns true if board was deleted, false if not found
 */
export async function deleteBoard(db: Database, id: string): Promise<boolean> {
  const stmt = db.prepare("DELETE FROM boards WHERE id = $id");
  const result = stmt.run({ $id: id });
  
  return result.changes > 0;
}