import type { Card, CardColumn } from "../types";

/**
 * Calculate the new position for a card being dropped
 */
export function calculateNewPosition(
  cardsInColumn: Card[],
  targetCard: Card | null
): number {
  if (cardsInColumn.length === 0) {
    return 0;
  }

  if (!targetCard) {
    // Dropping at the end
    return cardsInColumn.length;
  }

  // Find the target card's position
  const targetIndex = cardsInColumn.findIndex(c => c.id === targetCard.id);
  if (targetIndex === -1) {
    // Target card not found, drop at end
    return cardsInColumn.length;
  }

  return targetCard.position;
}

/**
 * Get all cards for a specific column, sorted by position
 */
export function getCardsForColumn(
  allCards: Card[],
  column: CardColumn
): Card[] {
  return allCards
    .filter(card => card.column === column)
    .sort((a, b) => a.position - b.position);
}

/**
 * Sort cards by position
 */
export function sortCardsByPosition(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.position - b.position);
}

/**
 * Update card positions after a card is removed or inserted
 * @param cards - Cards in the column
 * @param affectedPosition - Position where change occurred
 * @param isInsertion - True if inserting, false if removing
 */
export function updateCardPositions(
  cards: Card[],
  affectedPosition: number,
  isInsertion = false
): Card[] {
  if (isInsertion) {
    // Shift positions up for cards at or after the insertion point
    return cards.map(card => {
      if (card.position >= affectedPosition) {
        return { ...card, position: card.position + 1 };
      }
      return card;
    });
  } else {
    // Shift positions down for cards after the removal point
    return cards
      .filter(card => card.position !== affectedPosition)
      .map(card => {
        if (card.position > affectedPosition) {
          return { ...card, position: card.position - 1 };
        }
        return card;
      });
  }
}

/**
 * Validate if a column name is valid
 */
export function isValidColumn(column: string | null | undefined): column is CardColumn {
  return column === "todo" || column === "doing" || column === "done";
}