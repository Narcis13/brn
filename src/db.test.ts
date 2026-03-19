import { describe, test, expect, afterEach } from "bun:test";
import { rmSync } from "node:fs";
import { getDb, runMigrations } from "./db.ts";

const TEST_DB_PATH = "/tmp/superclaude-test-db/test.sqlite";

describe("Database", () => {
  afterEach(() => {
    rmSync("/tmp/superclaude-test-db", { recursive: true, force: true });
  });

  test("connection initializes without error", () => {
    const db = getDb(TEST_DB_PATH);

    expect(db).toBeDefined();
    db.close();
  });

  test("user table exists after migration", () => {
    const db = getDb(TEST_DB_PATH);
    runMigrations(db);

    const tables = db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
      )
      .all();
    expect(tables).toHaveLength(1);

    const columns = db.query("PRAGMA table_info(users)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    const columnMap = new Map(columns.map((c) => [c.name, c]));

    // id: TEXT, primary key
    expect(columnMap.get("id")).toBeDefined();
    expect(columnMap.get("id")!.type).toBe("TEXT");
    expect(columnMap.get("id")!.pk).toBe(1);

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

    const indexes = db
      .query("SELECT * FROM sqlite_master WHERE type='index' AND tbl_name='users'")
      .all() as Array<{ sql: string | null }>;

    const hasUniqueEmail = indexes.some(
      (idx) => idx.sql !== null && idx.sql.includes("email") && idx.sql.includes("UNIQUE")
    );
    expect(hasUniqueEmail).toBe(true);

    db.close();
  });
});
