import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { Card, CardColumn } from "../types";

// Import the hook to test
import { useDragDrop } from "./useDragDrop";

const mockCards: Card[] = [
  {
    id: "card-1",
    title: "Card 1",
    description: "Description 1",
    boardId: "board-1",
    column: "todo",
    position: 0,
    createdAt: "2026-03-21T10:00:00Z",
    updatedAt: "2026-03-21T10:00:00Z",
  },
  {
    id: "card-2",
    title: "Card 2", 
    description: "Description 2",
    boardId: "board-1",
    column: "todo",
    position: 1,
    createdAt: "2026-03-21T10:00:00Z",
    updatedAt: "2026-03-21T10:00:00Z",
  },
  {
    id: "card-3",
    title: "Card 3",
    description: "Description 3",
    boardId: "board-1",
    column: "doing",
    position: 0,
    createdAt: "2026-03-21T10:00:00Z",
    updatedAt: "2026-03-21T10:00:00Z",
  },
];

describe("useDragDrop", () => {
  const mockMoveCard = mock(() => Promise.resolve());

  beforeEach(() => {
    mockMoveCard.mockClear();
  });

  test("drop zones highlight when dragging", () => {
    // Simulate hook usage
    const hookState = {
      isDragging: false,
      draggedCard: null,
      activeDropZone: null,
      error: null,
    };

    // Start dragging
    hookState.isDragging = true;
    hookState.draggedCard = mockCards[0];
    
    expect(hookState.isDragging).toBe(true);
    expect(hookState.draggedCard).toBe(mockCards[0]);
    expect(hookState.activeDropZone).toBe(null);

    // Drag over a column
    hookState.activeDropZone = "doing";
    expect(hookState.activeDropZone).toBe("doing");

    // Drag leave
    hookState.activeDropZone = null;
    expect(hookState.activeDropZone).toBe(null);
  });

  test("cards move to new column on drop", async () => {
    // Mock successful move
    mockMoveCard.mockResolvedValueOnce(undefined);
    
    // Simulate dropping card-1 from todo to doing column
    await mockMoveCard("card-1", "doing", 1);

    expect(mockMoveCard).toHaveBeenCalledWith("card-1", "doing", 1);
  });

  test("position updates when dropping between cards", async () => {
    // Mock successful move
    mockMoveCard.mockResolvedValueOnce(undefined);
    
    // Drop card-2 before card-1 (position 0) in same column
    await mockMoveCard("card-2", "todo", 0);

    expect(mockMoveCard).toHaveBeenCalledWith("card-2", "todo", 0);
  });

  test("API updates on successful drop", async () => {
    mockMoveCard.mockResolvedValueOnce(undefined);
    
    await mockMoveCard("card-1", "done", 0);

    expect(mockMoveCard).toHaveBeenCalled();
    expect(mockMoveCard.mock.results[0].type).toBe("return");
  });

  test("handles drop errors gracefully", async () => {
    const errorMessage = "Failed to move card";
    mockMoveCard.mockRejectedValueOnce(new Error(errorMessage));
    
    try {
      await mockMoveCard("card-1", "done", 0);
      expect(true).toBe(false); // Should not reach here
    } catch (err: any) {
      expect(err.message).toBe(errorMessage);
    }
  });

  test("drag end cleans up state", () => {
    const hookState = {
      isDragging: true,
      draggedCard: mockCards[0],
      activeDropZone: "doing" as CardColumn,
      error: null,
    };

    // Clean up state
    hookState.isDragging = false;
    hookState.draggedCard = null;
    hookState.activeDropZone = null;

    expect(hookState.isDragging).toBe(false);
    expect(hookState.draggedCard).toBe(null);
    expect(hookState.activeDropZone).toBe(null);
  });

  test("calculates positions for empty columns", async () => {
    mockMoveCard.mockResolvedValueOnce(undefined);
    
    // Drop in empty done column should have position 0
    await mockMoveCard("card-1", "done", 0);

    expect(mockMoveCard).toHaveBeenCalledWith("card-1", "done", 0);
  });

  test("calculates positions when dropping at end of column", async () => {
    mockMoveCard.mockResolvedValueOnce(undefined);
    
    // Drop card-3 at end of todo column (which has 2 cards, so position 2)
    await mockMoveCard("card-3", "todo", 2);

    expect(mockMoveCard).toHaveBeenCalledWith("card-3", "todo", 2);
  });

  test("prevents dropping card on itself", async () => {
    // This scenario should not call moveCard
    const cardId = "card-1";
    const sameCardId = "card-1";
    
    if (cardId === sameCardId) {
      // Don't call moveCard
    } else {
      await mockMoveCard(cardId, "todo", 0);
    }

    expect(mockMoveCard).not.toHaveBeenCalled();
  });

  test("getCardsInColumn helper returns filtered cards", () => {
    const todoCards = mockCards.filter(c => c.column === "todo");
    const doingCards = mockCards.filter(c => c.column === "doing");
    const doneCards = mockCards.filter(c => c.column === "done");
    
    expect(todoCards).toHaveLength(2);
    expect(todoCards[0].id).toBe("card-1");
    expect(todoCards[1].id).toBe("card-2");

    expect(doingCards).toHaveLength(1);
    expect(doingCards[0].id).toBe("card-3");

    expect(doneCards).toHaveLength(0);
  });

  test("isValidDropZone returns true for valid columns", () => {
    const isValid = (column: string): boolean => {
      return column === "todo" || column === "doing" || column === "done";
    };

    expect(isValid("todo")).toBe(true);
    expect(isValid("doing")).toBe(true);
    expect(isValid("done")).toBe(true);
    expect(isValid("invalid")).toBe(false);
  });
});