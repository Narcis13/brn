import type { Database } from "bun:sqlite";
import {
  createComment,
  deleteComment,
  getCardById,
  getColumnById,
  getCommentById,
  isBoardMember,
  updateComment,
} from "./src/db";
import type { TaktConfig } from "./cli-auth";
import {
  exitWithError,
  formatId,
  printSuccess,
  type FormatOptions,
} from "./cli-utils";

function ensureCommentContent(content: string): void {
  if (!content.trim()) {
    exitWithError("Comment content cannot be empty");
  }

  if (content.length > 5000) {
    exitWithError("Comment content must be 5000 characters or less");
  }
}

function ensureCardMember(
  db: Database,
  session: TaktConfig,
  cardId: string
): { boardId: string } {
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

export async function addCommentCommand(
  db: Database,
  session: TaktConfig,
  cardId: string,
  content: string,
  options: FormatOptions
): Promise<void> {
  const { boardId } = ensureCardMember(db, session, cardId);
  ensureCommentContent(content);

  const comment = createComment(db, cardId, boardId, session.userId, content.trim());

  if (options.json) {
    console.log(JSON.stringify(comment, null, 2));
    return;
  }

  if (options.quiet) {
    console.log(formatId(comment.id, options));
    return;
  }

  printSuccess(`Comment added: ${formatId(comment.id, options)}`);
}

export async function editCommentCommand(
  db: Database,
  session: TaktConfig,
  commentId: string,
  content: string,
  options: FormatOptions
): Promise<void> {
  const comment = getCommentById(db, commentId);
  if (!comment) {
    exitWithError("Comment not found");
  }

  if (!isBoardMember(db, comment.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  if (comment.user_id !== session.userId) {
    exitWithError("You can only edit your own comments");
  }

  ensureCommentContent(content);
  const updated = updateComment(db, commentId, content.trim());
  if (!updated) {
    exitWithError("Comment not found");
  }

  if (options.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  if (!options.quiet) {
    printSuccess("Comment updated successfully");
  }
}

export async function deleteCommentCommand(
  db: Database,
  session: TaktConfig,
  commentId: string,
  options: FormatOptions
): Promise<void> {
  const comment = getCommentById(db, commentId);
  if (!comment) {
    exitWithError("Comment not found");
  }

  if (!isBoardMember(db, comment.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  if (comment.user_id !== session.userId) {
    exitWithError("You can only delete your own comments");
  }

  const deleted = deleteComment(db, commentId);
  if (!deleted) {
    exitWithError("Failed to delete comment");
  }

  if (!options.quiet) {
    printSuccess("Comment deleted successfully");
  }
}
