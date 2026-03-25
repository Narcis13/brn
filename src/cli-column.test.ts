import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import {
  createBoard,
  createColumn as createColumnRecord,
  createTestDb,
  createUser,
  getAllColumns,
  addBoardMember,
} from "./src/db";
import { createColumn, deleteColumn, listColumns, reorderColumns, updateColumn } from "./cli-column";
import type { TaktConfig } from "./cli-auth";

describe("CLI Column Commands", () => {
  let db: Database;
  let testDir: string;
  let ownerSession: TaktConfig;
  let memberSession: TaktConfig;
  let outsiderSession: TaktConfig;
  let boardId: string;

  beforeEach(() => {
    testDir = `/tmp/brn-test-cli-column-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
    db = createTestDb(`${testDir}/test.db`);

    const owner = createUser(db, "owner", "hashed");
    const member = createUser(db, "member", "hashed");
    const outsider = createUser(db, "outsider", "hashed");

    ownerSession = { userId: owner.id, username: owner.username, dbPath: `${testDir}/test.db` };
    memberSession = { userId: member.id, username: member.username, dbPath: `${testDir}/test.db` };
    outsiderSession = { userId: outsider.id, username: outsider.username, dbPath: `${testDir}/test.db` };

    const board = createBoard(db, "Columns Board", owner.id);
    boardId = board.id;
    addBoardMember(db, boardId, member.id, "member");
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  test("listColumns shows columns in position order", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await listColumns(db, ownerSession, boardId, {});

    console.log = originalLog;

    const output = logs.join("\n");
    expect(output).toContain("To Do");
    expect(output.indexOf("To Do")).toBeLessThan(output.indexOf("In Progress"));
    expect(output.indexOf("In Progress")).toBeLessThan(output.indexOf("Done"));
  });

  test("createColumn appends at the end", async () => {
    await createColumn(db, ownerSession, boardId, "Blocked", {});

    const columns = getAllColumns(db, boardId);
    expect(columns.at(-1)?.title).toBe("Blocked");
    expect(columns.at(-1)?.position).toBe(3);
  });

  test("updateColumn renames the target column", async () => {
    const columnId = getAllColumns(db, boardId)[0]!.id;

    await updateColumn(db, ownerSession, columnId, "Backlog", {});

    expect(getAllColumns(db, boardId)[0]!.title).toBe("Backlog");
  });

  test("deleteColumn removes the column and compacts positions", async () => {
    const middleColumnId = getAllColumns(db, boardId)[1]!.id;

    await deleteColumn(db, ownerSession, middleColumnId, { yes: true });

    const columns = getAllColumns(db, boardId);
    expect(columns).toHaveLength(2);
    expect(columns.map((column) => column.position)).toEqual([0, 1]);
  });

  test("reorderColumns accepts member access and updates order", async () => {
    const current = getAllColumns(db, boardId);
    const nextOrder = [current[2]!.id, current[0]!.id, current[1]!.id];

    await reorderColumns(db, memberSession, boardId, nextOrder, {});

    expect(getAllColumns(db, boardId).map((column) => column.id)).toEqual(nextOrder);
  });

  test("createColumn rejects non-members", async () => {
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
      await createColumn(db, outsiderSession, boardId, "Secret", {});
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "exit") {
        throw error;
      }
    }

    console.error = originalError;
    process.exit = originalExit;

    expect(errors[0]).toContain("You do not have access to this board");
    expect(exitCode).toBe(1);
  });

  test("listColumns outputs json", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await listColumns(db, ownerSession, boardId, { json: true });

    console.log = originalLog;
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].title).toBe("To Do");
  });

  test("reorderColumns validates complete column lists", async () => {
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
      const subset = getAllColumns(db, boardId)
        .slice(0, 2)
        .map((column) => column.id);
      await reorderColumns(db, ownerSession, boardId, subset, {});
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "exit") {
        throw error;
      }
    }

    console.error = originalError;
    process.exit = originalExit;

    expect(errors[0]).toContain("You must provide all column IDs for the board");
    expect(exitCode).toBe(1);
  });
});
