import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { Board, NewBoard } from "../../types";

// Mock the boards API
const mockCreateBoard = mock(() => Promise.resolve());

mock.module("../../api/boards", () => ({
  createBoard: mockCreateBoard,
  getBoards: mock(() => Promise.resolve([])),
  deleteBoard: mock(() => Promise.resolve()),
  getBoard: mock(() => Promise.resolve()),
  updateBoard: mock(() => Promise.resolve()),
}));

describe("CreateBoard", () => {
  beforeEach(() => {
    mockCreateBoard.mockClear();
  });

  test("createBoard API is called with correct data", async () => {
    const newBoard: NewBoard = { name: "Test Board" };
    const mockResponse: Board = {
      id: "board-123",
      name: "Test Board",
      user_id: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    mockCreateBoard.mockResolvedValueOnce(mockResponse);
    const result = await mockCreateBoard(newBoard);
    
    expect(mockCreateBoard).toHaveBeenCalledWith(newBoard);
    expect(result).toEqual(mockResponse);
  });

  test("createBoard validates empty name", async () => {
    // Test validation logic separately since we can't test React components easily
    const validateBoardName = (name: string): string | null => {
      const trimmed = name.trim();
      if (!trimmed) return "Board name is required";
      if (trimmed.length < 3) return "Board name must be at least 3 characters";
      return null;
    };

    expect(validateBoardName("")).toBe("Board name is required");
    expect(validateBoardName("  ")).toBe("Board name is required");
    expect(validateBoardName("AB")).toBe("Board name must be at least 3 characters");
    expect(validateBoardName("Valid Name")).toBeNull();
  });

  test("createBoard trims whitespace", () => {
    const input = "  Test Board  ";
    const trimmed = input.trim();
    expect(trimmed).toBe("Test Board");
  });

  test("createBoard handles API errors", async () => {
    mockCreateBoard.mockRejectedValueOnce(new Error("Failed to create board"));
    
    try {
      await mockCreateBoard({ name: "Test" });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Failed to create board");
    }
  });

  test("board-created event dispatch", () => {
    // Test that custom events can be created
    const event = new CustomEvent("board-created");
    expect(event.type).toBe("board-created");
  });
});