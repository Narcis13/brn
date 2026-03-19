import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync } from "node:fs";
import type { Database } from "bun:sqlite";
import { getDb, runMigrations } from "./db.ts";
import { createUser, findUserByEmail } from "./user.repo.ts";
import type { NewUser } from "./types.ts";

const TEST_DB_PATH = "/tmp/superclaude-test-userrepo/test.sqlite";

describe("User Repository", () => {
  let db: Database;

  beforeEach(() => {
    db = getDb(TEST_DB_PATH);
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
    rmSync("/tmp/superclaude-test-userrepo", { recursive: true, force: true });
  });

  const testUser: NewUser = {
    email: "test@example.com",
    passwordHash: "hashed_password_123",
  };

  test("createUser inserts a user and returns it with an id", () => {
    const user = createUser(db, testUser);

    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(typeof user.id).toBe("string");
    expect(user.id.length).toBeGreaterThan(0);
    expect(user.email).toBe(testUser.email);
    expect(user.createdAt).toBeDefined();
    expect(typeof user.createdAt).toBe("string");
  });

  test("createUser does not return password_hash", () => {
    const user = createUser(db, testUser);

    // The returned User object should not leak the password hash
    expect(user.email).toBe(testUser.email);
    expect(user.id).toBeDefined();
  });

  test("findUserByEmail returns the user when found", () => {
    createUser(db, testUser);

    const found = findUserByEmail(db, testUser.email);

    expect(found).not.toBeNull();
    expect(found!.email).toBe(testUser.email);
    expect(found!.id).toBeDefined();
    expect(found!.createdAt).toBeDefined();
  });

  test("findUserByEmail returns null when not found", () => {
    const found = findUserByEmail(db, "nonexistent@example.com");

    expect(found).toBeNull();
  });

  test("createUser rejects duplicate emails", () => {
    createUser(db, testUser);

    expect(() => {
      createUser(db, { email: testUser.email, passwordHash: "different_hash" });
    }).toThrow();
  });

  test("createUser generates unique ids for different users", () => {
    const user1 = createUser(db, testUser);
    const user2 = createUser(db, {
      email: "other@example.com",
      passwordHash: "other_hash",
    });

    expect(user1.id).not.toBe(user2.id);
  });
});
