import type { Database } from "bun:sqlite";
import type { Card, CardColumn } from "../types";
import * as boardRepo from "../boards/board.repo";
import * as cardRepo from "./card.repo";

/**
 * Result of validating whether a user owns a board.
 * Separates "board doesn't exist" from "user doesn't own it"
 * so callers can return the correct HTTP status (404 vs 403).
 */
export interface BoardValidationResult {
  /** Whether the board exists in the database */
  exists: boolean;
  /** Whether the requesting user owns the board */
  isOwner: boolean;
}

/**
 * Input parameters for creating a card through the service layer.
 * Unlike the repo-level NewCard, this includes userId for ownership checks
 * and omits position (which is calculated automatically).
 */
export interface CreateCardParams {
  /** Card title / summary (required, non-empty) */
  title: string;
  /** UUID of the board to create the card on */
  boardId: string;
  /** Column to place the card in */
  column: CardColumn;
  /** UUID of the user requesting card creation */
  userId: string;
}

/**
 * Validate that a board exists and is owned by the given user.
 *
 * Returns a result object distinguishing between:
 * - Board does not exist (exists=false)
 * - Board exists but user doesn't own it (exists=true, isOwner=false)
 * - Board exists and user owns it (exists=true, isOwner=true)
 *
 * @param db - Database instance
 * @param boardId - Board ID to validate
 * @param userId - User ID to check ownership against
 * @returns Validation result with exists and isOwner flags
 */
export async function validateBoardOwnership(
  db: Database,
  boardId: string,
  userId: string
): Promise<BoardValidationResult> {
  const board = await boardRepo.findBoardById(db, boardId);

  if (!board) {
    return { exists: false, isOwner: false };
  }

  return { exists: true, isOwner: board.userId === userId };
}

/**
 * Validate that a card title is non-empty.
 *
 * @param title - The title to validate
 * @throws Error with message "Card title is required" if title is empty or whitespace
 */
function validateCardTitle(title: string): void {
  if (!title || title.trim().length === 0) {
    throw new Error("Card title is required");
  }
}

/**
 * Create a new card on a board, with full validation.
 *
 * Validates:
 * 1. Title is non-empty
 * 2. Board exists (throws "Board not found" if not)
 * 3. User owns the board (throws "Not authorized" if not)
 *
 * Automatically sets position to the end of the target column.
 *
 * @param db - Database instance
 * @param params - Card creation parameters including userId for auth
 * @returns The created card with generated id, position, and timestamps
 * @throws Error "Card title is required" - if title is empty
 * @throws Error "Board not found" - if board doesn't exist
 * @throws Error "Not authorized" - if user doesn't own the board
 */
export async function createCard(
  db: Database,
  params: CreateCardParams
): Promise<Card> {
  // Validate title first (before hitting DB)
  validateCardTitle(params.title);

  // Validate board ownership
  const validation = await validateBoardOwnership(
    db,
    params.boardId,
    params.userId
  );

  if (!validation.exists) {
    throw new Error("Board not found");
  }

  if (!validation.isOwner) {
    throw new Error("Not authorized");
  }

  // Calculate next position at end of column
  const existingCards = await cardRepo.findCardsByBoardAndColumn(
    db,
    params.boardId,
    params.column
  );
  const nextPosition = existingCards.length;

  // Create the card via repo
  return cardRepo.createCard(db, {
    title: params.title.trim(),
    boardId: params.boardId,
    column: params.column,
    position: nextPosition,
  });
}
