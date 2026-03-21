import { useState, useEffect, useCallback } from "react";
import * as cardsApi from "../api/cards";
import type { Card, NewCard, CardColumn } from "../types";

interface UseCardsReturn {
  cards: Card[];
  loading: boolean;
  error: string | null;
  createCard: (newCard: NewCard) => Promise<void>;
  updateCard: (id: string, updates: Partial<Card>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  moveCard: (id: string, targetColumn: CardColumn, targetPosition: number) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useCards(boardId: string): UseCardsReturn {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedCards = await cardsApi.getCardsByBoardId(boardId);
      setCards(fetchedCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const createCard = async (newCard: NewCard): Promise<void> => {
    // Optimistic update with temporary ID
    const tempId = `temp-${Date.now()}`;
    const optimisticCard: Card = {
      ...newCard,
      id: tempId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    setCards(prev => [...prev, optimisticCard]);
    
    try {
      const createdCard = await cardsApi.createCard(newCard);
      // Replace temp card with real card
      setCards(prev => prev.map(card => 
        card.id === tempId ? createdCard : card
      ));
    } catch (err) {
      // Rollback on error
      setCards(prev => prev.filter(card => card.id !== tempId));
      throw err;
    }
  };

  const updateCard = async (id: string, updates: Partial<Card>): Promise<void> => {
    const originalCards = [...cards];
    
    // Optimistic update
    setCards(prev => prev.map(card => 
      card.id === id ? { ...card, ...updates, updatedAt: new Date().toISOString() } : card
    ));
    
    try {
      const updatedCard = await cardsApi.updateCard(id, updates);
      // Update with server response
      setCards(prev => prev.map(card => 
        card.id === id ? updatedCard : card
      ));
    } catch (err) {
      // Rollback on error
      setCards(originalCards);
      throw err;
    }
  };

  const deleteCard = async (id: string): Promise<void> => {
    const originalCards = [...cards];
    
    // Optimistic delete
    setCards(prev => prev.filter(card => card.id !== id));
    
    try {
      await cardsApi.deleteCard(id);
    } catch (err) {
      // Rollback on error
      setCards(originalCards);
      throw err;
    }
  };

  const moveCard = async (
    id: string, 
    targetColumn: CardColumn, 
    targetPosition: number
  ): Promise<void> => {
    const originalCards = [...cards];
    
    // Optimistic move
    setCards(prev => prev.map(card => 
      card.id === id 
        ? { ...card, column: targetColumn, position: targetPosition, updatedAt: new Date().toISOString() }
        : card
    ));
    
    try {
      const movedCard = await cardsApi.moveCardToColumn(id, targetColumn, targetPosition);
      // Update with server response
      setCards(prev => prev.map(card => 
        card.id === id ? movedCard : card
      ));
    } catch (err) {
      // Rollback on error
      setCards(originalCards);
      throw err;
    }
  };

  return {
    cards,
    loading,
    error,
    createCard,
    updateCard,
    deleteCard,
    moveCard,
    refetch: loadCards,
  };
}