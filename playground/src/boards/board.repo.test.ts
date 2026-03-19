import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "fs";
import { getDb, runMigrations } from "../db";
import {
  createBoard,
  findBoardsByUserId,
  findBoardById,
  updateBoard,
  deleteBoard
} from "./board.repo";
import type { Board, NewBoard } from "../types";
import { createUser } from "../user.repo";

describe("board.repo", () => {
  let db: Database;
  let testUserId: string;
  const TEST_DB_PATH = "/tmp/board-repo-test.db";

  beforeEach(async () => {
    // Clean up any existing database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    
    // Create fresh test database
    db = getDb(TEST_DB_PATH);
    runMigrations(db);
    
    // Create a test user for board ownership
    const user = await createUser(db, {
      email: "test@example.com",
      passwordHash: "hashed_password"
    });
    testUserId = user.id;
  });

  afterEach(() => {
    db.close();
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("createBoard creates board with valid data", async () => {
    const newBoard: NewBoard = {
      name: "My First Board",
      userId: testUserId
    };

    const board = await createBoard(db, newBoard);

    expect(board.name).toBe("My First Board");
    expect(board.userId).toBe(testUserId);
    expect(board.createdAt).toBeTruthy();
    expect(board.updatedAt).toBeTruthy();
    expect(board.createdAt).toBe(board.updatedAt);
  });

  test("createBoard generates UUID id", async () => {
    const newBoard: NewBoard = {
      name: "Test Board",
      userId: testUserId
    };

    const board = await createBoard(db, newBoard);

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(board.id).toMatch(uuidRegex);
  });

  test("findBoardsByUserId returns user's boards", async () => {
    // Create multiple boards for the user
    const board1 = await createBoard(db, { name: "Board 1", userId: testUserId });
    const board2 = await createBoard(db, { name: "Board 2", userId: testUserId });
    
    // Create a board for another user
    const otherUser = await createUser(db, {
      email: "other@example.com",
      passwordHash: "hashed"
    });
    await createBoard(db, { name: "Other Board", userId: otherUser.id });

    const boards = await findBoardsByUserId(db, testUserId);

    expect(boards.length).toBe(2);
    expect(boards[0].id).toBe(board1.id);
    expect(boards[1].id).toBe(board2.id);
    expect(boards[0].name).toBe("Board 1");
    expect(boards[1].name).toBe("Board 2");
  });

  test("findBoardsByUserId returns empty array for user with no boards", async () => {
    const boards = await findBoardsByUserId(db, testUserId);

    expect(boards).toBeArray();
    expect(boards.length).toBe(0);
  });

  test("findBoardById returns board when exists", async () => {
    const createdBoard = await createBoard(db, {
      name: "Find Me",
      userId: testUserId
    });

    const foundBoard = await findBoardById(db, createdBoard.id);

    expect(foundBoard).toBeTruthy();
    expect(foundBoard?.id).toBe(createdBoard.id);
    expect(foundBoard?.name).toBe("Find Me");
    expect(foundBoard?.userId).toBe(testUserId);
  });

  test("findBoardById returns null when not found", async () => {
    const board = await findBoardById(db, "00000000-0000-4000-8000-000000000000");

    expect(board).toBeNull();
  });

  test("updateBoard updates board name", async () => {
    const board = await createBoard(db, {
      name: "Original Name",
      userId: testUserId
    });
    const originalCreatedAt = board.createdAt;
    
    // Wait a moment to ensure updatedAt differs
    await Bun.sleep(10);

    const updated = await updateBoard(db, board.id, { name: "New Name" });

    expect(updated).toBeTruthy();
    expect(updated?.id).toBe(board.id);
    expect(updated?.name).toBe("New Name");
    expect(updated?.userId).toBe(testUserId);
    expect(updated?.createdAt).toBe(originalCreatedAt);
    expect(updated?.updatedAt).not.toBe(originalCreatedAt);
  });

  test("deleteBoard removes board from database", async () => {
    const board = await createBoard(db, {
      name: "To Be Deleted",
      userId: testUserId
    });

    const deleted = await deleteBoard(db, board.id);
    expect(deleted).toBe(true);

    const notFound = await findBoardById(db, board.id);
    expect(notFound).toBeNull();
  });
});