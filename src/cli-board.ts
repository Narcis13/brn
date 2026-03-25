import type { Database } from "bun:sqlite";
import { 
  getUserBoards, 
  createBoard, 
  getBoardById, 
  deleteBoard,
  getBoardMembers,
  addBoardMember,
  removeBoardMember,
  isBoardOwner,
  isBoardMember,
  getUserByUsername,
  getCardActivity,
  getAllColumns,
  type BoardRow,
  type ActivityRow
} from "./src/db";
import type { TaktConfig } from "./cli-auth";

interface FormatOptions {
  json?: boolean;
  quiet?: boolean;
  fullIds?: boolean;
}

function formatId(id: string, options: FormatOptions): string {
  return options.fullIds ? id : id.slice(0, 8);
}

function formatDate(date: string): string {
  return new Date(date).toISOString().split('T')[0]!;
}

export async function listBoards(db: Database, session: TaktConfig, options: FormatOptions): Promise<void> {
  const boards = getUserBoards(db, session.userId);
  
  if (options.json) {
    console.log(JSON.stringify(boards, null, 2));
    return;
  }

  if (boards.length === 0) {
    if (!options.quiet) {
      console.log("No boards found. Create one with: takt board create \"Board Title\"");
    }
    return;
  }

  if (options.quiet) {
    boards.forEach(board => console.log(formatId(board.id, options)));
    return;
  }

  console.log("Your boards:");
  console.log("");
  
  const maxTitleLength = Math.max(...boards.map(b => b.title.length), 5);
  const idLength = options.fullIds ? 21 : 8;
  
  console.log(`${"ID".padEnd(idLength)}  ${"Title".padEnd(maxTitleLength)}  Created`);
  console.log("-".repeat(idLength + maxTitleLength + 14));
  
  boards.forEach(board => {
    console.log(
      `${formatId(board.id, options).padEnd(idLength)}  ${board.title.padEnd(maxTitleLength)}  ${formatDate(board.created_at)}`
    );
  });
}

export async function createBoardCommand(db: Database, session: TaktConfig, title: string, options: FormatOptions): Promise<void> {
  const board = createBoard(db, title, session.userId);
  
  if (options.json) {
    console.log(JSON.stringify(board, null, 2));
    return;
  }

  if (options.quiet) {
    console.log(formatId(board.id, options));
    return;
  }

  console.log(`Board created: ${formatId(board.id, options)}`);
}

export async function showBoard(db: Database, session: TaktConfig, boardId: string, options: FormatOptions): Promise<void> {
  const board = getBoardById(db, boardId);
  if (!board) {
    console.error("Board not found");
    process.exit(1);
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    console.error("Access denied - you are not a member of this board");
    process.exit(1);
  }

  const members = getBoardMembers(db, boardId);
  const columns = getAllColumns(db, boardId);
  const totalCards = columns.reduce((sum, col) => sum + col.cards.length, 0);

  if (options.json) {
    console.log(JSON.stringify({
      ...board,
      members,
      columns: columns.map(col => ({ ...col, cardCount: col.cards.length })),
      totalCards
    }, null, 2));
    return;
  }

  console.log(`Board: ${board.title}`);
  console.log(`ID: ${formatId(board.id, options)}`);
  console.log(`Created: ${formatDate(board.created_at)}`);
  console.log(`Members: ${members.length}`);
  console.log(`Columns: ${columns.length}`);
  console.log(`Total cards: ${totalCards}`);
  
  if (!options.quiet) {
    console.log("");
    console.log("Columns:");
    columns.forEach(col => {
      console.log(`  ${col.title} (${col.cards.length} cards)`);
    });
    
    console.log("");
    console.log("Members:");
    members.forEach(member => {
      const roleTag = member.role === 'owner' ? ' (owner)' : '';
      console.log(`  ${member.username}${roleTag}`);
    });
  }
}

export async function deleteBoardCommand(db: Database, session: TaktConfig, boardId: string, options: FormatOptions & { yes?: boolean }): Promise<void> {
  const board = getBoardById(db, boardId);
  if (!board) {
    console.error("Board not found");
    process.exit(1);
  }

  if (!isBoardOwner(db, boardId, session.userId)) {
    console.error("Access denied - only board owner can delete");
    process.exit(1);
  }

  if (!options.yes) {
    console.log(`Are you sure you want to delete board "${board.title}"?`);
    console.log("This will permanently delete all columns, cards, and data.");
    console.log("");
    console.log("To confirm, run with --yes flag");
    process.exit(0);
  }

  const success = deleteBoard(db, boardId);
  if (!success) {
    console.error("Failed to delete board");
    process.exit(1);
  }

  if (!options.quiet) {
    console.log("Board deleted successfully");
  }
}

