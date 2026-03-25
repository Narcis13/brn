import { useState, useEffect, useRef } from "react";
import type { Board } from "./api.ts";
import * as api from "./api.ts";

interface BoardListProps {
  onSelectBoard: (board: Board) => void;
}

export function BoardList({ onSelectBoard }: BoardListProps): React.ReactElement {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadBoards(): Promise<void> {
    try {
      const { boards: list } = await api.fetchBoards();
      setBoards(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load boards");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBoards();
  }, []);

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [creating]);

  async function handleCreateBoard(): Promise<void> {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    try {
      await api.createBoard(trimmed);
      setNewTitle("");
      setCreating(false);
      setLoading(true);
      await loadBoards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create board");
    }
  }

  async function handleDeleteBoard(
    e: React.MouseEvent,
    board: Board
  ): Promise<void> {
    e.stopPropagation();
    if (!window.confirm(`Delete "${board.title}" and all its contents?`)) return;

    try {
      await api.deleteBoard(board.id);
      setBoards((prev) => prev.filter((b) => b.id !== board.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete board");
    }
  }

  if (loading) {
    return (
      <div className="board-list-loading">
        <p>Loading boards...</p>
      </div>
    );
  }

  return (
    <div className="board-list-page">
      {error && <p className="board-list-error">{error}</p>}

      <div className="board-list-grid">
        {boards.map((board) => (
          <div
            key={board.id}
            className="board-card"
            onClick={() => onSelectBoard(board)}
          >
            <h3 className="board-card-title">{board.title}</h3>
            <p className="board-card-date">
              {new Date(board.createdAt).toLocaleDateString()}
            </p>
            <button
              className="board-card-delete"
              onClick={(e) => void handleDeleteBoard(e, board)}
              title="Delete board"
            >
              &times;
            </button>
          </div>
        ))}

        {creating ? (
          <div className="board-card board-card-new-form">
            <input
              ref={inputRef}
              type="text"
              className="board-new-input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateBoard();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewTitle("");
                }
              }}
              placeholder="Board title..."
            />
            <div className="board-new-actions">
              <button
                className="btn-primary btn-sm"
                onClick={() => void handleCreateBoard()}
              >
                Create
              </button>
              <button
                className="btn-secondary btn-sm"
                onClick={() => {
                  setCreating(false);
                  setNewTitle("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className="board-card board-card-new"
            onClick={() => setCreating(true)}
          >
            <p>+ Create new board</p>
          </div>
        )}
      </div>

      {boards.length === 0 && !creating && (
        <p className="board-list-empty">
          No boards yet. Create your first board!
        </p>
      )}
    </div>
  );
}
