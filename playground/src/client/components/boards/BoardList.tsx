import React, { useState, useEffect } from "react";
import { getBoards, deleteBoard } from "../../api/boards";
import { BoardCard } from "./BoardCard";
import { CreateBoard } from "./CreateBoard";
import { EmptyState } from "../common/EmptyState";
import { LoadingSpinner } from "../common/LoadingSpinner";
import type { Board } from "../../types";

interface BoardListProps {
  navigateTo: (view: 'login' | 'signup' | 'boards' | 'board', boardId?: string) => void;
}

export function BoardList({ navigateTo }: BoardListProps): JSX.Element {
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchBoards = async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await getBoards();
      setBoards(data);
    } catch (err) {
      setError("Error loading boards. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBoards();

    // Listen for board creation events
    const handleBoardCreated = () => {
      fetchBoards();
    };
    window.addEventListener("board-created", handleBoardCreated);

    return () => {
      window.removeEventListener("board-created", handleBoardCreated);
    };
  }, []);

  const handleBoardClick = (boardId: string) => {
    navigateTo('board', boardId);
  };

  const handleDeleteBoard = async (boardId: string) => {
    try {
      await deleteBoard(boardId);
      setBoards(boards.filter(board => board.id !== boardId));
    } catch (err) {
      setError("Failed to delete board. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: "24px" }}>
        <LoadingSpinner label="Loading boards..." testId="board-list-loading" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        <p style={{ color: "#ff4444" }}>{error}</p>
        <button
          onClick={fetchBoards}
          style={{
            marginTop: "16px",
            padding: "8px 16px",
            border: "1px solid #4CAF50",
            borderRadius: "4px",
            background: "white",
            color: "#4CAF50",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "24px" }}>My Boards</h1>

      <CreateBoard />

      {boards.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No boards yet"
          message="Create your first board to get started"
          testId="board-list-empty"
        />
      ) : (
        <div>
          {boards.map(board => (
            <BoardCard
              key={board.id}
              board={board}
              onDelete={handleDeleteBoard}
              onClick={handleBoardClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
