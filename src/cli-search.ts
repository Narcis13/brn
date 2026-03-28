import type { Database } from "bun:sqlite";
import { getBoardById, isBoardMember, searchCards, searchBoardArtifacts } from "./src/db";
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
  const boardArtifacts = searchBoardArtifacts(db, boardId, query);

  if (options.json) {
    console.log(JSON.stringify({ cards, board_artifacts: boardArtifacts }, null, 2));
    return;
  }

  if (cards.length === 0 && boardArtifacts.length === 0) {
    console.log("No matching cards or artifacts found");
    return;
  }

  if (options.quiet) {
    cards.forEach((card) => console.log(formatId(card.id, options)));
    return;
  }

  // Display card matches
  if (cards.length > 0) {
    console.log("Card Matches:");
    const rows = [];
    for (const card of cards) {
      // Add main card row
      rows.push([
        formatId(card.id, options),
        card.title,
        card.column_title,
        formatDate(card.due_date),
        card.labels.map((label) => label.name).join(", "),
      ]);
      
      // If there's an artifact match, add it as a sub-row
      if (card.artifact_match) {
        rows.push([
          "",
        `  └─ Artifact: ${card.artifact_match.filename}`,
          card.artifact_match.match_context,
          "",
          "",
        ]);
      }
    }
    
    printTable(
      ["ID", "Title", "Column/Match", "Due Date", "Labels"],
      rows
    );
  }
  
  // Display board artifact matches
  if (boardArtifacts.length > 0) {
    if (cards.length > 0) console.log(); // Add spacing
    console.log("Board Artifact Matches:");
    printTable(
      ["Filename", "Type", "Match Context"],
      boardArtifacts.map((artifact) => [
        artifact.filename,
        artifact.filetype,
        artifact.match_context,
      ])
    );
  }
}
