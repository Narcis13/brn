import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";
import {
  createCard,
  deleteCard,
  getAllColumns,
  getBoardById,
  getCardById,
  getCardDetail,
  getColumnById,
  isBoardMember,
  updateCardWithActivity,
} from "./src/db";
import type { TaktConfig } from "./cli-auth";
import {
  confirmOrExit,
  exitWithError,
  formatDate,
  formatDateTime,
  formatId,
  idText,
  isValidDateInput,
  printSuccess,
  printTable,
  type FormatOptions,
} from "./cli-utils";

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

interface CardListRow {
  id: string;
  title: string;
  column_title: string;
  due_date: string | null;
  labels: string[];
}

export interface CardUpdateInput {
  title?: string;
  description?: string;
  dueDate?: string | null;
  startDate?: string | null;
  columnId?: string;
  position?: number;
  checklist?: string;
  addCheck?: string;
  toggleCheck?: number;
  removeCheck?: number;
}

function parseChecklistLenient(value: string): ChecklistItem[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is ChecklistItem =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string" &&
          typeof (item as { text?: unknown }).text === "string" &&
          typeof (item as { checked?: unknown }).checked === "boolean"
      )
      .map((item) => ({
        id: item.id,
        text: item.text,
        checked: item.checked,
      }));
  } catch {
    return [];
  }
}

function parseChecklistStrict(value: string): ChecklistItem[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      exitWithError("Checklist must be a JSON array");
    }

    const items = parsed.map((item) => {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as { id?: unknown }).id !== "string" ||
        typeof (item as { text?: unknown }).text !== "string" ||
        typeof (item as { checked?: unknown }).checked !== "boolean"
      ) {
        exitWithError("Checklist items must have id, text, and checked fields");
      }

      return {
        id: (item as { id: string }).id,
        text: (item as { text: string }).text,
        checked: (item as { checked: boolean }).checked,
      };
    });

    return items;
  } catch (error) {
    if (error instanceof Error && error.message !== "Checklist must be a JSON array") {
      exitWithError("Checklist must be valid JSON");
    }

    throw error;
  }
}

function stringifyChecklist(items: ChecklistItem[]): string {
  return JSON.stringify(items);
}

function ensureCardAccess(db: Database, session: TaktConfig, cardId: string): { boardId: string } {
  const card = getCardById(db, cardId);
  if (!card) {
    exitWithError("Card not found");
  }

  const column = getColumnById(db, card.column_id);
  if (!column) {
    exitWithError("Card not found");
  }

  if (!isBoardMember(db, column.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  return { boardId: column.board_id };
}

function ensureValidDateOrExit(value: string | null | undefined): void {
  if (value === undefined || value === null) {
    return;
  }

  if (!isValidDateInput(value)) {
    exitWithError("Invalid date format. Use YYYY-MM-DD");
  }
}

function formatTimelineDetail(detail: string | null): string {
  if (!detail) {
    return "";
  }

  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>;

    if (typeof parsed["from"] === "string" && typeof parsed["to"] === "string") {
      return `${parsed["from"]} -> ${parsed["to"]}`;
    }

    if (Array.isArray(parsed["fields"])) {
      return (parsed["fields"] as string[]).join(", ");
    }

    if (typeof parsed["name"] === "string") {
      return parsed["name"];
    }

    if (typeof parsed["text"] === "string") {
      return parsed["text"];
    }
  } catch {
    return detail;
  }

  return detail;
}

export async function listCards(
  db: Database,
  session: TaktConfig,
  boardId: string,
  columnId: string | undefined,
  options: FormatOptions
): Promise<void> {
  const board = getBoardById(db, boardId);
  if (!board) {
    exitWithError("Board not found");
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  const cards: CardListRow[] = [];
  getAllColumns(db, boardId).forEach((column) => {
    if (columnId && column.id !== columnId) {
      return;
    }

    column.cards.forEach((card) => {
      cards.push({
        id: card.id,
        title: card.title,
        column_title: column.title,
        due_date: card.due_date,
        labels: card.labels.map((label) => label.name),
      });
    });
  });

  if (options.json) {
    console.log(JSON.stringify(cards, null, 2));
    return;
  }

  if (cards.length === 0) {
    console.log("No cards found");
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
      card.labels.join(", "),
    ])
  );
}

