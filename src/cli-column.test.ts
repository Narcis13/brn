import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import {
  listColumns,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
} from "./cli-column";

const TEST_DIR = `/tmp/brn-test-${process.pid}-${nanoid(6)}`;
const DB_PATH = join(TEST_DIR, "test.db");

let db: Database;
let testUserId: string;
let testBoardId: string;
let testSession: { userId: string; username: string; dbPath: string };

// Mock console methods to capture output
let consoleOutput: string[] = [];
let consoleErrors: string[] = [];
const originalLog = console.log;
const originalError = console.error;

beforeEach(() => {
  // Setup test directory and database
  mkdirSync(TEST_DIR, { recursive: true });
  db = new Database(DB_PATH);

  // Create tables
  db.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      FOREIGN KEY (ownerId) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE board_members (
      userId TEXT NOT NULL,
      boardId TEXT NOT NULL,
      role TEXT NOT NULL,
      joinedAt TEXT NOT NULL,
      PRIMARY KEY (userId, boardId),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (boardId) REFERENCES boards(id)
    )
  `);

  db.run(`
    CREATE TABLE columns (
      id TEXT PRIMARY KEY,
      boardId TEXT NOT NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (boardId) REFERENCES boards(id)
    )
  `);

  db.run(`
    CREATE TABLE cards (
      id TEXT PRIMARY KEY,
      boardId TEXT NOT NULL,
      columnId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      position INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (boardId) REFERENCES boards(id),
      FOREIGN KEY (columnId) REFERENCES columns(id)
    )
  `);

  // Create test user and board
  testUserId = nanoid();
  testBoardId = nanoid();
  
  db.run(
    "INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, datetime('now'))",
    [testUserId, "testuser", "hash"]
  );

  db.run(
    "INSERT INTO boards (id, title, createdAt, ownerId) VALUES (?, ?, datetime('now'), ?)",
    [testBoardId, "Test Board", testUserId]
  );

  db.run(
    "INSERT INTO board_members (userId, boardId, role, joinedAt) VALUES (?, ?, ?, datetime('now'))",
    [testUserId, testBoardId, "owner"]
  );

  testSession = {
    userId: testUserId,
    username: "testuser",
    dbPath: DB_PATH,
  };

  // Mock console
  consoleOutput = [];
  consoleErrors = [];
  console.log = (...args) => consoleOutput.push(args.join(" "));
  console.error = (...args) => consoleErrors.push(args.join(" "));
});

afterEach(() => {
  // Restore console
  console.log = originalLog;
  console.error = originalError;
  
  // Clean up
  db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("listColumns", () => {
  test("lists columns in position order", async () => {
    // Create test columns
    const col1Id = nanoid();
    const col2Id = nanoid();
    const col3Id = nanoid();
    
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col1Id, testBoardId, "To Do", 0]
    );
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col2Id, testBoardId, "In Progress", 1]
    );
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col3Id, testBoardId, "Done", 2]
    );

    await listColumns(db, testSession, testBoardId, {});

    expect(consoleOutput.join("\n")).toContain("To Do");
    expect(consoleOutput.join("\n")).toContain("In Progress");
    expect(consoleOutput.join("\n")).toContain("Done");
    
    // Check order
    const output = consoleOutput.join("\n");
    const todoIndex = output.indexOf("To Do");
    const inProgressIndex = output.indexOf("In Progress");
    const doneIndex = output.indexOf("Done");
    
    expect(todoIndex).toBeLessThan(inProgressIndex);
    expect(inProgressIndex).toBeLessThan(doneIndex);
  });

  test("shows card count for each column", async () => {
    const colId = nanoid();
    
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [colId, testBoardId, "Test Column", 0]
    );
    
    // Add cards
    for (let i = 0; i < 3; i++) {
      db.run(
        "INSERT INTO cards (id, boardId, columnId, title, position, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        [nanoid(), testBoardId, colId, `Card ${i}`, i]
      );
    }

    await listColumns(db, testSession, testBoardId, {});
    
    expect(consoleOutput.join("\n")).toContain("3");
  });

  test("outputs JSON when --json flag is set", async () => {
    const colId = nanoid();
    
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [colId, testBoardId, "Test Column", 0]
    );

    await listColumns(db, testSession, testBoardId, { json: true });
    
    const output = JSON.parse(consoleOutput[0] || '[]') as any;
    expect(Array.isArray(output)).toBe(true);
    expect(output[0].title).toBe("Test Column");
  });
});

describe("createColumn", () => {
  test("creates column at the end position", async () => {
    // Create existing columns
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [nanoid(), testBoardId, "Existing 1", 0]
    );
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [nanoid(), testBoardId, "Existing 2", 1]
    );

    await createColumn(db, testSession, testBoardId, "New Column", {});

    // Check the column was created with correct position
    const columns = db.query("SELECT * FROM columns WHERE boardId = ? ORDER BY position").all(testBoardId) as any[];
    expect(columns.length).toBe(3);
    expect(columns[2].title).toBe("New Column");
    expect(columns[2].position).toBe(2);
  });

  test("prints column ID on success", async () => {
    await createColumn(db, testSession, testBoardId, "Test Column", {});
    
    expect(consoleOutput.length).toBe(1);
    expect(consoleOutput[0]).toMatch(/^[a-zA-Z0-9_-]+$/); // nanoid format
  });

  test("denies access to non-member", async () => {
    const otherUserId = nanoid();
    db.run(
      "INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, datetime('now'))",
      [otherUserId, "otheruser", "hash"]
    );
    
    const otherSession = {
      userId: otherUserId,
      username: "otheruser",
      dbPath: DB_PATH,
    };

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await createColumn(db, otherSession, testBoardId, "Test", {});
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(consoleErrors).toContain("You do not have access to this board");
  });
});

describe("updateColumn", () => {
  test("updates column title", async () => {
    const colId = nanoid();
    
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [colId, testBoardId, "Old Title", 0]
    );

    await updateColumn(db, testSession, colId, "New Title", {});

    const column = db.query("SELECT * FROM columns WHERE id = ?").get(colId) as any;
    expect(column.title).toBe("New Title");
    expect(consoleOutput).toContain("Column updated successfully");
  });

  test("fails for non-existent column", async () => {
    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await updateColumn(db, testSession, "nonexistent", "New Title", {});
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(consoleErrors).toContain("Column not found");
  });
});

describe("deleteColumn", () => {
  test("deletes column and its cards", async () => {
    const colId = nanoid();
    
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [colId, testBoardId, "To Delete", 0]
    );
    
    // Add a card
    db.run(
      "INSERT INTO cards (id, boardId, columnId, title, position, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))",
      [nanoid(), testBoardId, colId, "Card to Delete", 0]
    );

    await deleteColumn(db, testSession, colId, { yes: true });

    const columns = db.query("SELECT * FROM columns WHERE id = ?").all(colId) as any[];
    const cards = db.query("SELECT * FROM cards WHERE columnId = ?").all(colId) as any[];
    
    expect(columns.length).toBe(0);
    expect(cards.length).toBe(0);
    expect(consoleOutput).toContain("Column deleted successfully");
  });

  test("only allows board owner to delete", async () => {
    // Create member user
    const memberId = nanoid();
    db.run(
      "INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, datetime('now'))",
      [memberId, "member", "hash"]
    );
    db.run(
      "INSERT INTO board_members (userId, boardId, role, joinedAt) VALUES (?, ?, ?, datetime('now'))",
      [memberId, testBoardId, "member"]
    );
    
    const memberSession = {
      userId: memberId,
      username: "member",
      dbPath: DB_PATH,
    };
    
    const colId = nanoid();
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [colId, testBoardId, "Test", 0]
    );

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await deleteColumn(db, memberSession, colId, { yes: true });
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(consoleErrors).toContain("Only the board owner can delete columns");
  });

  test("reorders remaining columns after deletion", async () => {
    const col1Id = nanoid();
    const col2Id = nanoid();
    const col3Id = nanoid();
    
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col1Id, testBoardId, "Col 1", 0]
    );
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col2Id, testBoardId, "Col 2", 1]
    );
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col3Id, testBoardId, "Col 3", 2]
    );

    await deleteColumn(db, testSession, col2Id, { yes: true });

    const remaining = db.query("SELECT * FROM columns WHERE boardId = ? ORDER BY position").all(testBoardId) as any[];
    expect(remaining.length).toBe(2);
    expect(remaining[0].id).toBe(col1Id);
    expect(remaining[0].position).toBe(0);
    expect(remaining[1].id).toBe(col3Id);
    expect(remaining[1].position).toBe(1);
  });
});

describe("reorderColumns", () => {
  test("reorders columns to specified order", async () => {
    const col1Id = nanoid();
    const col2Id = nanoid();
    const col3Id = nanoid();
    
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col1Id, testBoardId, "Col 1", 0]
    );
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col2Id, testBoardId, "Col 2", 1]
    );
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col3Id, testBoardId, "Col 3", 2]
    );

    // Reverse the order
    await reorderColumns(db, testSession, testBoardId, [col3Id, col2Id, col1Id], {});

    const reordered = db.query("SELECT * FROM columns WHERE boardId = ? ORDER BY position").all(testBoardId) as any[];
    expect(reordered[0].id).toBe(col3Id);
    expect(reordered[1].id).toBe(col2Id);
    expect(reordered[2].id).toBe(col1Id);
  });

  test("only allows board owner to reorder", async () => {
    // Create member user
    const memberId = nanoid();
    db.run(
      "INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, datetime('now'))",
      [memberId, "member", "hash"]
    );
    db.run(
      "INSERT INTO board_members (userId, boardId, role, joinedAt) VALUES (?, ?, ?, datetime('now'))",
      [memberId, testBoardId, "member"]
    );
    
    const memberSession = {
      userId: memberId,
      username: "member",
      dbPath: DB_PATH,
    };

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await reorderColumns(db, memberSession, testBoardId, [], {});
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(consoleErrors).toContain("Only the board owner can reorder columns");
  });

  test("validates all column IDs are provided", async () => {
    const col1Id = nanoid();
    const col2Id = nanoid();
    
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col1Id, testBoardId, "Col 1", 0]
    );
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col2Id, testBoardId, "Col 2", 1]
    );

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await reorderColumns(db, testSession, testBoardId, [col1Id], {}); // Missing col2Id
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(consoleErrors).toContain("You must provide all column IDs for the board");
  });

  test("validates column IDs belong to the board", async () => {
    const col1Id = nanoid();
    const wrongId = nanoid();
    
    db.run(
      "INSERT INTO columns (id, boardId, title, position, createdAt) VALUES (?, ?, ?, ?, datetime('now'))",
      [col1Id, testBoardId, "Col 1", 0]
    );

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await reorderColumns(db, testSession, testBoardId, [wrongId], {});
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(consoleErrors).toContain(`Column ${wrongId} not found in board`);
  });
});