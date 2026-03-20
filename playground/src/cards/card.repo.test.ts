import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "fs";
import { getDb, runMigrations } from "../db";
import {
  createCard,
  findCardById,
  findCardsByBoardId,
  findCardsByBoardAndColumn,
  updateCard,
  deleteCard,
} from "./card.repo";
import type { NewCard } from "../types";
import { createUser } from "../user.repo";
import { createBoard } from "../boards/board.repo";

describe("card.repo", () => {
  let db: Database;
  let testBoardId: string;
  let testUserId: string;
  const TEST_DB_PATH = "/tmp/card-repo-test.db";

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    db = getDb(TEST_DB_PATH);
    runMigrations(db);

    const user = createUser(db, {
      email: "test@example.com",
      passwordHash: "hashed_password",
    });
    testUserId = user.id;

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

  test("createCard creates a card with valid board reference", async () => {
    const newCard: NewCard = {
      title: "My First Card",
      boardId: testBoardId,
      column: "todo",
      position: 0,
    };

    const card = await createCard(db, newCard);

    expect(card.title).toBe("My First Card");
    expect(card.boardId).toBe(testBoardId);
    expect(card.column).toBe("todo");
    expect(card.position).toBe(0);
    expect(card.createdAt).toBeTruthy();
    expect(card.updatedAt).toBeTruthy();
    expect(card.createdAt).toBe(card.updatedAt);
  });

  test("createCard generates UUID id", async () => {
    const card = await createCard(db, {
      title: "UUID Test",
      boardId: testBoardId,
      column: "todo",
      position: 0,
    });

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(card.id).toMatch(uuidRegex);
  });

  test("findCardById returns card when exists", async () => {
    const created = await createCard(db, {
      title: "Find Me",
      boardId: testBoardId,
      column: "doing",
      position: 0,
    });

    const found = await findCardById(db, created.id);

    expect(found).toBeTruthy();
    expect(found?.id).toBe(created.id);
    expect(found?.title).toBe("Find Me");
    expect(found?.boardId).toBe(testBoardId);
    expect(found?.column).toBe("doing");
  });

  test("findCardById returns null when not found", async () => {
    const card = await findCardById(
      db,
      "00000000-0000-4000-8000-000000000000"
    );

    expect(card).toBeNull();
  });

  test("findCardsByBoardId returns all cards for a board", async () => {
    await createCard(db, {
      title: "Card 1",
      boardId: testBoardId,
      column: "todo",
      position: 0,
    });
    await createCard(db, {
      title: "Card 2",
      boardId: testBoardId,
      column: "doing",
      position: 0,
    });

    // Create card on a different board
    const otherBoard = await createBoard(db, {
      name: "Other Board",
      userId: testUserId,
    });
    await createCard(db, {
      title: "Other Card",
      boardId: otherBoard.id,
      column: "todo",
      position: 0,
    });

    const cards = await findCardsByBoardId(db, testBoardId);

    expect(cards.length).toBe(2);
    expect(cards[0]?.title).toBe("Card 1");
    expect(cards[1]?.title).toBe("Card 2");
  });

  test("findCardsByBoardId returns empty array when no cards", async () => {
    const cards = await findCardsByBoardId(db, testBoardId);

    expect(cards).toBeArray();
    expect(cards.length).toBe(0);
  });

  test("findCardsByBoardAndColumn filters by column", async () => {
    await createCard(db, {
      title: "Todo Card",
      boardId: testBoardId,
      column: "todo",
      position: 0,
    });
    await createCard(db, {
      title: "Doing Card",
      boardId: testBoardId,
      column: "doing",
      position: 0,
    });
    await createCard(db, {
      title: "Done Card",
      boardId: testBoardId,
      column: "done",
      position: 0,
    });

    const todoCards = await findCardsByBoardAndColumn(
      db,
      testBoardId,
      "todo"
    );

    expect(todoCards.length).toBe(1);
    expect(todoCards[0]?.title).toBe("Todo Card");
    expect(todoCards[0]?.column).toBe("todo");
  });

  test("updateCard modifies card properties", async () => {
    const card = await createCard(db, {
      title: "Original Title",
      boardId: testBoardId,
      column: "todo",
      position: 0,
    });
    const originalCreatedAt = card.createdAt;

    await Bun.sleep(10);

    const updated = await updateCard(db, card.id, {
      title: "Updated Title",
      column: "doing",
      position: 1,
    });

    expect(updated).toBeTruthy();
    expect(updated?.id).toBe(card.id);
    expect(updated?.title).toBe("Updated Title");
    expect(updated?.column).toBe("doing");
    expect(updated?.position).toBe(1);
    expect(updated?.boardId).toBe(testBoardId);
    expect(updated?.createdAt).toBe(originalCreatedAt);
    expect(updated?.updatedAt).not.toBe(originalCreatedAt);
  });

  test("updateCard returns null when card not found", async () => {
    const result = await updateCard(
      db,
      "00000000-0000-4000-8000-000000000000",
      { title: "Nope" }
    );

    expect(result).toBeNull();
  });

  test("deleteCard removes card from database", async () => {
    const card = await createCard(db, {
      title: "To Be Deleted",
      boardId: testBoardId,
      column: "todo",
      position: 0,
    });

    const deleted = await deleteCard(db, card.id);
    expect(deleted).toBe(true);

    const notFound = await findCardById(db, card.id);
    expect(notFound).toBeNull();
  });

  test("deleteCard returns false when card not found", async () => {
    const deleted = await deleteCard(
      db,
      "00000000-0000-4000-8000-000000000000"
    );

    expect(deleted).toBe(false);
  });

  test("position tracking within columns", async () => {
    await createCard(db, {
      title: "First",
      boardId: testBoardId,
      column: "todo",
      position: 0,
    });
    await createCard(db, {
      title: "Second",
      boardId: testBoardId,
      column: "todo",
      position: 1,
    });
    await createCard(db, {
      title: "Third",
      boardId: testBoardId,
      column: "todo",
      position: 2,
    });

    const cards = await findCardsByBoardAndColumn(db, testBoardId, "todo");

    expect(cards.length).toBe(3);
    expect(cards[0]?.title).toBe("First");
    expect(cards[0]?.position).toBe(0);
    expect(cards[1]?.title).toBe("Second");
    expect(cards[1]?.position).toBe(1);
    expect(cards[2]?.title).toBe("Third");
    expect(cards[2]?.position).toBe(2);
  });
});