export async function listBoardMembers(db: Database, session: TaktConfig, boardId: string, options: FormatOptions): Promise<void> {
  if (!isBoardMember(db, boardId, session.userId)) {
    console.error("Access denied - you are not a member of this board");
    process.exit(1);
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
    members.forEach(member => console.log(member.username));
    return;
  }

  console.log("Board members:");
  console.log("");
  
  const maxUsernameLength = Math.max(...members.map(m => m.username.length), 8);
  
  console.log(`${"Username".padEnd(maxUsernameLength)}  ${"Role".padEnd(6)}  Joined`);
  console.log("-".repeat(maxUsernameLength + 20));
  
  members.forEach(member => {
    console.log(
      `${member.username.padEnd(maxUsernameLength)}  ${member.role.padEnd(6)}  ${formatDate(member.invited_at)}`
    );
  });
}

export async function inviteToBoardCommand(db: Database, session: TaktConfig, boardId: string, username: string, options: FormatOptions): Promise<void> {
  if (!isBoardOwner(db, boardId, session.userId)) {
    console.error("Access denied - only board owner can invite");
    process.exit(1);
  }

  const user = getUserByUsername(db, username);
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }

  if (isBoardMember(db, boardId, user.id)) {
    console.error("User is already a board member");
    process.exit(1);
  }

  const member = addBoardMember(db, boardId, user.id, "member");
  
  if (options.json) {
    console.log(JSON.stringify(member, null, 2));
    return;
  }

  if (!options.quiet) {
    console.log(`User '${username}' added to board`);
  }
}

export async function kickFromBoardCommand(db: Database, session: TaktConfig, boardId: string, username: string, options: FormatOptions): Promise<void> {
  if (!isBoardOwner(db, boardId, session.userId)) {
    console.error("Access denied - only board owner can remove members");
    process.exit(1);
  }

  const user = getUserByUsername(db, username);
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }

  if (user.id === session.userId) {
    console.error("Cannot remove yourself from the board");
    process.exit(1);
  }

  if (isBoardOwner(db, boardId, user.id)) {
    console.error("Cannot remove board owner");
    process.exit(1);
  }

  const success = removeBoardMember(db, boardId, user.id);
  if (!success) {
    console.error("User is not a board member");
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`User '${username}' removed from board`);
  }
}

export async function showBoardActivity(db: Database, session: TaktConfig, boardId: string, limit: number, options: FormatOptions): Promise<void> {
  if (!isBoardMember(db, boardId, session.userId)) {
    console.error("Access denied - you are not a member of this board");
    process.exit(1);
  }

  // Since we don't have a direct getBoardActivity function, we'll need to get all cards and their activities
  const columns = getAllColumns(db, boardId);
  const allActivities: (ActivityRow & { cardTitle: string })[] = [];

  for (const column of columns) {
    for (const card of column.cards) {
      const activities = getCardActivity(db, card.id, limit);
      activities.forEach(activity => {
        allActivities.push({
          ...activity,
          cardTitle: card.title
        });
      });
    }
  }

  // Sort by timestamp descending and limit
  allActivities.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const limitedActivities = allActivities.slice(0, limit);

  if (options.json) {
    console.log(JSON.stringify(limitedActivities, null, 2));
    return;
  }

  if (limitedActivities.length === 0) {
    console.log("No activity found");
    return;
  }

  console.log(`Recent activity (last ${limit} items):`);
  console.log("");

  limitedActivities.forEach(activity => {
    const timestamp = new Date(activity.timestamp).toLocaleString();
    const detail = activity.detail ? JSON.parse(activity.detail) : null;
    
    let message = `[${timestamp}] Card "${activity.cardTitle}": ${activity.action}`;
    
    if (detail) {
      if (activity.action === 'update' && detail.field) {
        message += ` - ${detail.field} changed`;
        if (detail.field === 'position' || detail.field === 'column_id') {
          // Don't show old/new values for position/column changes
        } else if (detail.old !== undefined && detail.new !== undefined) {
          message += ` from "${detail.old}" to "${detail.new}"`;
        }
      }
    }
    
    console.log(message);
  });
}