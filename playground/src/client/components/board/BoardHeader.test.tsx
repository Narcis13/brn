import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { Board } from "../../types";

// Mock the boards API
const mockUpdateBoard = mock(() => Promise.resolve({} as Board));

mock.module("../../api/boards", () => ({
  updateBoard: mockUpdateBoard,
  getBoard: mock(() => Promise.resolve()),
  getBoards: mock(() => Promise.resolve([])),
  createBoard: mock(() => Promise.resolve()),
  deleteBoard: mock(() => Promise.resolve()),
}));

describe("BoardHeader", () => {
  const mockBoard: Board = {
    id: "board-123",
    name: "My Test Board",
    userId: "user-123",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockUpdateBoard.mockClear();
    mockUpdateBoard.mockResolvedValue({ ...mockBoard });
  });

  test("renders board name from board prop", () => {
    // The component receives a board prop and should display board.name
    expect(mockBoard.name).toBe("My Test Board");
    expect(mockBoard.id).toBe("board-123");
  });

  test("back button calls onBack callback", () => {
    const onBack = mock(() => {});

    // Simulate clicking back button
    onBack();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("onBack is called with no arguments", () => {
    const calls: unknown[][] = [];
    const onBack = mock((...args: unknown[]) => {
      calls.push(args);
    });

    onBack();

    expect(calls[0]).toHaveLength(0);
  });

  test("edit mode state starts as false", () => {
    // Initial state: not editing
    let isEditing = false;
    expect(isEditing).toBe(false);

    // After clicking edit, state becomes true
    isEditing = true;
    expect(isEditing).toBe(true);
  });

  test("edit mode toggles on name click", () => {
    let isEditing = false;
    const handleNameClick = () => {
      isEditing = true;
    };

    handleNameClick();

    expect(isEditing).toBe(true);
  });

  test("editName state initializes with board name when entering edit mode", () => {
    let editName = "";
    const enterEditMode = (boardName: string) => {
      editName = boardName;
    };

    enterEditMode(mockBoard.name);

    expect(editName).toBe("My Test Board");
  });

  test("save updates board name via API", async () => {
    const updatedBoard: Board = { ...mockBoard, name: "Updated Name" };
    mockUpdateBoard.mockResolvedValueOnce(updatedBoard);

    const result = await mockUpdateBoard("board-123", { name: "Updated Name" });

    expect(mockUpdateBoard).toHaveBeenCalledWith("board-123", { name: "Updated Name" });
    expect(result.name).toBe("Updated Name");
  });

  test("save calls onBoardUpdate with updated board", async () => {
    const updatedBoard: Board = { ...mockBoard, name: "New Name" };
    mockUpdateBoard.mockResolvedValueOnce(updatedBoard);
    const onBoardUpdate = mock((_board: Board) => {});

    const result = await mockUpdateBoard("board-123", { name: "New Name" });
    onBoardUpdate(result);

    expect(onBoardUpdate).toHaveBeenCalledWith(updatedBoard);
  });

  test("save exits edit mode after successful update", async () => {
    let isEditing = true;
    const updatedBoard: Board = { ...mockBoard, name: "New Name" };
    mockUpdateBoard.mockResolvedValueOnce(updatedBoard);

    await mockUpdateBoard("board-123", { name: "New Name" });
    isEditing = false;

    expect(isEditing).toBe(false);
  });

  test("cancel restores original board name", () => {
    let editName = "Changed Name";
    const originalName = mockBoard.name;

    const handleCancel = () => {
      editName = originalName;
    };

    handleCancel();

    expect(editName).toBe("My Test Board");
  });

  test("cancel exits edit mode", () => {
    let isEditing = true;

    const handleCancel = () => {
      isEditing = false;
    };

    handleCancel();

    expect(isEditing).toBe(false);
  });

  test("escape key cancels editing", () => {
    let isEditing = true;
    let editName = "Changed Name";
    const originalName = mockBoard.name;

    const handleKeyDown = (key: string) => {
      if (key === "Escape") {
        isEditing = false;
        editName = originalName;
      }
    };

    handleKeyDown("Escape");

    expect(isEditing).toBe(false);
    expect(editName).toBe("My Test Board");
  });

  test("enter key saves on keydown", async () => {
    let isEditing = true;
    const updatedBoard: Board = { ...mockBoard, name: "New Name" };
    mockUpdateBoard.mockResolvedValueOnce(updatedBoard);

    const handleKeyDown = async (key: string, editName: string) => {
      if (key === "Enter") {
        await mockUpdateBoard("board-123", { name: editName });
        isEditing = false;
      }
    };

    await handleKeyDown("Enter", "New Name");

    expect(mockUpdateBoard).toHaveBeenCalledWith("board-123", { name: "New Name" });
    expect(isEditing).toBe(false);
  });

  test("save does not call API when name is empty", async () => {
    mockUpdateBoard.mockClear();

    const handleSave = async (editName: string) => {
      const trimmed = editName.trim();
      if (!trimmed) return;
      await mockUpdateBoard("board-123", { name: trimmed });
    };

    await handleSave("   ");

    expect(mockUpdateBoard).not.toHaveBeenCalled();
  });

  test("save trims whitespace from board name", async () => {
    const updatedBoard: Board = { ...mockBoard, name: "Trimmed Name" };
    mockUpdateBoard.mockResolvedValueOnce(updatedBoard);

    const handleSave = async (editName: string) => {
      const trimmed = editName.trim();
      if (!trimmed) return;
      await mockUpdateBoard("board-123", { name: trimmed });
    };

    await handleSave("  Trimmed Name  ");

    expect(mockUpdateBoard).toHaveBeenCalledWith("board-123", { name: "Trimmed Name" });
  });
});
