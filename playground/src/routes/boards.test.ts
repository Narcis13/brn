import { describe, test, expect, beforeEach, vi, mock } from "bun:test";
import { Hono } from "hono";
import type { Board, AuthContext } from "../types";
import { boardRoutes } from "./boards";
import { generateToken } from "../auth/jwt";

// Mock auth context
const mockAuthContext: AuthContext = { userId: "user123", email: "test@example.com" };

// Create mock functions
const mockCreateBoard = vi.fn();
const mockFindBoardsByUserId = vi.fn();
const mockFindBoardById = vi.fn();
const mockUpdateBoard = vi.fn();
const mockDeleteBoard = vi.fn();
const mockGetDb = vi.fn(() => "mock-db-instance");

// Mock modules
mock.module("../boards/board.repo", () => ({
  createBoard: mockCreateBoard,
  findBoardsByUserId: mockFindBoardsByUserId,
  findBoardById: mockFindBoardById,
  updateBoard: mockUpdateBoard,
  deleteBoard: mockDeleteBoard
}));

mock.module("../db", () => ({
  getDb: mockGetDb
}));

describe("Board Routes", () => {
  let app: Hono;
  let validToken: string;

  beforeEach(() => {
    // Set JWT_SECRET for tests
    process.env.JWT_SECRET = "test-secret-key-for-testing-only";
    
    vi.clearAllMocks();
    app = new Hono();
    app.route("/api/boards", boardRoutes);
    
    // Generate a valid token for tests
    validToken = generateToken({ userId: mockAuthContext.userId, email: mockAuthContext.email });
  });

  describe("POST /api/boards", () => {
    test("creates board with valid name (auth required)", async () => {
      const newBoard: Board = {
        id: "board123",
        name: "My Test Board",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      mockCreateBoard.mockResolvedValue(newBoard);

      const res = await app.request("/api/boards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${validToken}`
        },
        body: JSON.stringify({ name: "My Test Board" })
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toEqual(newBoard);
      expect(mockCreateBoard).toHaveBeenCalledWith("mock-db-instance", {
        name: "My Test Board",
        userId: mockAuthContext.userId
      });
    });

    test("returns 401 without auth token", async () => {
      const res = await app.request("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Board" })
      });

      expect(res.status).toBe(401);
      expect(mockCreateBoard).not.toHaveBeenCalled();
    });

    test("validates name is non-empty string", async () => {
      const res = await app.request("/api/boards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${validToken}`
        },
        body: JSON.stringify({ name: "" })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
      expect(mockCreateBoard).not.toHaveBeenCalled();
    });

    test("returns created board with 201 status", async () => {
      const newBoard: Board = {
        id: "board456",
        name: "Another Board",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      mockCreateBoard.mockResolvedValue(newBoard);

      const res = await app.request("/api/boards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${validToken}`
        },
        body: JSON.stringify({ name: "Another Board" })
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toEqual(newBoard);
    });
  });

  describe("GET /api/boards", () => {
    test("returns user's boards", async () => {
      const boards: Board[] = [
        {
          id: "board1",
          name: "Board 1",
          userId: mockAuthContext.userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "board2",
          name: "Board 2",
          userId: mockAuthContext.userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      mockFindBoardsByUserId.mockResolvedValue(boards);

      const res = await app.request("/api/boards", {
        method: "GET",
        headers: { "Authorization": `Bearer ${validToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(boards);
      expect(mockFindBoardsByUserId).toHaveBeenCalledWith("mock-db-instance", mockAuthContext.userId);
    });

    test("returns 401 without auth token", async () => {
      const res = await app.request("/api/boards", {
        method: "GET"
      });

      expect(res.status).toBe(401);
      expect(mockFindBoardsByUserId).not.toHaveBeenCalled();
    });

    test("returns empty array for new user", async () => {
      mockFindBoardsByUserId.mockResolvedValue([]);

      const res = await app.request("/api/boards", {
        method: "GET",
        headers: { "Authorization": `Bearer ${validToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
      expect(mockFindBoardsByUserId).toHaveBeenCalledWith("mock-db-instance", mockAuthContext.userId);
    });

    test("only returns current user's boards", async () => {
      const currentUserBoards: Board[] = [
        {
          id: "board1",
          name: "My Board",
          userId: mockAuthContext.userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      mockFindBoardsByUserId.mockResolvedValue(currentUserBoards);

      const res = await app.request("/api/boards", {
        method: "GET",
        headers: { "Authorization": `Bearer ${validToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(currentUserBoards);
      expect(mockFindBoardsByUserId).toHaveBeenCalledWith("mock-db-instance", mockAuthContext.userId);
      expect(mockFindBoardsByUserId).not.toHaveBeenCalledWith("mock-db-instance", "otherUserId");
    });
  });

  describe("GET /api/boards/:id", () => {
    test("returns board when user owns it", async () => {
      const board: Board = {
        id: "board123",
        name: "My Board",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      mockFindBoardById.mockResolvedValue(board);

      const res = await app.request("/api/boards/board123", {
        method: "GET",
        headers: { "Authorization": `Bearer ${validToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(board);
      expect(mockFindBoardById).toHaveBeenCalledWith("mock-db-instance", "board123");
    });

    test("returns 404 when board not found", async () => {
      mockFindBoardById.mockResolvedValue(null);

      const res = await app.request("/api/boards/nonexistent", {
        method: "GET",
        headers: { "Authorization": `Bearer ${validToken}` }
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("returns 404 when user doesn't own board", async () => {
      const otherUserBoard: Board = {
        id: "board123",
        name: "Other User Board",
        userId: "otheruser456",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      mockFindBoardById.mockResolvedValue(otherUserBoard);

      const res = await app.request("/api/boards/board123", {
        method: "GET",
        headers: { "Authorization": `Bearer ${validToken}` }
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("requires authentication", async () => {
      const res = await app.request("/api/boards/board123", {
        method: "GET"
      });

      expect(res.status).toBe(401);
      expect(mockFindBoardById).not.toHaveBeenCalled();
    });
  });

  describe("PUT /api/boards/:id", () => {
    test("updates board name", async () => {
      const existingBoard: Board = {
        id: "board123",
        name: "Old Name",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const updatedBoard: Board = {
        ...existingBoard,
        name: "New Name",
        updatedAt: new Date().toISOString()
      };
      mockFindBoardById.mockResolvedValue(existingBoard);
      mockUpdateBoard.mockResolvedValue(updatedBoard);

      const res = await app.request("/api/boards/board123", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${validToken}`
        },
        body: JSON.stringify({ name: "New Name" })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(updatedBoard);
      expect(mockUpdateBoard).toHaveBeenCalledWith("mock-db-instance", "board123", {
        name: "New Name"
      });
    });

    test("validates new name", async () => {
      const existingBoard: Board = {
        id: "board123",
        name: "Current Name",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      mockFindBoardById.mockResolvedValue(existingBoard);

      const res = await app.request("/api/boards/board123", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${validToken}`
        },
        body: JSON.stringify({ name: "" })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
      expect(mockUpdateBoard).not.toHaveBeenCalled();
    });

    test("returns 404 when user doesn't own board", async () => {
      const otherUserBoard: Board = {
        id: "board123",
        name: "Other User Board",
        userId: "otheruser456",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      mockFindBoardById.mockResolvedValue(otherUserBoard);

      const res = await app.request("/api/boards/board123", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${validToken}`
        },
        body: JSON.stringify({ name: "New Name" })
      });

      expect(res.status).toBe(404);
      expect(mockUpdateBoard).not.toHaveBeenCalled();
    });

    test("requires authentication", async () => {
      const res = await app.request("/api/boards/board123", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" })
      });

      expect(res.status).toBe(401);
      expect(mockFindBoardById).not.toHaveBeenCalled();
      expect(mockUpdateBoard).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/boards/:id", () => {
    test("removes board", async () => {
      const board: Board = {
        id: "board123",
        name: "To Delete",
        userId: mockAuthContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      mockFindBoardById.mockResolvedValue(board);
      mockDeleteBoard.mockResolvedValue(undefined);

      const res = await app.request("/api/boards/board123", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${validToken}` }
      });

      expect(res.status).toBe(204);
      expect(mockDeleteBoard).toHaveBeenCalledWith("mock-db-instance", "board123");
    });

    test("returns 404 when user doesn't own board", async () => {
      const otherUserBoard: Board = {
        id: "board123",
        name: "Other User Board",
        userId: "otheruser456",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      mockFindBoardById.mockResolvedValue(otherUserBoard);

      const res = await app.request("/api/boards/board123", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${validToken}` }
      });

      expect(res.status).toBe(404);
      expect(mockDeleteBoard).not.toHaveBeenCalled();
    });

    test("requires authentication", async () => {
      const res = await app.request("/api/boards/board123", {
        method: "DELETE"
      });

      expect(res.status).toBe(401);
      expect(mockFindBoardById).not.toHaveBeenCalled();
      expect(mockDeleteBoard).not.toHaveBeenCalled();
    });
  });
});