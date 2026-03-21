import { useState } from "react";
import { updateBoard } from "../../api/boards";
import type { Board } from "../../types";

interface BoardHeaderProps {
  board: Board;
  onBack: () => void;
  onBoardUpdate: (board: Board) => void;
}

export function BoardHeader({ board, onBack, onBoardUpdate }: BoardHeaderProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(board.name);
  const [isSaving, setIsSaving] = useState(false);

  const handleNameClick = () => {
    setEditName(board.name);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditName(board.name);
    setIsEditing(false);
  };

  const handleSave = async () => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      const updated = await updateBoard(board.id, { name: trimmed });
      onBoardUpdate(updated);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      handleCancel();
    } else if (e.key === "Enter") {
      await handleSave();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          onClick={onBack}
          style={{
            padding: "6px 12px",
            backgroundColor: "#f5f5f5",
            color: "#333",
            border: "1px solid #ddd",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          ← Back
        </button>

        {isEditing ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{
                fontSize: "24px",
                fontWeight: "600",
                color: "#333",
                border: "1px solid #4a90e2",
                borderRadius: "4px",
                padding: "2px 8px",
                outline: "none",
              }}
            />
            <button
              onClick={handleSave}
              disabled={isSaving}
              style={{
                padding: "4px 10px",
                backgroundColor: "#4a90e2",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "500",
              }}
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              style={{
                padding: "4px 10px",
                backgroundColor: "#f5f5f5",
                color: "#333",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "500",
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <h1
            onClick={handleNameClick}
            title="Click to edit board name"
            style={{
              margin: "0",
              fontSize: "24px",
              fontWeight: "600",
              color: "#333",
              cursor: "pointer",
              borderRadius: "4px",
              padding: "2px 4px",
            }}
          >
            {board.name}
          </h1>
        )}
      </div>
    </div>
  );
}
