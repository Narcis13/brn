import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { getDb, runMigrations } from "./db.ts";
import { createUser, findUserByEmail } from "./user.repo.ts";
import type { NewUser } from "./types.ts";

const TEST_ROOT = "/tmp/superclaude-test-user-repo";
const TEST_DB_PATH = `${TEST_ROOT}/test.db`;

describe("User Repository", () => {
  let db: ReturnType<typeof getDb>;

  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
    db = getDb(TEST_DB_PATH);
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  describe("createUser", () => {
    test("inserts a user and returns it with an id", () => {
      const newUser: NewUser = {
        email: "test@example.com",
        passwordHash: "hashed_password_123",
      };

      const user = createUser(db, newUser);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(typeof user.id).toBe("string");
      expect(user.id.length).toBeGreaterThan(0);
      expect(user.email).toBe("test@example.com");
      expect(user.passwordHash).toBe("hashed_password_123");
      expect(user.createdAt).toBeDefined();
      expect(typeof user.createdAt).toBe("string");
    });

    test("generates unique ids for different users", () => {
      const user1 = createUser(db, {
        email: "user1@example.com",
        passwordHash: "hash1",
      });
      const user2 = createUser(db, {
        email: "user2@example.com",
        passwordHash: "hash2",
      });

      expect(user1.id).not.toBe(user2.id);
    });

    test("rejects duplicate emails with an error", () => {
      const newUser: NewUser = {
        email: "duplicate@example.com",
        passwordHash: "hashed_password",
      };

      createUser(db, newUser);

      expect(() => createUser(db, newUser)).toThrow();
    });
  });

  describe("findUserByEmail", () => {
    test("returns the user when found", () => {
      const newUser: NewUser = {
        email: "findme@example.com",
        passwordHash: "hashed_password_456",
      };

      const created = createUser(db, newUser);
      const found = findUserByEmail(db, "findme@example.com");

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.email).toBe("findme@example.com");
      expect(found!.passwordHash).toBe("hashed_password_456");
      expect(found!.createdAt).toBe(created.createdAt);
    });

    test("returns null when not found", () => {
      const result = findUserByEmail(db, "nonexistent@example.com");

      expect(result).toBeNull();
    });

    test("finds user by exact email match (case-sensitive)", () => {
      createUser(db, {
        email: "CaseSensitive@Example.com",
        passwordHash: "hash",
      });

      const found = findUserByEmail(db, "CaseSensitive@Example.com");
      expect(found).not.toBeNull();
      expect(found!.email).toBe("CaseSensitive@Example.com");
    });
  });
});
