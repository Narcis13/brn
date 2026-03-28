import type { Database } from "bun:sqlite";
import {
  addBoardMember,
  createBoard,
  deleteBoard,
  getAllColumns,
  getBoardArtifacts,
  getBoardById,
  getBoardMembers,
  getCardActivity,
  getUserByUsername,
  isBoardMember,
  isBoardOwner,
  removeBoardMember,
  type ActivityRow,
  type ArtifactRow,
} from "./src/db";
import type { TaktConfig } from "./cli-auth";
import {
  confirmOrExit,
  exitWithError,
  formatDate,
  formatDateTime,
  formatId,
  idText,
  printSuccess,
  printTable,
  type FormatOptions,
} from "./cli-utils";

type BoardMembershipRow = {
  id: string;
  title: string;
  created_at: string;
  role: "owner" | "member";
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function listBoards(
  db: Database,
  session: TaktConfig,
  options: FormatOptions
): Promise<void> {
  const boards = db.query(
    `SELECT b.id, b.title, b.created_at, bm.role
     FROM boards b
     JOIN board_members bm ON bm.board_id = b.id
     WHERE bm.user_id = ?
     ORDER BY b.created_at DESC`
  ).all(session.userId) as BoardMembershipRow[];

  if (options.json) {
    console.log(JSON.stringify(boards, null, 2));
    return;
  }

  if (boards.length === 0) {
    if (!options.quiet) {
      console.log('No boards found. Create one with: takt board create "Board Title"');
    }
    return;
  }

  if (options.quiet) {
    boards.forEach((board) => console.log(formatId(board.id, options)));
    return;
  }

  printTable(
    ["ID", "Title", "Role", "Created"],
    boards.map((board) => [
      formatId(board.id, options),
      board.title,
      board.role,
      formatDate(board.created_at),
    ])
  );
}

export async function createBoardCommand(
  db: Database,
  session: TaktConfig,
  title: string,
  options: FormatOptions
): Promise<void> {
  const board = createBoard(db, title, session.userId);

  if (options.json) {
    console.log(JSON.stringify(board, null, 2));
    return;
  }

  if (options.quiet) {
    console.log(formatId(board.id, options));
    return;
  }

  printSuccess(`Board created: ${idText(formatId(board.id, options))}`);
}

export async function showBoard(
  db: Database,
  session: TaktConfig,
  boardId: string,
  options: FormatOptions
): Promise<void> {
  const board = getBoardById(db, boardId);
  if (!board) {
    exitWithError("Board not found");
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("Access denied - you are not a member of this board");
  }

  const members = getBoardMembers(db, boardId);
  const columns = getAllColumns(db, boardId);
  const totalCards = columns.reduce((sum, column) => sum + column.cards.length, 0);
  const boardArtifacts: ArtifactRow[] = getBoardArtifacts(db, boardId);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ...board,
          member_count: members.length,
          total_cards: totalCards,
          columns: columns.map((column) => ({
            id: column.id,
            title: column.title,
            position: column.position,
            card_count: column.cards.length,
          })),
          members,
          artifacts: boardArtifacts,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Board: ${board.title}`);
  console.log(`ID: ${idText(formatId(board.id, options))}`);
  console.log(`Created: ${formatDate(board.created_at)}`);
  console.log(`Members: ${members.length}`);
  console.log(`Columns: ${columns.length}`);
  console.log(`Total cards: ${totalCards}`);

  if (options.quiet) {
    return;
  }

  console.log("");
  console.log("Columns:");
  columns.forEach((column) => {
    console.log(`  ${column.title} (${column.cards.length} cards)`);
  });

  if (boardArtifacts.length > 0) {
    console.log("");
    console.log("Board Artifacts:");
    printTable(
      ["ID", "Filename", "Type", "Size"],
      boardArtifacts.map((artifact) => [
        formatId(artifact.id, options),
        artifact.filename,
        artifact.filetype.toUpperCase(),
        formatFileSize(artifact.content.length),
      ])
    );
  }
}

export async function deleteBoardCommand(
  db: Database,
  session: TaktConfig,
  boardId: string,
  options: FormatOptions
): Promise<void> {
  const board = getBoardById(db, boardId);
  if (!board) {
    exitWithError("Board not found");
  }

  if (!isBoardOwner(db, boardId, session.userId)) {
    exitWithError("Only the board owner can delete this board");
  }

  await confirmOrExit(options, `Delete board "${board.title}" and all of its data?`, [
    `Are you sure you want to delete board "${board.title}"?`,
    "This will permanently delete all columns, cards, and data.",
  ]);

  const deleted = deleteBoard(db, boardId);
  if (!deleted) {
    exitWithError("Failed to delete board");
  }

  if (!options.quiet) {
    printSuccess("Board deleted successfully");
  }
}

export async function listBoardMembers(
  db: Database,
  session: TaktConfig,
  boardId: string,
  options: FormatOptions
): Promise<void> {
  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("Access denied - you are not a member of this board");
  }

  const members = getBoardMembers(db, boardId);

  if (options.json) {
    console.log(JSON.stringify(members, null, 2));
    return;
  }

  if (members.length === 0) {
    console.log("No members found");
    return;
  }

  if (options.quiet) {
    members.forEach((member) => console.log(member.username));
    return;
  }

  printTable(
    ["Username", "Role", "Invited"],
    members.map((member) => [member.username, member.role, formatDate(member.invited_at)])
  );
}

export async function inviteToBoardCommand(
  db: Database,
  session: TaktConfig,
  boardId: string,
  username: string,
  options: FormatOptions
): Promise<void> {
  if (!isBoardOwner(db, boardId, session.userId)) {
    exitWithError("Access denied - only board owner can invite");
  }

  const user = getUserByUsername(db, username);
  if (!user) {
    exitWithError("User not found");
  }

  if (isBoardMember(db, boardId, user.id)) {
    exitWithError("User is already a board member");
  }

  const member = addBoardMember(db, boardId, user.id, "member");

  if (options.json) {
    console.log(JSON.stringify(member, null, 2));
    return;
  }

  if (!options.quiet) {
    printSuccess(`Invited ${member.username} to the board`);
  }
}

export async function kickFromBoardCommand(
  db: Database,
  session: TaktConfig,
  boardId: string,
  username: string,
  options: FormatOptions
): Promise<void> {
  if (!isBoardOwner(db, boardId, session.userId)) {
    exitWithError("Access denied - only board owner can remove members");
  }

  const user = getUserByUsername(db, username);
  if (!user) {
    exitWithError("User not found");
  }

  if (user.id === session.userId) {
    exitWithError("Cannot kick yourself");
  }

  if (isBoardOwner(db, boardId, user.id)) {
    exitWithError("Cannot remove board owner");
  }

  const removed = removeBoardMember(db, boardId, user.id);
  if (!removed) {
    exitWithError("User is not a board member");
  }

  if (!options.quiet) {
    printSuccess(`Removed ${username} from the board`);
  }
}

function formatActivityDetail(activity: ActivityRow): string {
  if (!activity.detail) {
    return "";
  }

  try {
    const parsed = JSON.parse(activity.detail) as Record<string, string | string[] | null>;

    if (activity.action === "moved" && typeof parsed["from"] === "string" && typeof parsed["to"] === "string") {
      return ` (${parsed["from"]} -> ${parsed["to"]})`;
    }

    if (Array.isArray(parsed["fields"]) && parsed["fields"].length > 0) {
      return ` (${parsed["fields"].join(", ")})`;
    }

    if (typeof parsed["name"] === "string") {
      return ` (${parsed["name"]})`;
    }
  } catch {
    return "";
  }

  return "";
}

export async function showBoardActivity(
  db: Database,
  session: TaktConfig,
  boardId: string,
  limit: number,
  options: FormatOptions
): Promise<void> {
  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("Access denied - you are not a member of this board");
  }

  const columns = getAllColumns(db, boardId);
  const activityItems: Array<ActivityRow & { card_title: string }> = [];

  columns.forEach((column) => {
    column.cards.forEach((card) => {
      const activity = getCardActivity(db, card.id, limit);
      activity.forEach((item) => {
        activityItems.push({
          ...item,
          card_title: card.title,
        });
      });
    });
  });

  activityItems.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  const limited = activityItems.slice(0, limit);

  if (options.json) {
    console.log(JSON.stringify(limited, null, 2));
    return;
  }

  if (limited.length === 0) {
    console.log("No activity found");
    return;
  }

  if (options.quiet) {
    limited.forEach((item) => console.log(item.id));
    return;
  }

  limited.forEach((item) => {
    console.log(
      `${formatDateTime(item.timestamp)}  ${item.card_title}  ${item.action}${formatActivityDetail(item)}`
    );
  });
}
