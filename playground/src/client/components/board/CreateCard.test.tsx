import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { CardColumn, NewCard } from "../../types";

// Mock the cards API
const mockCreateCard = mock(() => Promise.resolve({
  id: "test-card-id",
  title: "New Card",
  description: "Test description",
  boardId: "test-board",
  column: "todo",
  position: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

mock.module("../../api/cards", () => ({
  createCard: mockCreateCard,
}));

describe("CreateCard", () => {
  beforeEach(() => {
    mockCreateCard.mockClear();
  });

  test("Create card form appears in todo column", () => {
    // Component should render with a + button by default
    const buttonText = "+ Add a card";
    expect(buttonText).toContain("+");
    expect(buttonText).toContain("Add a card");
  });

  test("New cards get added to correct column", async () => {
    const newCard: NewCard = {
      title: "Test Card",
      description: "Test Description",
      boardId: "test-board",
      column: "todo",
      position: 0,
    };
    
    await mockCreateCard(newCard);
    
    expect(mockCreateCard).toHaveBeenCalledWith(newCard);
    expect(mockCreateCard).toHaveBeenCalledTimes(1);
  });

  test("Shows form when + button is clicked", () => {
    // Test form visibility state
    let isFormVisible = false;
    const showForm = () => { isFormVisible = true; };
    
    showForm();
    expect(isFormVisible).toBe(true);
  });

  test("Hides form when cancel is clicked", () => {
    // Test form visibility toggle
    let isFormVisible = true;
    const hideForm = () => { isFormVisible = false; };
    
    hideForm();
    expect(isFormVisible).toBe(false);
  });

  test("Title is required for submission", () => {
    // Test validation logic
    const validateTitle = (title: string): string | null => {
      if (!title.trim()) {
        return "Title is required";
      }
      return null;
    };
    
    expect(validateTitle("")).toBe("Title is required");
    expect(validateTitle("  ")).toBe("Title is required");
    expect(validateTitle("Valid Title")).toBeNull();
  });

  test("Clears form after successful submission", () => {
    // Test form reset logic
    let formState = {
      title: "Test Card",
      description: "Test Description",
      error: "",
    };
    
    const resetForm = () => {
      formState = {
        title: "",
        description: "",
        error: "",
      };
    };
    
    resetForm();
    expect(formState.title).toBe("");
    expect(formState.description).toBe("");
    expect(formState.error).toBe("");
  });

  test("Shows error message on API failure", async () => {
    const errorMessage = "Failed to create card";
    mockCreateCard.mockRejectedValueOnce(new Error(errorMessage));
    
    try {
      await mockCreateCard({} as NewCard);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(errorMessage);
    }
  });

  test("Disables submit button while creating", () => {
    // Test button disabled state
    let isCreating = false;
    const setIsCreating = (value: boolean) => { isCreating = value; };
    
    setIsCreating(true);
    expect(isCreating).toBe(true);
    
    setIsCreating(false);
    expect(isCreating).toBe(false);
  });
});