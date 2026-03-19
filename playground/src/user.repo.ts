import type { Database } from "bun:sqlite";
import type { User, NewUser } from "./types.ts";

/** Insert a new user and return the full User record. */
export function createUser(db: Database, newUser: NewUser): User {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [id, newUser.email, newUser.passwordHash, createdAt]
  );

  return {
    id,
    email: newUser.email,
    passwordHash: newUser.passwordHash,
    createdAt,
  };
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

/** Find a user by exact email match. Returns null if not found. */
export function findUserByEmail(db: Database, email: string): User | null {
  const row = db
    .query<UserRow, [string]>("SELECT * FROM users WHERE email = ?")
    .get(email);

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}
