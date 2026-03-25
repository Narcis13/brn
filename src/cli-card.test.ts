import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import {
  createBoard,
  createCard,
  createTestDb,
  createUser,
  getAllColumns,
  getCardById,
  getCardDetail,
} from "./src/db";
import {
  createCardCommand,
  deleteCardCommand,
  listCards,
  moveCard,
  showCard,
  updateCardCommand,
} from "./cli-card";
import type { TaktConfig } from "./cli-auth";

describe("CLI Card Commands", () => {
  let db: Database;
  let testDir: string;
  let session: TaktConfig;
  let boardId: string;
  let todoColumnId: string;
  let doneColumnId: string;

  beforeEach(() => {
    testDir = `/tmp/brn-test-cli-card-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
    db = createTestDb(`${testDir}/test.db`);

    const user = createUser(db, "cards", "hashed");
    session = { userId: user.id, username: user.username, dbPath: `${testDir}/test.db` };

    const board = createBoard(db, "Cards Board", user.id);
    boardId = board.id;
    const columns = getAllColumns(db, boardId);
    todoColumnId = columns[0]!.id;
    doneColumnId = columns[2]!.id;
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  test("createCardCommand stores dates and prints the new id", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await createCardCommand(
      db,
      session,
      boardId,
      todoColumnId,
      "CLI task",
      "Ship the CLI",
      "2026-03-30",
      "2026-03-25",
      {}
    );

    console.log = originalLog;

    const cards = getAllColumns(db, boardId)[0]!.cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]!.due_date).toBe("2026-03-30");
    expect(cards[0]!.start_date).toBe("2026-03-25");
    expect(logs[0]).toContain("Card created:");
  });

  test("listCards outputs json rows with column information", async () => {
    createCard(db, "One", todoColumnId, "First", null, session.userId);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await listCards(db, session, boardId, undefined, { json: true });

    console.log = originalLog;
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].column_title).toBe("To Do");
  });

  test("showCard prints board and column details", async () => {
    const card = createCard(db, "Inspect me", todoColumnId, "With detail", null, session.userId)!;

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await showCard(db, session, card.id, {});

    console.log = originalLog;
    const output = logs.join("\n");
    expect(output).toContain("Board: Cards Board");
    expect(output).toContain("Column: To Do");
    expect(output).toContain("Inspect me");
  });

  test("updateCardCommand supports checklist helpers", async () => {
    const card = createCard(db, "Checklist", todoColumnId, "", null, session.userId)!;

    await updateCardCommand(
      db,
      session,
      card.id,
      {
        addCheck: "First item",
      },
      {}
    );

    await updateCardCommand(
      db,
      session,
      card.id,
      {
        toggleCheck: 0,
      },
      {}
    );

    const updated = getCardById(db, card.id)!;
    const checklist = JSON.parse(updated.checklist) as Array<{ text: string; checked: boolean }>;
    expect(checklist).toHaveLength(1);
    expect(checklist[0]).toMatchObject({ text: "First item", checked: true });
  });

  test("updateCardCommand validates checklist indexes", async () => {
    const card = createCard(db, "Checklist", todoColumnId, "", null, session.userId)!;
    const errors: string[] = [];
    const originalError = console.error;
    const originalExit = process.exit;
    let exitCode: number | undefined;

    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as typeof process.exit;

    try {
      await updateCardCommand(db, session, card.id, { toggleCheck: 99 }, {});
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "exit") {
        throw error;
      }
    }

    console.error = originalError;
    process.exit = originalExit;

    expect(errors[0]).toContain("Checklist index out of range");
    expect(exitCode).toBe(1);
  });

  test("moveCard moves cards to another column", async () => {
    const card = createCard(db, "Move me", todoColumnId, "", null, session.userId)!;

    await moveCard(db, session, card.id, doneColumnId, 0, {});

    expect(getCardById(db, card.id)?.column_id).toBe(doneColumnId);
  });

  test("deleteCardCommand removes the card", async () => {
    const card = createCard(db, "Delete me", todoColumnId, "", null, session.userId)!;

    await deleteCardCommand(db, session, card.id, { yes: true });

    expect(getCardById(db, card.id)).toBeNull();
  });

  test("showCard json includes board and column titles", async () => {
    const card = createCard(db, "Structured", todoColumnId, "", null, session.userId)!;
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await showCard(db, session, card.id, { json: true });

    console.log = originalLog;
    const parsed = JSON.parse(logs[0]!);
    expect(parsed.board_title).toBe("Cards Board");
    expect(parsed.column_title).toBe("To Do");
  });
});
