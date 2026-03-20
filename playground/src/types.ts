/**
 * A user as stored in the database.
 * All fields are required and immutable after creation.
 */
export interface User {
  /** UUID v4 identifier */
  id: string;
  /** Email address (unique constraint enforced by DB) */
  email: string;
  /** Hashed password (never store plaintext) */
  passwordHash: string;
  /** ISO 8601 timestamp of creation */
  createdAt: string;
}

/**
 * Input for creating a new user.
 * ID and timestamp are generated automatically.
 */
export interface NewUser {
  /** Email address to register */
  email: string;
  /** Pre-hashed password (hashing should happen before repo layer) */
  passwordHash: string;
}

/**
 * Authentication context extracted from JWT token.
 * Set on Hono context after successful authentication.
 */
export interface AuthContext {
  /** User's unique identifier */
  userId: string;
  /** User's email address */
  email: string;
}

/**
 * A board as stored in the database.
 * Boards contain lists and are owned by users.
 */
export interface Board {
  /** UUID v4 identifier */
  id: string;
  /** Display name of the board */
  name: string;
  /** UUID of the user who owns this board */
  userId: string;
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

/**
 * Input for creating a new board.
 * ID and timestamps are generated automatically.
 */
export interface NewBoard {
  /** Display name of the board */
  name: string;
  /** UUID of the user who will own this board */
  userId: string;
}

/** Valid column values for cards on a board */
export type CardColumn = "todo" | "doing" | "done";

/**
 * A card as stored in the database.
 * Cards belong to a board and live in a column with a position.
 */
export interface Card {
  /** UUID v4 identifier */
  id: string;
  /** Card title / summary */
  title: string;
  /** UUID of the board this card belongs to */
  boardId: string;
  /** Which column the card is in */
  column: CardColumn;
  /** Position within the column (0-indexed, lower = higher) */
  position: number;
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

/**
 * Input for creating a new card.
 * ID and timestamps are generated automatically.
 */
export interface NewCard {
  /** Card title / summary */
  title: string;
  /** UUID of the board this card belongs to */
  boardId: string;
  /** Which column the card is in */
  column: CardColumn;
  /** Position within the column */
  position: number;
}
