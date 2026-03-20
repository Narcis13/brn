import { Database } from "bun:sqlite";
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

/** Valid column values for validation */
const VALID_COLUMNS: ReadonlySet<string> = new Set(["todo", "doing", "done"]);

/** Column ordering for sorting: todo → doing → done */
const COLUMN_ORDER: Record<CardColumn, number> = { todo: 0, doing: 1, done: 2 };

/**
 * Get all cards for a board, sorted by column then position.
 *
 * Validates board ownership before returning cards.
 *
 * @param db - Database instance
 * @param boardId - Board to get cards for
 * @param userId - User requesting the cards (must own the board)
 * @returns Cards sorted by column order, then position within column
 * @throws Error "Board not found" - if board doesn't exist
 * @throws Error "Not authorized" - if user doesn't own the board
 */
export async function getCardsByBoard(
  db: Database,
  boardId: string,
  userId: string
): Promise<Card[]> {
  const validation = await validateBoardOwnership(db, boardId, userId);

  if (!validation.exists) {
    throw new Error("Board not found");
  }

  if (!validation.isOwner) {
    throw new Error("Not authorized");
  }

  const cards = await cardRepo.findCardsByBoardId(db, boardId);

  return cards.sort((a, b) => {
    const colDiff = COLUMN_ORDER[a.column] - COLUMN_ORDER[b.column];
    if (colDiff !== 0) return colDiff;
    return a.position - b.position;
  });
}

/**
 * Get a single card by ID with board ownership validation.
 *
 * Looks up the card, then validates that the requesting user
 * owns the board the card belongs to.
 *
 * @param db - Database instance
 * @param cardId - Card ID to look up
 * @param userId - User requesting the card (must own the board)
 * @returns The card
 * @throws Error "Card not found" - if card doesn't exist
 * @throws Error "Board not found" - if card's board doesn't exist
 * @throws Error "Not authorized" - if user doesn't own the board
 */
export async function getCardById(
  db: Database,
  cardId: string,
  userId: string
): Promise<Card> {
  const card = await cardRepo.findCardById(db, cardId);

  if (!card) {
    throw new Error("Card not found");
  }

  const validation = await validateBoardOwnership(db, card.boardId, userId);

  if (!validation.exists) {
    throw new Error("Board not found");
  }

  if (!validation.isOwner) {
    throw new Error("Not authorized");
  }

  return card;
}

/**
 * Input parameters for updating a card's content fields.
 */
export interface UpdateCardParams {
  cardId: string;
  userId: string;
  title?: string;
  description?: string;
}

/**
 * Input parameters for moving a card between or within columns.
 */
export interface MoveCardParams {
  cardId: string;
  userId: string;
  column: CardColumn;
  position?: number;
}

/**
 * Update a card's title and/or description.
 *
 * Validates board ownership before applying changes.
 *
 * @param db - Database instance
 * @param params - Update parameters with cardId, userId, and fields to update
 * @returns The updated card
 * @throws Error "Card not found" - if card doesn't exist
 * @throws Error "Board not found" - if card's board doesn't exist
 * @throws Error "Not authorized" - if user doesn't own the board
 * @throws Error "Card title is required" - if title is set to empty
 */
export async function updateCard(
  db: Database,
  params: UpdateCardParams
): Promise<Card> {
  const card = await cardRepo.findCardById(db, params.cardId);
  if (!card) {
    throw new Error("Card not found");
  }

  const validation = await validateBoardOwnership(db, card.boardId, params.userId);
  if (!validation.exists) {
    throw new Error("Board not found");
  }
  if (!validation.isOwner) {
    throw new Error("Not authorized");
  }

  if (params.title !== undefined) {
    validateCardTitle(params.title);
  }

  const updated = await cardRepo.updateCard(db, params.cardId, {
    title: params.title,
    description: params.description,
  });

  return updated!;
}

/**
 * Move a card to a different column or reposition within its column.
 *
 * Cross-column moves place the card at the end of the target column.
 * Within-column moves reorder cards to the specified position.
 * Uses a transaction to maintain position integrity.
 *
 * @param db - Database instance
 * @param params - Move parameters with cardId, userId, target column, and optional position
 * @returns The moved card
 * @throws Error "Invalid column" - if column is not todo/doing/done
 * @throws Error "Card not found" - if card doesn't exist
 * @throws Error "Board not found" - if card's board doesn't exist
 * @throws Error "Not authorized" - if user doesn't own the board
 */
export async function moveCard(
  db: Database,
  params: MoveCardParams
): Promise<Card> {
  if (!VALID_COLUMNS.has(params.column)) {
    throw new Error("Invalid column");
  }

  const card = await cardRepo.findCardById(db, params.cardId);
  if (!card) {
    throw new Error("Card not found");
  }

  const validation = await validateBoardOwnership(db, card.boardId, params.userId);
  if (!validation.exists) {
    throw new Error("Board not found");
  }
  if (!validation.isOwner) {
    throw new Error("Not authorized");
  }

  const isColumnChange = card.column !== params.column;
  const now = new Date().toISOString();

  if (isColumnChange) {
    const targetCards = await cardRepo.findCardsByBoardAndColumn(
      db,
      card.boardId,
      params.column
    );
    const newPosition = targetCards.length;

    const sourceCards = await cardRepo.findCardsByBoardAndColumn(
      db,
      card.boardId,
      card.column
    );

    const updateStmt = db.prepare(
      "UPDATE cards SET column_name = $column, position = $position, updated_at = $updatedAt WHERE id = $id"
    );
    const posStmt = db.prepare(
      "UPDATE cards SET position = $position, updated_at = $updatedAt WHERE id = $id"
    );

    const txn = db.transaction(() => {
      updateStmt.run({
        $id: card.id,
        $column: params.column,
        $position: newPosition,
        $updatedAt: now,
      });

      let pos = 0;
      for (const sc of sourceCards) {
        if (sc.id !== card.id) {
          posStmt.run({ $id: sc.id, $position: pos, $updatedAt: now });
          pos++;
        }
      }
    });
    txn();
  } else if (params.position !== undefined && params.position !== card.position) {
    const columnCards = await cardRepo.findCardsByBoardAndColumn(
      db,
      card.boardId,
      card.column
    );

    const others = columnCards.filter((c) => c.id !== card.id);
    const targetPos = Math.min(params.position, others.length);
    others.splice(targetPos, 0, card);

    const posStmt = db.prepare(
      "UPDATE cards SET position = $position, updated_at = $updatedAt WHERE id = $id"
    );

    const txn = db.transaction(() => {
      for (let i = 0; i < others.length; i++) {
        posStmt.run({ $id: others[i].id, $position: i, $updatedAt: now });
      }
    });
    txn();
  }

  const updated = await cardRepo.findCardById(db, params.cardId);
  return updated!;
}
