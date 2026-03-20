import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "fs";
import { getDb, runMigrations } from "../db";
import { createUser } from "../user.repo";
import { createBoard } from "../boards/board.repo";
import { createCard as repoCreateCard } from "./card.repo";
import { validateBoardOwnership, createCard } from "./card.service";

describe("card.service", () => {
  let db: Database;
  let testUserId: string;
  let testBoardId: string;
  let otherUserId: string;
  const TEST_DB_PATH = "/tmp/card-service-test.db";

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    db = getDb(TEST_DB_PATH);
    runMigrations(db);

    const user = createUser(db, {
      email: "owner@example.com",
      passwordHash: "hashed_password",
    });
    testUserId = user.id;

    const otherUser = createUser(db, {
      email: "other@example.com",
      passwordHash: "hashed_password",
    });
    otherUserId = otherUser.id;

    const board = await createBoard(db, {
      name: "Test Board",
      userId: testUserId,
    });
    testBoardId = board.id;
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("validateBoardOwnership", () => {
    test("returns exists=true, isOwner=true when user owns the board", async () => {
      const result = await validateBoardOwnership(db, testBoardId, testUserId);

      expect(result.exists).toBe(true);
      expect(result.isOwner).toBe(true);
    });

    test("returns exists=false when board does not exist", async () => {
      const result = await validateBoardOwnership(
        db,
        "00000000-0000-4000-8000-000000000000",
        testUserId
      );

      expect(result.exists).toBe(false);
      expect(result.isOwner).toBe(false);
    });

    test("returns exists=true, isOwner=false when user does not own the board", async () => {
      const result = await validateBoardOwnership(db, testBoardId, otherUserId);

      expect(result.exists).toBe(true);
      expect(result.isOwner).toBe(false);
    });
  });

  describe("createCard", () => {
    test("creates card on board owned by user", async () => {
      const card = await createCard(db, {
        title: "New Card",
        boardId: testBoardId,
        column: "todo",
        userId: testUserId,
      });

      expect(card.title).toBe("New Card");
      expect(card.boardId).toBe(testBoardId);
      expect(card.column).toBe("todo");
      expect(card.position).toBe(0);
      expect(card.id).toBeTruthy();
      expect(card.createdAt).toBeTruthy();
    });

    test("throws 'Board not found' when board does not exist", async () => {
      await expect(
        createCard(db, {
          title: "Orphan Card",
          boardId: "00000000-0000-4000-8000-000000000000",
          column: "todo",
          userId: testUserId,
        })
      ).rejects.toThrow("Board not found");
    });

    test("throws 'Not authorized' when user does not own the board", async () => {
      await expect(
        createCard(db, {
          title: "Unauthorized Card",
          boardId: testBoardId,
          column: "todo",
          userId: otherUserId,
        })
      ).rejects.toThrow("Not authorized");
    });

    test("sets initial position at end of column", async () => {
      await createCard(db, {
        title: "First",
        boardId: testBoardId,
        column: "todo",
        userId: testUserId,
      });
      await createCard(db, {
        title: "Second",
        boardId: testBoardId,
        column: "todo",
        userId: testUserId,
      });

      const third = await createCard(db, {
        title: "Third",
        boardId: testBoardId,
        column: "todo",
        userId: testUserId,
      });

      expect(third.position).toBe(2);
    });

    test("position is per-column, not global", async () => {
      await createCard(db, {
        title: "Todo Card",
        boardId: testBoardId,
        column: "todo",
        userId: testUserId,
      });

      const doingCard = await createCard(db, {
        title: "Doing Card",
        boardId: testBoardId,
        column: "doing",
        userId: testUserId,
      });

      expect(doingCard.position).toBe(0);
    });

    test("throws 'Card title is required' when title is empty", async () => {
      await expect(
        createCard(db, {
          title: "",
          boardId: testBoardId,
          column: "todo",
          userId: testUserId,
        })
      ).rejects.toThrow("Card title is required");
    });

    test("throws 'Card title is required' when title is whitespace only", async () => {
      await expect(
        createCard(db, {
          title: "   ",
          boardId: testBoardId,
          column: "todo",
          userId: testUserId,
        })
      ).rejects.toThrow("Card title is required");
    });
  });
});
