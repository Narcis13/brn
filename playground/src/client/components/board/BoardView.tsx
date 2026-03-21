import { useState, useEffect, useCallback } from "react";
import { Column } from "./Column";
import { getBoard } from "../../api/boards";
import { useCards } from "../../hooks/useCards";
import type { Board, CardColumn } from "../../types";

interface BoardViewProps {
  boardId: string;
}

export function BoardView({ boardId }: BoardViewProps): JSX.Element {
  const [board, setBoard] = useState<Board | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
  const { cards, loading: cardsLoading, error: cardsError, refetch: refreshCards } = useCards(boardId);

  useEffect(() => {
    async function loadBoard() {
      try {
        setBoardLoading(true);
        setBoardError(null);
        const boardData = await getBoard(boardId);
        setBoard(boardData);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setBoardError(`Error loading board: ${message}`);
      } finally {
        setBoardLoading(false);
      }
    }

    loadBoard();
  }, [boardId]);

  const loading = boardLoading || cardsLoading;
  const error = boardError || cardsError;

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
    (column: CardColumn) => {
      return cards.filter((card) => card.column === column);
    },
    [cards]
  );

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
          boardId={boardId}
          onCardUpdate={handleCardUpdate}
        />
        <Column
          title="Doing"
          columnType="doing"
          cards={getCardsForColumn("doing")}
          boardId={boardId}
          onCardUpdate={handleCardUpdate}
        />
        <Column
          title="Done"
          columnType="done"
          cards={getCardsForColumn("done")}
          boardId={boardId}
          onCardUpdate={handleCardUpdate}
        />
      </div>
    </div>
  );
}