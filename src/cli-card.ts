import { Database } from "bun:sqlite";
import { 
  getAllColumns,
  getCardById,
  createCard,
  updateCard,
  deleteCard,
  getCardDetail,
  getBoardById,
  isBoardMember,
  getBoardLabels,
} from "./src/db";
import type { TaktConfig, FormatOptions } from "./cli-auth";
import { formatId, formatDate, printSuccess, printError } from "./cli-board";

interface CardListItem {
  id: string;
  title: string;
  column_title: string;
  due_date: string | null;
  labels: string[];
}

interface ChecklistItem {
  text: string;
  done: boolean;
}

function parseChecklist(checklistJson: string): ChecklistItem[] {
  try {
    const parsed = JSON.parse(checklistJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => 
      typeof item === "object" && 
      typeof item.text === "string" && 
      typeof item.done === "boolean"
    );
  } catch {
    return [];
  }
}

function formatChecklist(items: ChecklistItem[]): string {
  return JSON.stringify(items);
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
    printError("Board not found");
    process.exit(1);
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    printError("You are not a member of this board");
    process.exit(1);
  }

  const columns = getAllColumns(db, boardId);
  const allLabels = getBoardLabels(db, boardId);
  const labelMap = new Map(allLabels.map(l => [l.id, l.name]));

  const cards: CardListItem[] = [];
  for (const col of columns) {
    if (columnId && col.id !== columnId) continue;
    
    for (const card of col.cards) {
      cards.push({
        id: card.id,
        title: card.title,
        column_title: col.title,
        due_date: card.due_date,
        labels: card.labels.map(l => labelMap.get(l.id) || l.name),
      });
    }
  }

  if (options.json) {
    console.log(JSON.stringify(cards, null, 2));
    return;
  }

  if (options.quiet) {
    cards.forEach(card => console.log(card.id));
    return;
  }

  if (cards.length === 0) {
    console.log("No cards found");
    return;
  }

  const idLength = options.fullIds ? 21 : 8;
  const maxTitleLength = Math.max(...cards.map(c => c.title.length), 5);
  const maxColumnLength = Math.max(...cards.map(c => c.column_title.length), 6);
  const maxLabelsLength = Math.max(...cards.map(c => c.labels.join(", ").length), 6);

  console.log(
    `${"ID".padEnd(idLength)}  ${"Title".padEnd(maxTitleLength)}  ${"Column".padEnd(maxColumnLength)}  ${"Due Date".padEnd(10)}  ${"Labels".padEnd(maxLabelsLength)}`
  );
  console.log("-".repeat(idLength + maxTitleLength + maxColumnLength + maxLabelsLength + 24));

  cards.forEach(card => {
    console.log(
      `${formatId(card.id, options).padEnd(idLength)}  ${card.title.padEnd(maxTitleLength)}  ${card.column_title.padEnd(maxColumnLength)}  ${(card.due_date || "").padEnd(10)}  ${card.labels.join(", ").padEnd(maxLabelsLength)}`
    );
  });
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
    printError("Board not found");
    process.exit(1);
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    printError("You are not a member of this board");
    process.exit(1);
  }

  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    printError("Invalid date format for due date. Use YYYY-MM-DD");
    process.exit(1);
  }

  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    printError("Invalid date format for start date. Use YYYY-MM-DD");
    process.exit(1);
  }

  if (startDate && dueDate && startDate > dueDate) {
    printError("Start date cannot be after due date");
    process.exit(1);
  }

  const card = createCard(db, title, columnId, description || "", dueDate || null, session.userId);
  
  if (!card) {
    printError("Failed to create card. Column may not exist.");
    process.exit(1);
  }

  // Update start date if provided
  if (startDate) {
    updateCard(db, card.id, { startDate });
  }

  if (options.json) {
    console.log(JSON.stringify(card, null, 2));
  } else if (options.quiet) {
    console.log(card.id);
  } else {
    printSuccess(`Card created: ${formatId(card.id, options)}`);
  }
}

