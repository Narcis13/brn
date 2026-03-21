import { describe, test, expect } from "bun:test";
import { 
  calculateNewPosition,
  getCardsForColumn,
  sortCardsByPosition,
  updateCardPositions,
  isValidColumn,
} from "./dragHelpers";
import type { Card, CardColumn } from "../types";

const mockCards: Card[] = [
  {
    id: "card-1",
    title: "Card 1",
    description: "",
    boardId: "board-1",
    column: "todo",
    position: 0,
    createdAt: "2026-03-21T10:00:00Z",
    updatedAt: "2026-03-21T10:00:00Z",
  },
  {
    id: "card-2",
    title: "Card 2",
    description: "",
    boardId: "board-1",
    column: "todo",
    position: 1,
    createdAt: "2026-03-21T10:00:00Z",
    updatedAt: "2026-03-21T10:00:00Z",
  },
  {
    id: "card-3",
    title: "Card 3",
    description: "",
    boardId: "board-1",
    column: "todo",
    position: 2,
    createdAt: "2026-03-21T10:00:00Z",
    updatedAt: "2026-03-21T10:00:00Z",
  },
  {
    id: "card-4",
    title: "Card 4",
    description: "",
    boardId: "board-1",
    column: "doing",
    position: 0,
    createdAt: "2026-03-21T10:00:00Z",
    updatedAt: "2026-03-21T10:00:00Z",
  },
];

describe("dragHelpers", () => {
  describe("calculateNewPosition", () => {
    test("returns 0 for empty column", () => {
      const position = calculateNewPosition([], null);
      expect(position).toBe(0);
    });

    test("returns next position when dropping at end", () => {
      const todoCards = mockCards.filter(c => c.column === "todo");
      const position = calculateNewPosition(todoCards, null);
      expect(position).toBe(3);
    });

    test("returns target position when dropping before a card", () => {
      const todoCards = mockCards.filter(c => c.column === "todo");
      const position = calculateNewPosition(todoCards, mockCards[1]); // Drop before card-2
      expect(position).toBe(1);
    });

    test("handles dropping at position 0", () => {
      const todoCards = mockCards.filter(c => c.column === "todo");
      const position = calculateNewPosition(todoCards, mockCards[0]); // Drop before card-1
      expect(position).toBe(0);
    });
  });

  describe("getCardsForColumn", () => {
    test("filters cards by column", () => {
      const todoCards = getCardsForColumn(mockCards, "todo");
      expect(todoCards).toHaveLength(3);
      expect(todoCards.every(c => c.column === "todo")).toBe(true);

      const doingCards = getCardsForColumn(mockCards, "doing");
      expect(doingCards).toHaveLength(1);
      expect(doingCards[0].column).toBe("doing");

      const doneCards = getCardsForColumn(mockCards, "done");
      expect(doneCards).toHaveLength(0);
    });
  });

  describe("sortCardsByPosition", () => {
    test("sorts cards by position ascending", () => {
      const unsorted = [mockCards[2], mockCards[0], mockCards[1]];
      const sorted = sortCardsByPosition(unsorted);
      
      expect(sorted[0].position).toBe(0);
      expect(sorted[1].position).toBe(1);
      expect(sorted[2].position).toBe(2);
    });

    test("handles empty array", () => {
      const sorted = sortCardsByPosition([]);
      expect(sorted).toEqual([]);
    });

    test("does not mutate original array", () => {
      const original = [...mockCards];
      const sorted = sortCardsByPosition(original);
      
      expect(sorted).not.toBe(original);
      expect(original).toEqual(mockCards);
    });
  });

  describe("updateCardPositions", () => {
    test("updates positions after card removal", () => {
      const cards = [
        { ...mockCards[0] },
        { ...mockCards[1] },
        { ...mockCards[2] },
      ];

      const updated = updateCardPositions(cards, 1); // Remove card at position 1
      
      expect(updated[0].position).toBe(0); // card-1 stays at 0
      expect(updated[1].position).toBe(1); // card-3 moves from 2 to 1
      expect(updated).toHaveLength(2);
    });

    test("updates positions after card insertion", () => {
      const cards = [
        { ...mockCards[0] },
        { ...mockCards[1] },
      ];

      const updated = updateCardPositions(cards, 1, true); // Insert at position 1
      
      expect(updated[0].position).toBe(0); // card-1 stays at 0
      expect(updated[1].position).toBe(2); // card-2 moves from 1 to 2
    });

    test("handles edge case of position 0", () => {
      const cards = [
        { ...mockCards[0] },
        { ...mockCards[1] },
      ];

      const updated = updateCardPositions(cards, 0, true);
      
      expect(updated[0].position).toBe(1); // card-1 moves from 0 to 1
      expect(updated[1].position).toBe(2); // card-2 moves from 1 to 2
    });

    test("handles removal at end of list", () => {
      const cards = [
        { ...mockCards[0] },
        { ...mockCards[1] },
        { ...mockCards[2] },
      ];

      const updated = updateCardPositions(cards, 2);
      
      expect(updated).toHaveLength(2);
      expect(updated[0].position).toBe(0);
      expect(updated[1].position).toBe(1);
    });
  });

  describe("isValidColumn", () => {
    test("validates column names", () => {
      expect(isValidColumn("todo")).toBe(true);
      expect(isValidColumn("doing")).toBe(true);
      expect(isValidColumn("done")).toBe(true);
      expect(isValidColumn("invalid")).toBe(false);
      expect(isValidColumn("")).toBe(false);
      expect(isValidColumn(null as any)).toBe(false);
      expect(isValidColumn(undefined as any)).toBe(false);
    });
  });
});