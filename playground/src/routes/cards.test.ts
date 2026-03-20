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

// Mock getDb
const mockGetDb = vi.fn(() => "mock-db-instance");

mock.module("../boards/board.repo", () => ({
  findBoardById: mockFindBoardById,
}));

mock.module("../cards/card.repo", () => ({
  createCard: mockCreateCard,
  findCardsByBoardAndColumn: mockFindCardsByBoardAndColumn,
  findCardsByBoardId: mockFindCardsByBoardId,
  findCardById: mockFindCardById,
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
      const board = {
        id: "board123",
        name: "Test Board",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindBoardById.mockResolvedValue(board);
      mockFindCardsByBoardAndColumn.mockResolvedValue([]);

      const newCard: Card = {
        id: "card123",
        title: "My Card",
        boardId: "board123",
        column: "todo",
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockCreateCard.mockResolvedValue(newCard);

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
      mockFindBoardById.mockResolvedValue(null);

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
      const otherUserBoard = {
        id: "board123",
        name: "Other Board",
        userId: "other-user-id",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindBoardById.mockResolvedValue(otherUserBoard);

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
      const board = {
        id: "board123",
        name: "Test Board",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindBoardById.mockResolvedValue(board);

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
      const board = {
        id: "board123",
        name: "Test Board",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindBoardById.mockResolvedValue(board);
      mockFindCardsByBoardAndColumn.mockResolvedValue([]);

      const newCard: Card = {
        id: "card456",
        title: "Default Column Card",
        boardId: "board123",
        column: "todo",
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockCreateCard.mockResolvedValue(newCard);

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
      const board = {
        id: "board123",
        name: "Test Board",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindBoardById.mockResolvedValue(board);

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
      mockFindCardsByBoardId.mockResolvedValue(cards);

      const res = await app.request("/api/boards/board123/cards", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(cards);
    });

    test("returns empty array for board with no cards", async () => {
      const board = {
        id: "board123",
        name: "Test Board",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindBoardById.mockResolvedValue(board);
      mockFindCardsByBoardId.mockResolvedValue([]);

      const res = await app.request("/api/boards/board123/cards", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });

    test("returns 403 for unowned board", async () => {
      const otherBoard = {
        id: "board123",
        name: "Other Board",
        userId: "other-user-id",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindBoardById.mockResolvedValue(otherBoard);

      const res = await app.request("/api/boards/board123/cards", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Not authorized");
    });

    test("returns cards in position order within columns", async () => {
      const board = {
        id: "board123",
        name: "Test Board",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindBoardById.mockResolvedValue(board);

      // Return cards deliberately out of order
      const cards: Card[] = [
        {
          id: "card3",
          title: "Done Card",
          boardId: "board123",
          column: "done",
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
          id: "card2",
          title: "Todo First",
          boardId: "board123",
          column: "todo",
          position: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockFindCardsByBoardId.mockResolvedValue(cards);

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
      mockFindCardById.mockResolvedValue(card);

      const board = {
        id: "board123",
        name: "Test Board",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindBoardById.mockResolvedValue(board);

      const res = await app.request("/api/cards/card123", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(card);
    });

    test("validates board ownership", async () => {
      const card: Card = {
        id: "card123",
        title: "Test Card",
        boardId: "board123",
        column: "todo",
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindCardById.mockResolvedValue(card);

      const otherBoard = {
        id: "board123",
        name: "Other Board",
        userId: "other-user-id",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindBoardById.mockResolvedValue(otherBoard);

      const res = await app.request("/api/cards/card123", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Not authorized");
    });

    test("returns 404 for non-existent card", async () => {
      mockFindCardById.mockResolvedValue(null);

      const res = await app.request("/api/cards/nonexistent", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Card not found");
    });
  });
});
