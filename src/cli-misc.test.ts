import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import {
  assignLabelToCard,
  createBoard,
  createCard,
  createLabel,
  createTestDb,
  createUser,
  getBoardLabels,
  getCardById,
  getCardComments,
  getCommentById,
  getLabelById,
  getAllColumns,
} from "./src/db";
import type { TaktConfig } from "./cli-auth";
import {
  assignLabelCommand,
  createLabelCommand,
  deleteLabelCommand,
  listLabels,
  unassignLabelCommand,
  updateLabelCommand,
} from "./cli-label";
import {
  addCommentCommand,
  deleteCommentCommand,
  editCommentCommand,
} from "./cli-comment";
import { searchCardsCommand } from "./cli-search";
import { formatId, resolveDbPath } from "./cli-utils";

describe("CLI Label, Comment, Search, and Utility Behavior", () => {
  let db: Database;
  let testDir: string;
  let session: TaktConfig;
  let otherSession: TaktConfig;
  let boardId: string;
  let columnId: string;
  let cardId: string;

  beforeEach(() => {
    testDir = `/tmp/brn-test-cli-misc-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
    db = createTestDb(`${testDir}/test.db`);

    const user = createUser(db, "owner", "hashed");
    const other = createUser(db, "other", "hashed");
    session = { userId: user.id, username: user.username, dbPath: `${testDir}/test.db` };
    otherSession = { userId: other.id, username: other.username, dbPath: `${testDir}/test.db` };

    const board = createBoard(db, "Misc Board", user.id);
    boardId = board.id;
    columnId = getAllColumns(db, boardId)[0]!.id;
    cardId = createCard(db, "Searchable card", columnId, "Has comments", null, user.id)!.id;
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  test("label commands create, update, assign, unassign, and delete labels", async () => {
    await createLabelCommand(db, session, boardId, "Urgent", "#ff0000", {});
    const created = getBoardLabels(db, boardId)[0]!;

    await updateLabelCommand(db, session, created.id, { color: "#00ff00" }, {});
    expect(getLabelById(db, created.id)?.color).toBe("#00ff00");

    await assignLabelCommand(db, session, cardId, created.id, {});
    const searchLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => searchLogs.push(args.join(" "));
    await listLabels(db, session, boardId, {});
    console.log = originalLog;
    expect(searchLogs.join("\n")).toContain("Urgent");

    await unassignLabelCommand(db, session, cardId, created.id, {});
    await deleteLabelCommand(db, session, created.id, {});
    expect(getLabelById(db, created.id)).toBeNull();
  });

  test("comment commands add, edit, and delete comments", async () => {
    await addCommentCommand(db, session, cardId, "Initial comment", {});
    const created = getCardComments(db, cardId)[0]!;

    await editCommentCommand(db, session, created.id, "Edited comment", {});
    expect(getCommentById(db, created.id)?.content).toBe("Edited comment");

    await deleteCommentCommand(db, session, created.id, {});
    expect(getCommentById(db, created.id)).toBeNull();
  });

  test("comment edit rejects non-authors", async () => {
    await addCommentCommand(db, session, cardId, "Owner comment", {});
    const created = getCardComments(db, cardId)[0]!;

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
      await editCommentCommand(db, otherSession, created.id, "Nope", {});
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "exit") {
        throw error;
      }
    }

    console.error = originalError;
    process.exit = originalExit;

    expect(errors[0]).toContain("You are not a member of this board");
    expect(exitCode).toBe(1);
  });

  test("searchCardsCommand matches label names", async () => {
    const label = createLabel(db, boardId, "backend", "#123456");
    assignLabelToCard(db, cardId, label.id);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await searchCardsCommand(db, session, boardId, "backend", {});

    console.log = originalLog;
    expect(logs.join("\n")).toContain("Searchable card");
  });

  test("resolveDbPath prefers the local project path when invoked inside the project", () => {
    const resolved = resolveDbPath(
      { userId: "u", username: "user", dbPath: "/remote/kanban.db" },
      "/work/project",
      "/work/project"
    );

    expect(resolved).toBe("/work/project/data/kanban.db");
  });

  test("formatId truncates ids with ellipsis by default", () => {
    expect(formatId("abcdefgh123456", {})).toBe("abcdefgh...");
    expect(formatId("abcdefgh123456", { fullIds: true })).toBe("abcdefgh123456");
  });
});
