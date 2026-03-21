/**
 * Frontend type definitions that mirror backend types.
 * These types are used for API communication and client-side state.
 */

/**
 * A user as received from the API.
 * passwordHash is never exposed to the client.
 */
export interface User {
  /** UUID v4 identifier */
  id: string;
  /** Email address */
  email: string;
  /** ISO 8601 timestamp of creation */
  createdAt: string;
}

/**
 * Authentication context stored on client.
 * Extracted from JWT token after successful login.
 */
export interface AuthContext {
  /** User's unique identifier */
  userId: string;
  /** User's email address */
  email: string;
}

/**
 * A board as received from the API.
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

/** Valid column values for cards on a board */
export type CardColumn = "todo" | "doing" | "done";

/**
 * A card as received from the API.
 */
export interface Card {
  /** UUID v4 identifier */
  id: string;
  /** Card title / summary */
  title: string;
  /** Optional longer description */
  description?: string;
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