export async function showCard(
  db: Database,
  session: TaktConfig,
  cardId: string,
  options: FormatOptions
): Promise<void> {
  const card = getCardById(db, cardId);
  if (!card) {
    printError("Card not found");
    process.exit(1);
  }

  const detail = getCardDetail(db, cardId);
  if (!detail) {
    printError("Card not found");
    process.exit(1);
  }

  if (!isBoardMember(db, detail.board_id, session.userId)) {
    printError("You are not a member of this board");
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(detail, null, 2));
    return;
  }

  const checklist = parseChecklist(card.checklist);
  const checklistTotal = checklist.length;
  const checklistDone = checklist.filter(item => item.done).length;

  console.log(`Title: ${card.title}`);
  console.log(`ID: ${formatId(card.id, options)}`);
  console.log(`Column: ${detail.column_title}`);
  console.log(`Board: ${detail.board_title}`);
  
  if (card.description) {
    console.log(`\nDescription:\n${card.description}`);
  }
  
  if (card.start_date || card.due_date) {
    console.log("\nDates:");
    if (card.start_date) console.log(`  Start: ${card.start_date}`);
    if (card.due_date) console.log(`  Due: ${card.due_date}`);
  }
  
  if (checklist.length > 0) {
    console.log(`\nChecklist (${checklistDone}/${checklistTotal}):`);
    checklist.forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.done ? "x" : " "}] ${item.text}`);
    });
  }
  
  if (detail.labels.length > 0) {
    console.log(`\nLabels:`);
    detail.labels.forEach(label => {
      console.log(`  ${label.name} (${label.color})`);
    });
  }
  
  const recentTimeline = detail.timeline.slice(-10);
  if (recentTimeline.length > 0) {
    console.log("\nRecent Timeline:");
    recentTimeline.forEach(item => {
      const timestamp = new Date(item.timestamp).toISOString().slice(0, 16).replace('T', ' ');
      let line = `  ${timestamp}`;
      
      if (item.type === "activity") {
        line += ` - ${item.action}`;
        if (item.detail) line += `: ${item.detail}`;
        if (item.user_username) line += ` (by ${item.user_username})`;
      } else if (item.type === "comment") {
        line += ` - Comment by ${item.user_username}: ${item.content}`;
      }
      
      console.log(line);
    });
  }
  
  console.log(`\nCreated: ${formatDate(card.created_at)}`);
  console.log(`Updated: ${formatDate(card.updated_at)}`);
}

export async function updateCardCommand(
  db: Database,
  session: TaktConfig,
  cardId: string,
  updates: {
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
  },
  options: FormatOptions
): Promise<void> {
  const existing = getCardById(db, cardId);
  if (!existing) {
    printError("Card not found");
    process.exit(1);
  }

  const detail = getCardDetail(db, cardId);
  if (!detail) {
    printError("Card not found");
    process.exit(1);
  }

  if (!isBoardMember(db, detail.board_id, session.userId)) {
    printError("You are not a member of this board");
    process.exit(1);
  }

  // Validate dates if provided
  if (updates.dueDate !== undefined && updates.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(updates.dueDate)) {
    printError("Invalid date format for due date. Use YYYY-MM-DD");
    process.exit(1);
  }

  if (updates.startDate !== undefined && updates.startDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(updates.startDate)) {
    printError("Invalid date format for start date. Use YYYY-MM-DD");
    process.exit(1);
  }

  // Handle checklist updates
  let newChecklist: string | undefined;
  if (updates.addCheck || updates.toggleCheck !== undefined || updates.removeCheck !== undefined) {
    const items = parseChecklist(existing.checklist);
    
    if (updates.addCheck) {
      items.push({ text: updates.addCheck, done: false });
    }
    
    if (updates.toggleCheck !== undefined) {
      const idx = updates.toggleCheck;
      if (idx < 0 || idx >= items.length) {
        printError(`Checklist index out of range (0-${items.length - 1})`);
        process.exit(1);
      }
      items[idx].done = !items[idx].done;
    }
    
    if (updates.removeCheck !== undefined) {
      const idx = updates.removeCheck;
      if (idx < 0 || idx >= items.length) {
        printError(`Checklist index out of range (0-${items.length - 1})`);
        process.exit(1);
      }
      items.splice(idx, 1);
    }
    
    newChecklist = formatChecklist(items);
  } else if (updates.checklist) {
    // Direct checklist JSON update
    try {
      JSON.parse(updates.checklist);
      newChecklist = updates.checklist;
    } catch {
      printError("Invalid checklist JSON format");
      process.exit(1);
    }
  }

  const updateData: any = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.dueDate !== undefined) updateData.dueDate = updates.dueDate;
  if (updates.startDate !== undefined) updateData.startDate = updates.startDate;
  if (updates.columnId !== undefined) updateData.columnId = updates.columnId;
  if (updates.position !== undefined) updateData.position = updates.position;
  if (newChecklist !== undefined) updateData.checklist = newChecklist;

  const updated = updateCard(db, cardId, updateData);
  
  if (!updated) {
    printError("Failed to update card. Invalid date range or column not found.");
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(updated, null, 2));
  } else if (!options.quiet) {
    printSuccess("Card updated successfully");
  }
}

export async function deleteCardCommand(
  db: Database,
  session: TaktConfig,
  cardId: string,
  skipConfirm: boolean,
  options: FormatOptions
): Promise<void> {
  const card = getCardById(db, cardId);
  if (!card) {
    printError("Card not found");
    process.exit(1);
  }

  const detail = getCardDetail(db, cardId);
  if (!detail) {
    printError("Card not found");
    process.exit(1);
  }

  if (!isBoardMember(db, detail.board_id, session.userId)) {
    printError("You are not a member of this board");
    process.exit(1);
  }

  if (!skipConfirm) {
    const confirmation = prompt(`Are you sure you want to delete the card "${card.title}"? (y/N) `);
    if (confirmation?.toLowerCase() !== 'y') {
      console.log("Deletion cancelled");
      return;
    }
  }

  const success = deleteCard(db, cardId);
  if (!success) {
    printError("Failed to delete card");
    process.exit(1);
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
  const card = getCardById(db, cardId);
  if (!card) {
    printError("Card not found");
    process.exit(1);
  }

  const detail = getCardDetail(db, cardId);
  if (!detail) {
    printError("Card not found");
    process.exit(1);
  }

  if (!isBoardMember(db, detail.board_id, session.userId)) {
    printError("You are not a member of this board");
    process.exit(1);
  }

  const updates: any = { columnId };
  if (position !== undefined) {
    updates.position = position;
  }

  const updated = updateCard(db, cardId, updates);
  
  if (!updated) {
    printError("Failed to move card. Column not found.");
    process.exit(1);
  }

  if (!options.quiet) {
    printSuccess("Card moved successfully");
  }
}