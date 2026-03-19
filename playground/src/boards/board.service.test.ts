import { describe, test, expect, beforeEach, mock } from "bun:test";
import * as boardService from "./board.service";
import * as boardRepo from "./board.repo";
import type { Board } from "../types";

// Mock the board repository
mock.module("./board.repo", () => ({
  createBoard: mock(),
  findBoardsByUserId: mock(),
  findBoardById: mock(),
  updateBoard: mock(),
  deleteBoard: mock()
}));

describe("Board Service", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mock.restore();
  });

  describe("validateBoardName", () => {
    test("throws for empty string", () => {
      expect(() => boardService.validateBoardName("")).toThrow("Board name is required");
      expect(() => boardService.validateBoardName("   ")).toThrow("Board name is required");
    });

    test("throws for string over 100 chars", () => {
      const longName = "a".repeat(101);
      expect(() => boardService.validateBoardName(longName)).toThrow("Board name must be 100 characters or less");
    });

    test("passes for valid names", () => {
      expect(() => boardService.validateBoardName("My Board")).not.toThrow();
      expect(() => boardService.validateBoardName("A")).not.toThrow();
      expect(() => boardService.validateBoardName("a".repeat(100))).not.toThrow();
    });
  });

  describe("validateBoardOwnership", () => {
    const mockDb = {} as any;

    test("returns true when user owns board", async () => {
      const mockBoard: Board = {
        id: "board-123",
        name: "My Board",
        userId: "user-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const findBoardByIdMock = boardRepo.findBoardById as any;
      findBoardByIdMock.mockResolvedValue(mockBoard);

      const result = await boardService.validateBoardOwnership(mockDb, "board-123", "user-123");
      expect(result).toBe(true);
      expect(findBoardByIdMock).toHaveBeenCalledWith(mockDb, "board-123");
    });

    test("returns false when user doesn't own board", async () => {
      const mockBoard: Board = {
        id: "board-123",
        name: "My Board",
        userId: "user-456",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const findBoardByIdMock = boardRepo.findBoardById as any;
      findBoardByIdMock.mockResolvedValue(mockBoard);

      const result = await boardService.validateBoardOwnership(mockDb, "board-123", "user-123");
      expect(result).toBe(false);
    });

    test("returns false when board doesn't exist", async () => {
      const findBoardByIdMock = boardRepo.findBoardById as any;
      findBoardByIdMock.mockResolvedValue(null);

      const result = await boardService.validateBoardOwnership(mockDb, "board-123", "user-123");
      expect(result).toBe(false);
    });
  });

  describe("Service functions", () => {
    const mockDb = {} as any;

    test("createBoard validates name and calls repository", async () => {
      const mockBoard: Board = {
        id: "board-123",
        name: "My Board",
        userId: "user-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const createBoardMock = boardRepo.createBoard as any;
      createBoardMock.mockResolvedValue(mockBoard);

      const result = await boardService.createBoard(mockDb, {
        name: "My Board",
        userId: "user-123"
      });

      expect(result).toEqual(mockBoard);
      expect(createBoardMock).toHaveBeenCalledWith(mockDb, {
        name: "My Board",
        userId: "user-123"
      });
    });

    test("createBoard trims board name", async () => {
      const mockBoard: Board = {
        id: "board-123",
        name: "My Board",
        userId: "user-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const createBoardMock = boardRepo.createBoard as any;
      createBoardMock.mockResolvedValue(mockBoard);

      await boardService.createBoard(mockDb, {
        name: "  My Board  ",
        userId: "user-123"
      });

      expect(createBoardMock).toHaveBeenCalledWith(mockDb, {
        name: "My Board",
        userId: "user-123"
      });
    });

    test("createBoard throws on invalid name", async () => {
      await expect(boardService.createBoard(mockDb, {
        name: "",
        userId: "user-123"
      })).rejects.toThrow("Board name is required");

      await expect(boardService.createBoard(mockDb, {
        name: "a".repeat(101),
        userId: "user-123"
      })).rejects.toThrow("Board name must be 100 characters or less");
    });

    test("getBoardsByUserId calls repository", async () => {
      const mockBoards: Board[] = [
        {
          id: "board-123",
          name: "Board 1",
          userId: "user-123",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      const findBoardsByUserIdMock = boardRepo.findBoardsByUserId as any;
      findBoardsByUserIdMock.mockResolvedValue(mockBoards);

      const result = await boardService.getBoardsByUserId(mockDb, "user-123");
      expect(result).toEqual(mockBoards);
      expect(findBoardsByUserIdMock).toHaveBeenCalledWith(mockDb, "user-123");
    });

    test("getBoardById validates ownership and returns board", async () => {
      const mockBoard: Board = {
        id: "board-123",
        name: "My Board",
        userId: "user-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const findBoardByIdMock = boardRepo.findBoardById as any;
      findBoardByIdMock.mockResolvedValue(mockBoard);

      const result = await boardService.getBoardById(mockDb, "board-123", "user-123");
      expect(result).toEqual(mockBoard);
    });

    test("getBoardById returns null when user doesn't own board", async () => {
      const mockBoard: Board = {
        id: "board-123",
        name: "My Board",
        userId: "user-456",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const findBoardByIdMock = boardRepo.findBoardById as any;
      findBoardByIdMock.mockResolvedValue(mockBoard);

      const result = await boardService.getBoardById(mockDb, "board-123", "user-123");
      expect(result).toBe(null);
    });

    test("updateBoard validates name and ownership", async () => {
      const mockBoard: Board = {
        id: "board-123",
        name: "Updated Board",
        userId: "user-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const findBoardByIdMock = boardRepo.findBoardById as any;
      const updateBoardMock = boardRepo.updateBoard as any;
      
      findBoardByIdMock.mockResolvedValue({
        id: "board-123",
        name: "Old Board",
        userId: "user-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      updateBoardMock.mockResolvedValue(mockBoard);

      const result = await boardService.updateBoard(mockDb, "board-123", "user-123", {
        name: "  Updated Board  "
      });

      expect(result).toEqual(mockBoard);
      expect(updateBoardMock).toHaveBeenCalledWith(mockDb, "board-123", {
        name: "Updated Board"
      });
    });

    test("updateBoard throws on invalid ownership", async () => {
      const findBoardByIdMock = boardRepo.findBoardById as any;
      findBoardByIdMock.mockResolvedValue({
        id: "board-123",
        name: "Board",
        userId: "user-456",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await expect(boardService.updateBoard(mockDb, "board-123", "user-123", {
        name: "New Name"
      })).rejects.toThrow("Board not found");
    });

    test("deleteBoard validates ownership", async () => {
      const findBoardByIdMock = boardRepo.findBoardById as any;
      const deleteBoardMock = boardRepo.deleteBoard as any;
      
      findBoardByIdMock.mockResolvedValue({
        id: "board-123",
        name: "Board",
        userId: "user-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      deleteBoardMock.mockResolvedValue(undefined);

      await boardService.deleteBoard(mockDb, "board-123", "user-123");
      expect(deleteBoardMock).toHaveBeenCalledWith(mockDb, "board-123");
    });

    test("deleteBoard throws on invalid ownership", async () => {
      const findBoardByIdMock = boardRepo.findBoardById as any;
      findBoardByIdMock.mockResolvedValue({
        id: "board-123",
        name: "Board",
        userId: "user-456",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await expect(boardService.deleteBoard(mockDb, "board-123", "user-123")).rejects.toThrow("Board not found");
    });

    test("Service functions properly handle repository errors", async () => {
      const error = new Error("Database error");
      
      const findBoardByIdMock = boardRepo.findBoardById as any;
      findBoardByIdMock.mockRejectedValue(error);

      await expect(boardService.getBoardById(mockDb, "board-123", "user-123")).rejects.toThrow("Database error");
    });
  });
});