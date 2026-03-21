import React, { useState, useEffect } from "react";
import { getBoards, deleteBoard } from "../../api/boards";
import { BoardCard } from "./BoardCard";
import { CreateBoard } from "./CreateBoard";
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
      <div style={{ padding: "24px", textAlign: "center" }}>
        <p>Loading boards...</p>
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
        <div style={{
          textAlign: "center",
          padding: "60px 24px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
        }}>
          <h2 style={{ marginBottom: "16px", color: "#666" }}>No boards yet</h2>
          <p style={{ color: "#999" }}>Create your first board to get started</p>
        </div>
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