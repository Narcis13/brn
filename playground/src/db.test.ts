import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { getDb, runMigrations } from "./db.ts";

const TEST_ROOT = "/tmp/superclaude-test-db";
const TEST_DB_PATH = `${TEST_ROOT}/test.db`;

describe("Database", () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  describe("getDb", () => {
    test("initializes a database connection without error", () => {
      const db = getDb(TEST_DB_PATH);
      expect(db).toBeDefined();
      db.close();
    });
  });

  describe("runMigrations", () => {
    test("creates user table after migration", () => {
      const db = getDb(TEST_DB_PATH);
      runMigrations(db);

      const tables = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        )
        .all();

      expect(tables).toHaveLength(1);
      expect(tables[0]!.name).toBe("users");
      db.close();
    });

    test("user table has correct columns", () => {
      const db = getDb(TEST_DB_PATH);
      runMigrations(db);

      const columns = db
        .query<{ name: string; type: string; notnull: number }, []>(
          "PRAGMA table_info(users)"
        )
        .all();

      const columnMap = new Map(columns.map((c) => [c.name, c]));

      // id: TEXT, primary key
      expect(columnMap.get("id")).toBeDefined();
      expect(columnMap.get("id")!.type).toBe("TEXT");

      // email: TEXT, NOT NULL
      expect(columnMap.get("email")).toBeDefined();
      expect(columnMap.get("email")!.type).toBe("TEXT");
      expect(columnMap.get("email")!.notnull).toBe(1);

      // password_hash: TEXT, NOT NULL
      expect(columnMap.get("password_hash")).toBeDefined();
      expect(columnMap.get("password_hash")!.type).toBe("TEXT");
      expect(columnMap.get("password_hash")!.notnull).toBe(1);

      // created_at: TEXT, NOT NULL
      expect(columnMap.get("created_at")).toBeDefined();
      expect(columnMap.get("created_at")!.type).toBe("TEXT");
      expect(columnMap.get("created_at")!.notnull).toBe(1);

      db.close();
    });

    test("email column has UNIQUE constraint", () => {
      const db = getDb(TEST_DB_PATH);
      runMigrations(db);

      const indices = db
        .query<{ name: string; unique: number }, []>(
          "PRAGMA index_list(users)"
        )
        .all();

      const uniqueIndices = indices.filter((i) => i.unique === 1);
      expect(uniqueIndices.length).toBeGreaterThanOrEqual(1);

      // Verify at least one unique index covers the email column
      const emailIndexed = uniqueIndices.some((idx) => {
        const info = db
          .query<{ name: string }, [string]>(
            "PRAGMA index_info(?)"
          )
          .all(idx.name);
        return info.some((col) => col.name === "email");
      });

      expect(emailIndexed).toBe(true);
      db.close();
    });

    test("running migrations twice is idempotent", () => {
      const db = getDb(TEST_DB_PATH);
      runMigrations(db);
      expect(() => runMigrations(db)).not.toThrow();
      db.close();
    });
  });
});
