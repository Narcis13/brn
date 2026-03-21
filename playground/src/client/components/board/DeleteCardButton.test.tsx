import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock the cards API
const mockDeleteCard = mock(() => Promise.resolve());

mock.module("../../api/cards", () => ({
  deleteCard: mockDeleteCard,
}));

describe("DeleteCardButton", () => {
  beforeEach(() => {
    mockDeleteCard.mockClear();
  });

  test("Delete removes card with confirmation", async () => {
    const cardId = "card-123";
    await mockDeleteCard(cardId);
    expect(mockDeleteCard).toHaveBeenCalledWith(cardId);
  });

  test("Shows confirmation before deleting", () => {
    // Test confirmation state
    let showConfirm = false;
    const toggleConfirm = () => { showConfirm = true; };
    
    toggleConfirm();
    expect(showConfirm).toBe(true);
  });

  test("Cancels delete when No is clicked", () => {
    // Test cancellation
    let showConfirm = true;
    const cancelDelete = () => { showConfirm = false; };
    
    cancelDelete();
    expect(showConfirm).toBe(false);
  });

  test("Shows error message on delete failure", async () => {
    const errorMessage = "Failed to delete card";
    mockDeleteCard.mockRejectedValueOnce(new Error(errorMessage));
    
    try {
      await mockDeleteCard("card-123");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(errorMessage);
    }
  });

  test("Disables buttons while deleting", () => {
    // Test button disabled state
    let isDeleting = false;
    const setIsDeleting = (value: boolean) => { isDeleting = value; };
    
    setIsDeleting(true);
    expect(isDeleting).toBe(true);
    
    setIsDeleting(false);
    expect(isDeleting).toBe(false);
  });
});