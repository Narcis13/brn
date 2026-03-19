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
