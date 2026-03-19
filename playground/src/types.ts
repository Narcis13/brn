/** A user as stored in the database. */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

/** Input for creating a new user (no id or timestamp yet). */
export interface NewUser {
  email: string;
  passwordHash: string;
}
