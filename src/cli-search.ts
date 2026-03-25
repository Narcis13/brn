import type { Database } from "bun:sqlite";
import { getBoardById, isBoardMember, searchCards } from "./src/db";
import type { TaktConfig } from "./cli-auth";
import {
  exitWithError,
  formatDate,
  formatId,
  printTable,
  type FormatOptions,
} from "./cli-utils";

export async function searchCardsCommand(
  db: Database,
  session: TaktConfig,
  boardId: string,
  query: string,
  options: FormatOptions
): Promise<void> {
  const board = getBoardById(db, boardId);
  if (!board) {
    exitWithError("Board not found");
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  const cards = searchCards(db, boardId, { q: query });

  if (options.json) {
    console.log(JSON.stringify(cards, null, 2));
    return;
  }

  if (cards.length === 0) {
    console.log("No matching cards found");
    return;
  }

  if (options.quiet) {
    cards.forEach((card) => console.log(formatId(card.id, options)));
    return;
  }

  printTable(
    ["ID", "Title", "Column", "Due Date", "Labels"],
    cards.map((card) => [
      formatId(card.id, options),
      card.title,
      card.column_title,
      formatDate(card.due_date),
      card.labels.map((label) => label.name).join(", "),
    ])
  );
}
