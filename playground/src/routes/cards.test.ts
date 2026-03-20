import { describe, test, expect, beforeEach, vi, mock } from "bun:test";
import { Hono } from "hono";
import type { Card, AuthContext } from "../types";
import { cardRoutes } from "./cards";
import { boardRoutes } from "./boards";
import { generateToken } from "../auth/jwt";

const mockAuthContext: AuthContext = {
  userId: "user123",
  email: "test@example.com",
};

// Mock functions for board repo (used by card.service for ownership validation)
const mockFindBoardById = vi.fn();

// Mock functions for card repo
const mockCreateCard = vi.fn();
const mockFindCardsByBoardAndColumn = vi.fn();
const mockFindCardsByBoardId = vi.fn();
const mockFindCardById = vi.fn();
const mockUpdateCard = vi.fn();

// Mock getDb
const mockGetDb = vi.fn(() => "mock-db-instance");

// Mock service functions
const mockServiceCreateCard = vi.fn();
const mockServiceUpdateCard = vi.fn();
const mockServiceMoveCard = vi.fn();
const mockServiceGetCardById = vi.fn();
const mockServiceGetCardsByBoard = vi.fn();

mock.module("../boards/board.repo", () => ({
  findBoardById: mockFindBoardById,
}));

mock.module("../cards/card.repo", () => ({
  createCard: mockCreateCard,
  findCardsByBoardAndColumn: mockFindCardsByBoardAndColumn,
  findCardsByBoardId: mockFindCardsByBoardId,
  findCardById: mockFindCardById,
  updateCard: mockUpdateCard,
}));

mock.module("../cards/card.service", () => ({
  createCard: mockServiceCreateCard,
  updateCard: mockServiceUpdateCard,
  moveCard: mockServiceMoveCard,
  getCardById: mockServiceGetCardById,
  getCardsByBoard: mockServiceGetCardsByBoard,
}));

mock.module("../db", () => ({
  getDb: mockGetDb,
}));

