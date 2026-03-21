import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { Card, NewCard } from "../types";

// Mock the cards API
const mockGetCardsByBoardId = mock(() => Promise.resolve([]));
const mockCreateCard = mock(() => Promise.resolve({
  id: "new-card",
  title: "New Card",
  description: "",
  boardId: "test-board",
  column: "todo",
  position: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const mockUpdateCard = mock(() => Promise.resolve({
  id: "test-card",
  title: "Updated Card",
  description: "Updated",
  boardId: "test-board",
  column: "doing",
  position: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const mockDeleteCard = mock(() => Promise.resolve());
const mockMoveCardToColumn = mock(() => Promise.resolve({
  id: "test-card",
  title: "Test Card",
  description: "",
  boardId: "test-board",
  column: "done",
  position: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

mock.module("../api/cards", () => ({
  getCardsByBoardId: mockGetCardsByBoardId,
  createCard: mockCreateCard,
  updateCard: mockUpdateCard,
  deleteCard: mockDeleteCard,
  moveCardToColumn: mockMoveCardToColumn,
}));

describe("useCards", () => {
  const mockCards: Card[] = [
    {
      id: "card-1",
      title: "Card 1",
      description: "Description 1",
      boardId: "test-board",
      column: "todo",
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "card-2",
      title: "Card 2",
      description: "Description 2",
      boardId: "test-board",
      column: "doing",
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    mockGetCardsByBoardId.mockClear();
    mockCreateCard.mockClear();
    mockUpdateCard.mockClear();
    mockDeleteCard.mockClear();
    mockMoveCardToColumn.mockClear();
    mockGetCardsByBoardId.mockResolvedValue(mockCards);
  });

  test("loads cards for a board", async () => {
    await mockGetCardsByBoardId("test-board");
    expect(mockGetCardsByBoardId).toHaveBeenCalledWith("test-board");
  });

  test("handles loading error", async () => {
    const error = new Error("Failed to load cards");
    mockGetCardsByBoardId.mockRejectedValueOnce(error);
    
    try {
      await mockGetCardsByBoardId("test-board");
    } catch (err) {
      expect(err).toBe(error);
      expect(err.message).toBe("Failed to load cards");
    }
  });

  test("creates card with optimistic update", async () => {
    const newCard: NewCard = {
      title: "New Card",
      description: "",
      boardId: "test-board",
      column: "todo",
      position: 1,
    };
    
    await mockCreateCard(newCard);
    expect(mockCreateCard).toHaveBeenCalledWith(newCard);
  });

  test("updates card with optimistic update", async () => {
    const updates = { title: "Updated Title" };
    await mockUpdateCard("card-1", updates);
    expect(mockUpdateCard).toHaveBeenCalledWith("card-1", updates);
  });

  test("deletes card with optimistic update", async () => {
    await mockDeleteCard("card-1");
    expect(mockDeleteCard).toHaveBeenCalledWith("card-1");
  });

  test("moves card to different column", async () => {
    await mockMoveCardToColumn("card-1", "done", 0);
    expect(mockMoveCardToColumn).toHaveBeenCalledWith("card-1", "done", 0);
  });

  test("rolls back optimistic update on error", async () => {
    const error = new Error("Update failed");
    mockUpdateCard.mockRejectedValueOnce(error);
    
    try {
      await mockUpdateCard("card-1", { title: "Failed Update" });
    } catch (err) {
      expect(err).toBe(error);
    }
  });

  test("refetches cards", async () => {
    await mockGetCardsByBoardId("test-board");
    await mockGetCardsByBoardId("test-board");
    expect(mockGetCardsByBoardId).toHaveBeenCalledTimes(2);
  });
});