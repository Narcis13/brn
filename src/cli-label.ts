import type { Database } from "bun:sqlite";
import {
  assignLabelToCard,
  createActivity,
  createLabel as createLabelRecord,
  deleteLabel as deleteLabelRecord,
  getBoardById,
  getBoardLabels,
  getCardById,
  getColumnById,
  getLabelById,
  isBoardMember,
  removeLabelFromCard,
  updateLabel as updateLabelRecord,
} from "./src/db";
import type { TaktConfig } from "./cli-auth";
import {
  exitWithError,
  formatId,
  printSuccess,
  printTable,
  type FormatOptions,
} from "./cli-utils";

function ensureHexColor(color: string): void {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    exitWithError("Color must be a valid hex color (for example, #e74c3c)");
  }
}

function ensureBoardMember(db: Database, session: TaktConfig, boardId: string): void {
  const board = getBoardById(db, boardId);
  if (!board) {
    exitWithError("Board not found");
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("You are not a member of this board");
  }
}

export async function listLabels(
  db: Database,
  session: TaktConfig,
  boardId: string,
  options: FormatOptions
): Promise<void> {
  ensureBoardMember(db, session, boardId);
  const labels = getBoardLabels(db, boardId);

  if (options.json) {
    console.log(JSON.stringify(labels, null, 2));
    return;
  }

  if (labels.length === 0) {
    console.log("No labels found");
    return;
  }

  if (options.quiet) {
    labels.forEach((label) => console.log(formatId(label.id, options)));
    return;
  }

  printTable(
    ["ID", "Name", "Color"],
    labels.map((label) => [formatId(label.id, options), label.name, label.color])
  );
}

export async function createLabelCommand(
  db: Database,
  session: TaktConfig,
  boardId: string,
  name: string,
  color: string,
  options: FormatOptions
): Promise<void> {
  ensureBoardMember(db, session, boardId);
  ensureHexColor(color);

  const label = createLabelRecord(db, boardId, name, color);

  if (options.json) {
    console.log(JSON.stringify(label, null, 2));
    return;
  }

  if (options.quiet) {
    console.log(formatId(label.id, options));
    return;
  }

  printSuccess(`Label created: ${formatId(label.id, options)}`);
}

export async function updateLabelCommand(
  db: Database,
  session: TaktConfig,
  labelId: string,
  updates: { name?: string; color?: string },
  options: FormatOptions
): Promise<void> {
  const label = getLabelById(db, labelId);
  if (!label) {
    exitWithError("Label not found");
  }

  ensureBoardMember(db, session, label.board_id);
  if (updates.color !== undefined) {
    ensureHexColor(updates.color);
  }

  const updated = updateLabelRecord(db, labelId, updates);
  if (!updated) {
    exitWithError("Label not found");
  }

  if (options.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  if (!options.quiet) {
    printSuccess("Label updated successfully");
  }
}

export async function deleteLabelCommand(
  db: Database,
  session: TaktConfig,
  labelId: string,
  options: FormatOptions
): Promise<void> {
  const label = getLabelById(db, labelId);
  if (!label) {
    exitWithError("Label not found");
  }

  ensureBoardMember(db, session, label.board_id);
  const deleted = deleteLabelRecord(db, labelId);
  if (!deleted) {
    exitWithError("Failed to delete label");
  }

  if (!options.quiet) {
    printSuccess("Label deleted successfully");
  }
}

export async function assignLabelCommand(
  db: Database,
  session: TaktConfig,
  cardId: string,
  labelId: string,
  options: FormatOptions
): Promise<void> {
  const card = getCardById(db, cardId);
  if (!card) {
    exitWithError("Card not found");
  }

  const column = getColumnById(db, card.column_id);
  if (!column) {
    exitWithError("Card not found");
  }

  const label = getLabelById(db, labelId);
  if (!label || label.board_id !== column.board_id) {
    exitWithError("Label not found");
  }

  ensureBoardMember(db, session, column.board_id);

  const assigned = assignLabelToCard(db, cardId, labelId);
  if (!assigned) {
    exitWithError("Label already assigned to card");
  }

  createActivity(
    db,
    cardId,
    column.board_id,
    "label_added",
    { name: label.name, color: label.color },
    session.userId
  );

  if (!options.quiet) {
    printSuccess("Label assigned successfully");
  }
}

export async function unassignLabelCommand(
  db: Database,
  session: TaktConfig,
  cardId: string,
  labelId: string,
  options: FormatOptions
): Promise<void> {
  const card = getCardById(db, cardId);
  if (!card) {
    exitWithError("Card not found");
  }

  const column = getColumnById(db, card.column_id);
  if (!column) {
    exitWithError("Card not found");
  }

  ensureBoardMember(db, session, column.board_id);

  const label = getLabelById(db, labelId);
  const removed = removeLabelFromCard(db, cardId, labelId);
  if (!removed) {
    exitWithError("Label not assigned to card");
  }

  createActivity(
    db,
    cardId,
    column.board_id,
    "label_removed",
    { name: label?.name ?? "unknown", color: label?.color ?? "" },
    session.userId
  );

  if (!options.quiet) {
    printSuccess("Label unassigned successfully");
  }
}
