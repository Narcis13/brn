import type { Database } from "bun:sqlite";
import type { Board } from "../types";
import * as boardRepo from "./board.repo";

export function validateBoardName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new Error("Board name is required");
  }
  
  if (name.length > 100) {
    throw new Error("Board name must be 100 characters or less");
  }
}

export async function validateBoardOwnership(
  db: Database,
  boardId: string,
  userId: string
): Promise<boolean> {
  const board = await boardRepo.findBoardById(db, boardId);
  return board !== null && board.userId === userId;
}

export async function createBoard(
  db: Database,
  params: { name: string; userId: string }
): Promise<Board> {
  validateBoardName(params.name);
  
  return boardRepo.createBoard(db, {
    name: params.name.trim(),
    userId: params.userId
  });
}

export async function getBoardsByUserId(
  db: Database,
  userId: string
): Promise<Board[]> {
  return boardRepo.findBoardsByUserId(db, userId);
}

export async function getBoardById(
  db: Database,
  boardId: string,
  userId: string
): Promise<Board | null> {
  const board = await boardRepo.findBoardById(db, boardId);
  
  if (!board || board.userId !== userId) {
    return null;
  }
  
  return board;
}

export async function updateBoard(
  db: Database,
  boardId: string,
  userId: string,
  updates: { name: string }
): Promise<Board> {
  validateBoardName(updates.name);
  
  const isOwner = await validateBoardOwnership(db, boardId, userId);
  if (!isOwner) {
    throw new Error("Board not found");
  }
  
  return boardRepo.updateBoard(db, boardId, {
    name: updates.name.trim()
  });
}

export async function deleteBoard(
  db: Database,
  boardId: string,
  userId: string
): Promise<void> {
  const isOwner = await validateBoardOwnership(db, boardId, userId);
  if (!isOwner) {
    throw new Error("Board not found");
  }
  
  return boardRepo.deleteBoard(db, boardId);
}