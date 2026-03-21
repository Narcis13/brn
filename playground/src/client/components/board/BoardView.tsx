import { useState, useEffect, useCallback } from "react";
import { Column } from "./Column";
import { getBoard } from "../../api/boards";
import { getCardsByBoardId } from "../../api/cards";
import type { Board, Card, CardColumn } from "../../types";

interface BoardViewProps {
  boardId: string;
}

export function BoardView({ boardId }: BoardViewProps): JSX.Element {
  const [board, setBoard] = useState<Board | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadBoardData() {
      try {
        setLoading(true);
        setError(null);

        // Load board and cards in parallel
        const [boardData, cardsData] = await Promise.all([
          getBoard(boardId),
          getCardsByBoardId(boardId),
        ]);

        setBoard(boardData);
        setCards(cardsData);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        if (message.includes("board")) {
          setError(`Error loading board: ${message}`);
        } else if (message.includes("cards")) {
          setError(`Error loading cards: ${message}`);
        } else {
          setError(`Error loading board: ${message}`);
        }
      } finally {
        setLoading(false);
      }
    }

    loadBoardData();
  }, [boardId]);

  if (loading) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        <p>Loading board...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "#d32f2f" }}>
        <p>{error}</p>
      </div>
    );
  }

  if (!board) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        <p>Board not found</p>
      </div>
    );
  }

  const getCardsForColumn = useCallback(
    (column: CardColumn): Card[] => {
      return cards.filter((card) => card.column === column);
    },
    [cards]
  );

  const refreshCards = useCallback(async () => {
    try {
      const updatedCards = await getCardsByBoardId(boardId);
      setCards(updatedCards);
    } catch (err) {
      console.error("Error refreshing cards:", err);
    }
  }, [boardId]);

  const handleCardUpdate = useCallback(() => {
    refreshCards();
  }, [refreshCards]);

  return (
    <div style={{ padding: "24px", height: "100vh", backgroundColor: "#fafafa" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "24px",
      }}>
        <h1 style={{ 
          margin: "0", 
          fontSize: "24px", 
          fontWeight: "600",
          color: "#333",
        }}>
          {board.name}
        </h1>
        <button
          onClick={refreshCards}
          style={{
            padding: "8px 16px",
            backgroundColor: "#4a90e2",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          Refresh Cards
        </button>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "16px",
        height: "calc(100vh - 120px)",
        alignItems: "start",
      }}>
        <Column
          title="Todo"
          columnType="todo"
          cards={getCardsForColumn("todo")}
          onCardUpdate={handleCardUpdate}
        />
        <Column
          title="Doing"
          columnType="doing"
          cards={getCardsForColumn("doing")}
          onCardUpdate={handleCardUpdate}
        />
        <Column
          title="Done"
          columnType="done"
          cards={getCardsForColumn("done")}
          onCardUpdate={handleCardUpdate}
        />
      </div>
    </div>
  );
}