import { useState, useCallback } from "react";
import type { Card, CardColumn } from "../types";

interface DragDropState {
  isDragging: boolean;
  draggedCard: Card | null;
  activeDropZone: CardColumn | null;
  error: string | null;
}

interface UseDragDropReturn extends DragDropState {
  handleDragStart: (card: Card) => void;
  handleDragEnd: () => void;
  handleDragOver: (column: CardColumn) => void;
  handleDragLeave: () => void;
  handleDrop: (targetColumn: CardColumn, targetCard: Card | null) => Promise<void>;
  getCardsInColumn: (column: CardColumn) => Card[];
  isValidDropZone: (column: string) => boolean;
}

export function useDragDrop(
  cards: Card[],
  moveCard: (cardId: string, targetColumn: CardColumn, targetPosition: number) => Promise<void>
): UseDragDropReturn {
  const [state, setState] = useState<DragDropState>({
    isDragging: false,
    draggedCard: null,
    activeDropZone: null,
    error: null,
  });

  const handleDragStart = useCallback((card: Card): void => {
    setState(prev => ({
      ...prev,
      isDragging: true,
      draggedCard: card,
      error: null,
    }));
  }, []);

  const handleDragEnd = useCallback((): void => {
    setState(prev => ({
      ...prev,
      isDragging: false,
      draggedCard: null,
      activeDropZone: null,
    }));
  }, []);

  const handleDragOver = useCallback((column: CardColumn): void => {
    setState(prev => ({
      ...prev,
      activeDropZone: column,
    }));
  }, []);

  const handleDragLeave = useCallback((): void => {
    setState(prev => ({
      ...prev,
      activeDropZone: null,
    }));
  }, []);

  const getCardsInColumn = useCallback((column: CardColumn): Card[] => {
    return cards
      .filter(card => card.column === column)
      .sort((a, b) => a.position - b.position);
  }, [cards]);

  const calculateNewPosition = useCallback((
    targetColumn: CardColumn,
    targetCard: Card | null
  ): number => {
    const columnCards = getCardsInColumn(targetColumn);

    // If dropping at the end or empty column
    if (!targetCard) {
      return columnCards.length === 0 ? 0 : columnCards.length;
    }

    // If dropping before a specific card
    const targetIndex = columnCards.findIndex(card => card.id === targetCard.id);
    return targetIndex >= 0 ? targetCard.position : columnCards.length;
  }, [getCardsInColumn]);

  const handleDrop = useCallback(async (
    targetColumn: CardColumn,
    targetCard: Card | null
  ): Promise<void> => {
    const { draggedCard } = state;
    
    if (!draggedCard) {
      return;
    }

    // Prevent dropping card on itself
    if (targetCard && targetCard.id === draggedCard.id) {
      handleDragEnd();
      return;
    }

    try {
      const newPosition = calculateNewPosition(targetColumn, targetCard);
      await moveCard(draggedCard.id, targetColumn, newPosition);
      
      setState(prev => ({
        ...prev,
        isDragging: false,
        draggedCard: null,
        activeDropZone: null,
        error: null,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isDragging: false,
        draggedCard: null,
        activeDropZone: null,
        error: error instanceof Error ? error.message : "Failed to move card",
      }));
    }
  }, [state.draggedCard, calculateNewPosition, moveCard]);

  const isValidDropZone = useCallback((column: string): boolean => {
    return column === "todo" || column === "doing" || column === "done";
  }, []);

  return {
    ...state,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getCardsInColumn,
    isValidDropZone,
  };
}