describe("Card Routes", () => {
  let app: Hono;
  let validToken: string;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret-key-for-testing-only";

    vi.clearAllMocks();
    app = new Hono();
    app.route("/api/cards", cardRoutes);
    app.route("/api/boards", boardRoutes);

    validToken = generateToken({
      userId: mockAuthContext.userId,
      email: mockAuthContext.email,
    });
  });

  describe("POST /api/cards", () => {
    test("creates card with valid input", async () => {
      const newCard: Card = {
        id: "card123",
        title: "My Card",
        boardId: "board123",
        column: "todo",
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockServiceCreateCard.mockResolvedValue(newCard);

      const res = await app.request("/api/cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          title: "My Card",
          boardId: "board123",
          column: "todo",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toEqual(newCard);
    });

    test("returns 404 for non-existent board", async () => {
      mockServiceCreateCard.mockRejectedValue(new Error("Board not found"));

      const res = await app.request("/api/cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          title: "Orphan Card",
          boardId: "nonexistent-board",
          column: "todo",
        }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Board not found");
    });

    test("returns 403 for board not owned by user", async () => {
      mockServiceCreateCard.mockRejectedValue(new Error("Not authorized"));

      const res = await app.request("/api/cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          title: "Unauthorized Card",
          boardId: "board123",
          column: "todo",
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Not authorized");
    });

    test("returns 401 without auth token", async () => {
      const res = await app.request("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "No Auth Card",
          boardId: "board123",
          column: "todo",
        }),
      });

      expect(res.status).toBe(401);
    });

    test("returns 400 when title is missing", async () => {
      mockServiceCreateCard.mockRejectedValue(new Error("Card title is required"));

      const res = await app.request("/api/cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          title: "",
          boardId: "board123",
          column: "todo",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Card title is required");
    });

    test("defaults column to todo when not provided", async () => {
      const newCard: Card = {
        id: "card456",
        title: "Default Column Card",
        boardId: "board123",
        column: "todo",
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockServiceCreateCard.mockResolvedValue(newCard);

      const res = await app.request("/api/cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          title: "Default Column Card",
          boardId: "board123",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.column).toBe("todo");
    });
  });

  describe("GET /api/boards/:boardId/cards", () => {
    test("returns cards for owned board", async () => {
      const cards: Card[] = [
        {
          id: "card1",
          title: "First Card",
          boardId: "board123",
          column: "todo",
          position: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "card2",
          title: "Second Card",
          boardId: "board123",
          column: "todo",
          position: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockServiceGetCardsByBoard.mockResolvedValue(cards);

      const res = await app.request("/api/boards/board123/cards", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(cards);
    });

    test("returns empty array for board with no cards", async () => {
      mockServiceGetCardsByBoard.mockResolvedValue([]);

      const res = await app.request("/api/boards/board123/cards", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });

    test("returns 403 for unowned board", async () => {
      mockServiceGetCardsByBoard.mockRejectedValue(new Error("Not authorized"));

      const res = await app.request("/api/boards/board123/cards", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Not authorized");
    });

    test("returns cards in position order within columns", async () => {
      // Return cards in sorted order since the service layer is responsible for sorting
      const cards: Card[] = [
        {
          id: "card2",
          title: "Todo First",
          boardId: "board123",
          column: "todo",
          position: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "card1",
          title: "Todo Second",
          boardId: "board123",
          column: "todo",
          position: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "card3",
          title: "Done Card",
          boardId: "board123",
          column: "done",
          position: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockServiceGetCardsByBoard.mockResolvedValue(cards);

      const res = await app.request("/api/boards/board123/cards", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      // Sorted: todo pos 0, todo pos 1, done pos 0
      expect(data[0].id).toBe("card2"); // todo, position 0
      expect(data[1].id).toBe("card1"); // todo, position 1
      expect(data[2].id).toBe("card3"); // done, position 0
    });
  });

  describe("GET /api/cards/:id", () => {
    test("returns card details", async () => {
      const card: Card = {
        id: "card123",
        title: "Test Card",
        boardId: "board123",
        column: "todo",
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockServiceGetCardById.mockResolvedValue(card);

      const res = await app.request("/api/cards/card123", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(card);
    });

    test("validates board ownership", async () => {
      mockServiceGetCardById.mockRejectedValue(new Error("Not authorized"));

      const res = await app.request("/api/cards/card123", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Not authorized");
    });

    test("returns 404 for non-existent card", async () => {
      mockServiceGetCardById.mockRejectedValue(new Error("Card not found"));

      const res = await app.request("/api/cards/nonexistent", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Card not found");
    });
  });

  describe("PUT /api/cards/:id", () => {
    test("updates title and description", async () => {
      const updatedCard: Card = {
        id: "card123",
        title: "Updated",
        description: "New desc",
        boardId: "board123",
        column: "todo",
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockServiceUpdateCard.mockResolvedValue(updatedCard);

      const res = await app.request("/api/cards/card123", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({ title: "Updated", description: "New desc" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.title).toBe("Updated");
      expect(data.description).toBe("New desc");
    });

    test("validates board ownership", async () => {
      mockServiceUpdateCard.mockRejectedValue(new Error("Not authorized"));

      const res = await app.request("/api/cards/card123", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({ title: "Hacked" }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Not authorized");
    });

    test("moves card to different column", async () => {
      const movedCard: Card = {
        id: "card123",
        title: "Moving Card",
        boardId: "board123",
        column: "doing",
        position: 2, // Should be at end of new column
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockServiceMoveCard.mockResolvedValue(movedCard);

      const res = await app.request("/api/cards/card123", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({ column: "doing" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.column).toBe("doing");
      expect(data.position).toBe(2);
    });

    test("cannot move card to invalid column", async () => {
      const res = await app.request("/api/cards/card123", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({ column: "invalid" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid column. Must be todo, doing, or done");
    });

    test("updates position when moving within same column", async () => {
      const reorderedCard: Card = {
        id: "card123",
        title: "Reorder Card",
        boardId: "board123",
        column: "todo",
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockServiceMoveCard.mockResolvedValue(reorderedCard);

      const res = await app.request("/api/cards/card123", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({ column: "todo", position: 0 }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.column).toBe("todo");
      expect(data.position).toBe(0);
    });
  });
});
