import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import {
  listBoards,
  createBoardCommand,
  showBoard,
  deleteBoardCommand,
  listBoardMembers,
  inviteToBoardCommand,
  kickFromBoardCommand,
  showBoardActivity
} from "./cli-board";
import { createArtifact, createTestDb, createUser, createBoard, addBoardMember, createCard, createActivity, getAllColumns } from "./src/db";
import type { TaktConfig } from "./cli-auth";

describe("CLI Board Commands", () => {
  let db: Database;
  let testDir: string;
  let session: TaktConfig;
  let otherUserId: string;
  
  beforeEach(() => {
    testDir = `/tmp/brn-test-cli-board-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
    db = createTestDb(`${testDir}/test.db`);
    
    // Create test users
    const user = createUser(db, "testuser", "hashed");
    session = {
      userId: user.id,
      username: user.username,
      dbPath: `${testDir}/test.db`
    };
    
    const otherUser = createUser(db, "otheruser", "hashed");
    otherUserId = otherUser.id;
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  test("listBoards - empty list", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await listBoards(db, session, {});
    
    console.log = originalLog;
    expect(logs).toContain('No boards found. Create one with: takt board create "Board Title"');
  });

  test("listBoards - shows user's boards", async () => {
    // Create boards
    createBoard(db, "Board 1", session.userId);
    createBoard(db, "Board 2", session.userId);
    const board3 = createBoard(db, "Other's Board", otherUserId);
    addBoardMember(db, board3.id, session.userId, "member");
    
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await listBoards(db, session, {});
    
    console.log = originalLog;
    expect(logs.join("\n")).toContain("Board 1");
    expect(logs.join("\n")).toContain("Board 2");
    expect(logs.join("\n")).toContain("Other's Board");
  });

  test("listBoards - json format", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await listBoards(db, session, { json: true });
    
    console.log = originalLog;
    const result = JSON.parse(logs[0]!);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Test Board");
    expect(result[0].id).toBe(board.id);
  });

  test("listBoards - quiet mode", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await listBoards(db, session, { quiet: true });
    
    console.log = originalLog;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toBe(`${board.id.slice(0, 8)}...`);
  });

  test("listBoards - full IDs", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await listBoards(db, session, { fullIds: true });
    
    console.log = originalLog;
    expect(logs.join("\n")).toContain(board.id);
  });

  test("createBoardCommand - creates board successfully", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await createBoardCommand(db, session, "New Board", {});
    
    console.log = originalLog;
    expect(logs[0]).toMatch(/Board created: \w{8}\.\.\./);
    
    // Verify board was created
    const boards = db.query("SELECT * FROM boards WHERE user_id = ?").all(session.userId);
    expect(boards).toHaveLength(1);
  });

  test("showBoard - displays board overview", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await showBoard(db, session, board.id, {});
    
    console.log = originalLog;
    expect(logs.join("\n")).toContain("Board: Test Board");
    expect(logs.join("\n")).toContain("Members: 1");
    expect(logs.join("\n")).toContain("Columns: 3"); // Default columns
  });

  test("showBoard - access denied for non-member", async () => {
    const board = createBoard(db, "Private Board", otherUserId);
    
    const logs: string[] = [];
    const errors: string[] = [];
    const originalError = console.error;
    const originalExit = process.exit;
    let exitCode: number | undefined;
    
    console.error = (msg: string) => errors.push(msg);
    process.exit = (code?: number) => { exitCode = code; throw new Error("exit"); };
    
    try {
      await showBoard(db, session, board.id, {});
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    }
    
    console.error = originalError;
    process.exit = originalExit;
    
    expect(errors[0]).toBe("Access denied - you are not a member of this board");
    expect(exitCode).toBe(1);
  });

  test("deleteBoardCommand - requires confirmation", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    
    const logs: string[] = [];
    const originalLog = console.log;
    const originalExit = process.exit;
    let exitCode: number | undefined;
    
    console.log = (msg: string) => logs.push(msg);
    process.exit = (code?: number) => { exitCode = code; throw new Error("exit"); };
    
    try {
      await deleteBoardCommand(db, session, board.id, {});
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    }
    
    console.log = originalLog;
    process.exit = originalExit;
    
    expect(logs.join("\n")).toContain("Are you sure you want to delete");
    expect(logs.join("\n")).toContain("run with --yes flag");
    expect(exitCode).toBe(0);
  });

  test("deleteBoardCommand - deletes with confirmation", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await deleteBoardCommand(db, session, board.id, { yes: true });
    
    console.log = originalLog;
    expect(logs[0]).toBe("Board deleted successfully");
    
    // Verify board was deleted
    const boards = db.query("SELECT * FROM boards WHERE id = ?").all(board.id);
    expect(boards).toHaveLength(0);
  });

  test("deleteBoardCommand - only owner can delete", async () => {
    const board = createBoard(db, "Other's Board", otherUserId);
    addBoardMember(db, board.id, session.userId, "member");
    
    const errors: string[] = [];
    const originalError = console.error;
    const originalExit = process.exit;
    let exitCode: number | undefined;
    
    console.error = (msg: string) => errors.push(msg);
    process.exit = (code?: number) => { exitCode = code; throw new Error("exit"); };
    
    try {
      await deleteBoardCommand(db, session, board.id, { yes: true });
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    }
    
    console.error = originalError;
    process.exit = originalExit;
    
    expect(errors[0]).toBe("Only the board owner can delete this board");
    expect(exitCode).toBe(1);
  });

  test("listBoardMembers - shows all members with roles", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    addBoardMember(db, board.id, otherUserId, "member");
    
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await listBoardMembers(db, session, board.id, {});
    
    console.log = originalLog;
    expect(logs.join("\n")).toContain("testuser");
    expect(logs.join("\n")).toContain("owner");
    expect(logs.join("\n")).toContain("otheruser");
    expect(logs.join("\n")).toContain("member");
  });

  test("inviteToBoardCommand - adds member successfully", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await inviteToBoardCommand(db, session, board.id, "otheruser", {});
    
    console.log = originalLog;
    expect(logs[0]).toBe("Invited otheruser to the board");
    
    // Verify member was added
    const members = db.query("SELECT * FROM board_members WHERE board_id = ?").all(board.id);
    expect(members).toHaveLength(2);
  });

  test("inviteToBoardCommand - only owner can invite", async () => {
    const board = createBoard(db, "Other's Board", otherUserId);
    addBoardMember(db, board.id, session.userId, "member");
    
    const errors: string[] = [];
    const originalError = console.error;
    const originalExit = process.exit;
    let exitCode: number | undefined;
    
    console.error = (msg: string) => errors.push(msg);
    process.exit = (code?: number) => { exitCode = code; throw new Error("exit"); };
    
    try {
      await inviteToBoardCommand(db, session, board.id, "someuser", {});
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    }
    
    console.error = originalError;
    process.exit = originalExit;
    
    expect(errors[0]).toBe("Access denied - only board owner can invite");
    expect(exitCode).toBe(1);
  });

  test("kickFromBoardCommand - removes member successfully", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    addBoardMember(db, board.id, otherUserId, "member");
    
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await kickFromBoardCommand(db, session, board.id, "otheruser", {});
    
    console.log = originalLog;
    expect(logs[0]).toBe("Removed otheruser from the board");
    
    // Verify member was removed
    const members = db.query("SELECT * FROM board_members WHERE board_id = ?").all(board.id);
    expect(members).toHaveLength(1);
  });

  test("kickFromBoardCommand - cannot kick yourself", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    
    const errors: string[] = [];
    const originalError = console.error;
    const originalExit = process.exit;
    let exitCode: number | undefined;
    
    console.error = (msg: string) => errors.push(msg);
    process.exit = (code?: number) => { exitCode = code; throw new Error("exit"); };
    
    try {
      await kickFromBoardCommand(db, session, board.id, "testuser", {});
    } catch (e: any) {
      if (e.message !== "exit") throw e;
    }
    
    console.error = originalError;
    process.exit = originalExit;
    
    expect(errors[0]).toBe("Cannot kick yourself");
    expect(exitCode).toBe(1);
  });

  test("showBoardActivity - displays recent activity", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    const columns = getAllColumns(db, board.id);
    const card = createCard(db, "Test Card", columns[0]!.id, "", null, session.userId);
    
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    await showBoardActivity(db, session, board.id, 20, {});
    
    console.log = originalLog;
    expect(logs.join("\n")).toContain("Test Card");
    expect(logs.join("\n")).toContain("created");
  });

  test("showBoardActivity - respects limit parameter", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    const columns = getAllColumns(db, board.id);

    // Create multiple cards
    for (let i = 0; i < 10; i++) {
      createCard(db, `Card ${i}`, columns[0]!.id, "", null, session.userId);
    }

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    await showBoardActivity(db, session, board.id, 5, {});

    console.log = originalLog;
    const activityLines = logs.filter(line => line.includes("Card"));
    expect(activityLines).toHaveLength(5);
  });

  test("showBoard json includes empty artifacts array when no board artifacts exist", async () => {
    const board = createBoard(db, "Test Board", session.userId);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    await showBoard(db, session, board.id, { json: true });

    console.log = originalLog;
    const parsed = JSON.parse(logs[0]!);
    expect(parsed.artifacts).toEqual([]);
  });

  test("showBoard json includes board artifacts array with artifact data", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    createArtifact(db, board.id, null, "readme.md", "md", "# Board Doc", session.userId);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    await showBoard(db, session, board.id, { json: true });

    console.log = originalLog;
    const parsed = JSON.parse(logs[0]!);
    expect(parsed.artifacts).toHaveLength(1);
    expect(parsed.artifacts[0].filename).toBe("readme.md");
    expect(parsed.artifacts[0].filetype).toBe("md");
  });

  test("showBoard omits Board Artifacts section when no board-level artifacts exist", async () => {
    const board = createBoard(db, "Test Board", session.userId);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    await showBoard(db, session, board.id, {});

    console.log = originalLog;
    expect(logs.join("\n")).not.toContain("Board Artifacts:");
  });

  test("showBoard displays Board Artifacts section in table format when board artifacts exist", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    createArtifact(db, board.id, null, "deploy.sh", "sh", "#!/bin/sh\necho deploy", session.userId);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    await showBoard(db, session, board.id, {});

    console.log = originalLog;
    const output = logs.join("\n");
    expect(output).toContain("Board Artifacts:");
    expect(output).toContain("deploy.sh");
    expect(output).toContain("SH");
  });

  test("showBoard Board Artifacts section appears after columns summary", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    createArtifact(db, board.id, null, "notes.ts", "ts", "const x = 1;", session.userId);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    await showBoard(db, session, board.id, {});

    console.log = originalLog;
    const output = logs.join("\n");
    const columnsPos = output.indexOf("Columns:");
    const artifactsPos = output.indexOf("Board Artifacts:");
    expect(columnsPos).toBeGreaterThan(-1);
    expect(artifactsPos).toBeGreaterThan(columnsPos);
  });

  test("showBoard does not show Board Artifacts section for card-level artifacts only", async () => {
    const board = createBoard(db, "Test Board", session.userId);
    const columns = getAllColumns(db, board.id);
    const card = createCard(db, "Card With Artifact", columns[0]!.id, "", null, session.userId)!;
    // This is a card artifact, not a board artifact
    createArtifact(db, board.id, card.id, "card-notes.md", "md", "# Card", session.userId);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    await showBoard(db, session, board.id, {});

    console.log = originalLog;
    expect(logs.join("\n")).not.toContain("Board Artifacts:");
  });
});
