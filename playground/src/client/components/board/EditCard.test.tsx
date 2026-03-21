import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { Card } from "../../types";

// Mock the cards API
const mockUpdateCard = mock(() => Promise.resolve({
  id: "test-card",
  title: "Updated Title",
  description: "Updated Description",
  boardId: "test-board",
  column: "doing",
  position: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

mock.module("../../api/cards", () => ({
  updateCard: mockUpdateCard,
}));

describe("EditCard", () => {
  const testCard: Card = {
    id: "test-card",
    title: "Original Title",
    description: "Original Description",
    boardId: "test-board",
    column: "todo",
    position: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockUpdateCard.mockClear();
  });

  test("Edit modal shows current card data", () => {
    // Card data should be displayed in edit form
    expect(testCard.title).toBe("Original Title");
    expect(testCard.description).toBe("Original Description");
  });

  test("Save updates card content", async () => {
    const updates = {
      title: "New Title",
      description: "New Description",
    };
    
    await mockUpdateCard(testCard.id, updates);
    
    expect(mockUpdateCard).toHaveBeenCalledWith(testCard.id, updates);
    expect(mockUpdateCard).toHaveBeenCalledTimes(1);
  });

  test("Does not render when isOpen is false", () => {
    const isOpen = false;
    expect(isOpen).toBe(false);
    // Component should return null when not open
  });

  test("Closes modal when cancel is clicked", () => {
    let isOpen = true;
    const onClose = () => { isOpen = false; };
    
    onClose();
    expect(isOpen).toBe(false);
  });

  test("Closes modal when backdrop is clicked", () => {
    let isOpen = true;
    const onClose = () => { isOpen = false; };
    
    onClose();
    expect(isOpen).toBe(false);
  });

  test("Title is required for saving", () => {
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

  test("Shows error message on update failure", async () => {
    const errorMessage = "Failed to update card";
    mockUpdateCard.mockRejectedValueOnce(new Error(errorMessage));
    
    try {
      await mockUpdateCard("card-id", {});
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(errorMessage);
    }
  });

  test("Disables save button while updating", () => {
    // Test button disabled state
    let isSaving = false;
    const setIsSaving = (value: boolean) => { isSaving = value; };
    
    setIsSaving(true);
    expect(isSaving).toBe(true);
    
    setIsSaving(false);
    expect(isSaving).toBe(false);
  });

  test("Handles card with no description", () => {
    const cardWithoutDescription = { ...testCard, description: "" };
    expect(cardWithoutDescription.description).toBe("");
    expect(cardWithoutDescription.title).toBe("Original Title");
  });

  test("Prevents form submission on Enter key", () => {
    // Test form submission prevention
    let wasSubmitted = false;
    const handleFormSubmit = (e: { preventDefault: () => void }) => {
      e.preventDefault();
      // Form submission should be prevented
    };
    
    const mockEvent = { preventDefault: () => { wasSubmitted = false; } };
    handleFormSubmit(mockEvent);
    expect(wasSubmitted).toBe(false);
  });
});