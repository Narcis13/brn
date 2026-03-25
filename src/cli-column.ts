import type { Database } from "bun:sqlite";
import {
  createColumn as createColumnRecord,
  deleteColumn as deleteColumnRecord,
  getAllColumns,
  getBoardById,
  getColumnById,
  isBoardMember,
  reorderColumns as reorderColumnsInDb,
  updateColumn as updateColumnRecord,
} from "./src/db";
import type { TaktConfig } from "./cli-auth";
import {
  confirmOrExit,
  exitWithError,
  formatId,
  printSuccess,
  printTable,
  type FormatOptions,
} from "./cli-utils";

export async function listColumns(
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
    exitWithError("You do not have access to this board");
  }

  const columns = getAllColumns(db, boardId);

  if (options.json) {
    console.log(
      JSON.stringify(
        columns.map((column) => ({
          id: column.id,
          title: column.title,
          position: column.position,
          card_count: column.cards.length,
        })),
        null,
        2
      )
    );
    return;
  }

  if (columns.length === 0) {
    if (!options.quiet) {
      console.log("No columns found in this board");
    }
    return;
  }

  if (options.quiet) {
    columns.forEach((column) => console.log(formatId(column.id, options)));
    return;
  }

  printTable(
    ["ID", "Title", "Position", "Card count"],
    columns.map((column) => [
      formatId(column.id, options),
      column.title,
      String(column.position),
      String(column.cards.length),
    ])
  );
}

export async function createColumn(
  db: Database,
  session: TaktConfig,
  boardId: string,
  title: string,
  options: FormatOptions
): Promise<void> {
  const board = getBoardById(db, boardId);
  if (!board) {
    exitWithError("Board not found");
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("You do not have access to this board");
  }

  const column = createColumnRecord(db, boardId, title);

  if (options.json) {
    console.log(JSON.stringify(column, null, 2));
    return;
  }

  if (options.quiet) {
    console.log(formatId(column.id, options));
    return;
  }

  printSuccess(`Column created: ${formatId(column.id, options)}`);
}

export async function updateColumn(
  db: Database,
  session: TaktConfig,
  columnId: string,
  title: string,
  options: FormatOptions
): Promise<void> {
  const column = getColumnById(db, columnId);
  if (!column) {
    exitWithError("Column not found");
  }

  if (!isBoardMember(db, column.board_id, session.userId)) {
    exitWithError("You do not have access to this board");
  }

  const updated = updateColumnRecord(db, columnId, title);
  if (!updated) {
    exitWithError("Column not found");
  }

  if (options.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  if (!options.quiet) {
    printSuccess("Column updated successfully");
  }
}

export async function deleteColumn(
  db: Database,
  session: TaktConfig,
  columnId: string,
  options: FormatOptions
): Promise<void> {
  const column = getColumnById(db, columnId);
  if (!column) {
    exitWithError("Column not found");
  }

  if (!isBoardMember(db, column.board_id, session.userId)) {
    exitWithError("You do not have access to this board");
  }

  await confirmOrExit(options, `Delete column "${column.title}" and its cards?`);

  const deleted = deleteColumnRecord(db, columnId);
  if (!deleted) {
    exitWithError("Failed to delete column");
  }

  if (!options.quiet) {
    printSuccess("Column deleted successfully");
  }
}

export async function reorderColumns(
  db: Database,
  session: TaktConfig,
  boardId: string,
  columnIds: string[],
  options: FormatOptions
): Promise<void> {
  const board = getBoardById(db, boardId);
  if (!board) {
    exitWithError("Board not found");
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("You do not have access to this board");
  }

  const success = reorderColumnsInDb(db, boardId, columnIds);
  if (!success) {
    exitWithError("You must provide all column IDs for the board");
  }

  if (options.json) {
    const reordered = getAllColumns(db, boardId).map((column) => ({
      id: column.id,
      title: column.title,
      position: column.position,
    }));
    console.log(JSON.stringify(reordered, null, 2));
    return;
  }

  if (!options.quiet) {
    printSuccess("Columns reordered successfully");
  }
}
