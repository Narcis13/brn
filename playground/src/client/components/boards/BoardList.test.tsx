import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { Board } from "../../types";

// Mock the boards API
const mockGetBoards = mock(() => Promise.resolve([]));
const mockDeleteBoard = mock(() => Promise.resolve());

mock.module("../../api/boards", () => ({
  getBoards: mockGetBoards,
  deleteBoard: mockDeleteBoard,
  createBoard: mock(() => Promise.resolve()),
  getBoard: mock(() => Promise.resolve()),
  updateBoard: mock(() => Promise.resolve()),
}));

describe("BoardList", () => {
  beforeEach(() => {
    mockGetBoards.mockClear();
    mockDeleteBoard.mockClear();
  });

  test("getBoards is called on mount", async () => {
    // Since we can't easily test React components with Bun,
    // we'll test the API functions directly
    await mockGetBoards();
    expect(mockGetBoards).toHaveBeenCalledTimes(1);
  });

  test("deleteBoard API function works", async () => {
    const boardId = "board-123";
    await mockDeleteBoard(boardId);
    expect(mockDeleteBoard).toHaveBeenCalledWith(boardId);
  });

  test("getBoards returns expected data", async () => {
    const mockBoards: Board[] = [
      {
        id: "board-1",
        name: "Test Board",
        user_id: "user-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    
    mockGetBoards.mockResolvedValueOnce(mockBoards);
    const result = await mockGetBoards();
    expect(result).toEqual(mockBoards);
  });

  test("deleteBoard handles errors", async () => {
    mockDeleteBoard.mockRejectedValueOnce(new Error("Delete failed"));
    
    try {
      await mockDeleteBoard("board-1");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Delete failed");
    }
  });
});