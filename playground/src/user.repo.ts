import type { Database } from "bun:sqlite";
import type { User, NewUser } from "./types.ts";

// Database row type for user table
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

/**
 * Insert a new user and return the full User record.
 * @param db - Database instance
 * @param newUser - User data to insert (email and passwordHash)
 * @returns Created user with generated ID and timestamp
 */
export function createUser(db: Database, newUser: NewUser): User {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const statement = db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
  );
  
  statement.run(id, newUser.email, newUser.passwordHash, createdAt);

  return {
    id,
    email: newUser.email,
    passwordHash: newUser.passwordHash,
    createdAt,
  };
}

/**
 * Find a user by exact email match.
 * @param db - Database instance
 * @param email - Email to search for
 * @returns User if found, null otherwise
 */
export function findUserByEmail(db: Database, email: string): User | null {
  const statement = db.prepare<UserRow, [string]>(
    "SELECT * FROM users WHERE email = ?"
  );
  
  const row = statement.get(email);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}