export async function createCardCommand(
  db: Database,
  session: TaktConfig,
  boardId: string,
  columnId: string,
  title: string,
  description: string | undefined,
  dueDate: string | undefined,
  startDate: string | undefined,
  options: FormatOptions
): Promise<void> {
  const board = getBoardById(db, boardId);
  if (!board) {
    exitWithError("Board not found");
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  const column = getColumnById(db, columnId);
  if (!column || column.board_id !== boardId) {
    exitWithError("Column not found");
  }

  ensureValidDateOrExit(dueDate);
  ensureValidDateOrExit(startDate);
  if (startDate && dueDate && startDate > dueDate) {
    exitWithError("Start date cannot be after due date");
  }

  const created = createCard(
    db,
    title,
    columnId,
    description ?? "",
    dueDate ?? null,
    session.userId
  );
  if (!created) {
    exitWithError("Failed to create card");
  }

  const card =
    startDate === undefined
      ? created
      : updateCardWithActivity(
          db,
          created.id,
          boardId,
          {
            startDate,
          },
          session.userId
        );

  if (!card) {
    exitWithError("Failed to create card");
  }

  if (options.json) {
    console.log(JSON.stringify(card, null, 2));
    return;
  }

  if (options.quiet) {
    console.log(formatId(card.id, options));
    return;
  }

  printSuccess(`Card created: ${idText(formatId(card.id, options))}`);
}

export async function showCard(
  db: Database,
  session: TaktConfig,
  cardId: string,
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

  if (!isBoardMember(db, column.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  const board = getBoardById(db, column.board_id);
  const detail = getCardDetail(db, cardId, session.userId);
  if (!detail || !board) {
    exitWithError("Card not found");
  }

  const jsonPayload = {
    ...detail,
    board_id: column.board_id,
    board_title: board.title,
    column_title: column.title,
  };

  if (options.json) {
    console.log(JSON.stringify(jsonPayload, null, 2));
    return;
  }

  const checklist = parseChecklistLenient(detail.checklist);

  console.log(`Title: ${detail.title}`);
  console.log(`ID: ${idText(formatId(detail.id, options))}`);
  console.log(`Board: ${board.title}`);
  console.log(`Column: ${column.title}`);

  if (detail.description) {
    console.log("");
    console.log(detail.description);
  }

  if (detail.start_date || detail.due_date) {
    console.log("");
    console.log("Dates:");
    if (detail.start_date) {
      console.log(`  Start: ${formatDate(detail.start_date)}`);
    }
    if (detail.due_date) {
      console.log(`  Due: ${formatDate(detail.due_date)}`);
    }
  }

  console.log("");
  console.log(`Checklist: ${detail.checklist_done}/${detail.checklist_total}`);
  if (checklist.length > 0) {
    checklist.forEach((item, index) => {
      console.log(`  ${index}. [${item.checked ? "x" : " "}] ${item.text}`);
    });
  }

  if (detail.labels.length > 0) {
    console.log("");
    console.log(`Labels: ${detail.labels.map((label) => `${label.name} (${label.color})`).join(", ")}`);
  }

  if (detail.timeline.length > 0) {
    console.log("");
    console.log("Recent timeline:");
    detail.timeline.slice(0, 10).forEach((item) => {
      if (item.type === "comment") {
        console.log(`  ${formatDateTime(item.created_at)}  ${item.username}: ${item.content}`);
        return;
      }

      const detailText = formatTimelineDetail(item.detail);
      const suffix = detailText ? ` (${detailText})` : "";
      const actor = item.username ? ` by ${item.username}` : "";
      console.log(`  ${formatDateTime(item.timestamp)}  ${item.action}${suffix}${actor}`);
    });
  }
}

export async function updateCardCommand(
  db: Database,
  session: TaktConfig,
  cardId: string,
  updates: CardUpdateInput,
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

  if (!isBoardMember(db, column.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  ensureValidDateOrExit(updates.dueDate);
  ensureValidDateOrExit(updates.startDate);

  const existingChecklist = parseChecklistLenient(card.checklist);
  let nextChecklist = updates.checklist;

  if (updates.checklist !== undefined) {
    nextChecklist = stringifyChecklist(parseChecklistStrict(updates.checklist));
  }

  if (
    updates.addCheck !== undefined ||
    updates.toggleCheck !== undefined ||
    updates.removeCheck !== undefined
  ) {
    const checklistItems = [...existingChecklist];

    if (updates.addCheck !== undefined) {
      checklistItems.push({
        id: nanoid(),
        text: updates.addCheck,
        checked: false,
      });
    }

    if (updates.toggleCheck !== undefined) {
      const target = checklistItems[updates.toggleCheck];
      if (!target) {
        exitWithError(`Checklist index out of range (0-${Math.max(checklistItems.length - 1, 0)})`);
      }
      target.checked = !target.checked;
    }

    if (updates.removeCheck !== undefined) {
      if (!checklistItems[updates.removeCheck]) {
        exitWithError(`Checklist index out of range (0-${Math.max(checklistItems.length - 1, 0)})`);
      }
      checklistItems.splice(updates.removeCheck, 1);
    }

    nextChecklist = stringifyChecklist(checklistItems);
  }

  if (updates.columnId) {
    const nextColumn = getColumnById(db, updates.columnId);
    if (!nextColumn || nextColumn.board_id !== column.board_id) {
      exitWithError("Column not found");
    }
  }

  const dueDate = updates.dueDate !== undefined ? updates.dueDate : card.due_date;
  const startDate = updates.startDate !== undefined ? updates.startDate : card.start_date;
  if (dueDate && startDate && startDate > dueDate) {
    exitWithError("Start date cannot be after due date");
  }

  const payload: Parameters<typeof updateCardWithActivity>[3] = {};
  if (updates.title !== undefined) {
    payload.title = updates.title;
  }
  if (updates.description !== undefined) {
    payload.description = updates.description;
  }
  if (updates.dueDate !== undefined) {
    payload.dueDate = updates.dueDate;
  }
  if (updates.startDate !== undefined) {
    payload.startDate = updates.startDate;
  }
  if (updates.columnId !== undefined) {
    payload.columnId = updates.columnId;
  }
  if (updates.position !== undefined) {
    payload.position = updates.position;
  }
  if (nextChecklist !== undefined) {
    payload.checklist = nextChecklist;
  }

  const updated = updateCardWithActivity(db, cardId, column.board_id, payload, session.userId);
  if (!updated) {
    exitWithError("Failed to update card");
  }

  if (options.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  if (!options.quiet) {
    printSuccess("Card updated successfully");
  }
}

export async function deleteCardCommand(
  db: Database,
  session: TaktConfig,
  cardId: string,
  options: FormatOptions
): Promise<void> {
  ensureCardAccess(db, session, cardId);

  const card = getCardById(db, cardId);
  if (!card) {
    exitWithError("Card not found");
  }

  await confirmOrExit(options, `Delete card "${card.title}"?`);

  const deleted = deleteCard(db, cardId);
  if (!deleted) {
    exitWithError("Failed to delete card");
  }

  if (!options.quiet) {
    printSuccess("Card deleted successfully");
  }
}

export async function moveCard(
  db: Database,
  session: TaktConfig,
  cardId: string,
  columnId: string,
  position: number | undefined,
  options: FormatOptions
): Promise<void> {
  const { boardId } = ensureCardAccess(db, session, cardId);

  const nextColumn = getColumnById(db, columnId);
  if (!nextColumn || nextColumn.board_id !== boardId) {
    exitWithError("Column not found");
  }

  const payload: Parameters<typeof updateCardWithActivity>[3] = {
    columnId,
  };
  if (position !== undefined) {
    payload.position = position;
  }

  const updated = updateCardWithActivity(db, cardId, boardId, payload, session.userId);
  if (!updated) {
    exitWithError("Failed to move card");
  }

  if (options.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  if (!options.quiet) {
    printSuccess("Card moved successfully");
  }
}
