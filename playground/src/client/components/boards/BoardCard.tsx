import React, { useState } from "react";
import type { Board } from "../../types";

interface BoardCardProps {
  board: Board;
  onDelete: (id: string) => void;
  onClick: (id: string) => void;
}

export function BoardCard({ board, onDelete, onClick }: BoardCardProps): JSX.Element {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm) {
      onDelete(board.id);
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div 
      className="board-card"
      onClick={() => onClick(board.id)}
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "12px",
        cursor: "pointer",
        transition: "box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "18px" }}>{board.name}</h3>
          <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>
            Created: {formatDate(board.created_at)}
          </p>
          <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>
            Updated: {formatDate(board.updated_at)}
          </p>
        </div>
        <div style={{ marginLeft: "16px" }}>
          {!showDeleteConfirm ? (
            <button
              aria-label="Delete board"
              onClick={handleDelete}
              style={{
                padding: "6px 12px",
                border: "1px solid #ff4444",
                borderRadius: "4px",
                background: "white",
                color: "#ff4444",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Delete
            </button>
          ) : (
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleDelete}
                style={{
                  padding: "6px 12px",
                  border: "none",
                  borderRadius: "4px",
                  background: "#ff4444",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Confirm
              </button>
              <button
                onClick={handleCancel}
                style={{
                  padding: "6px 12px",
                  border: "1px solid #666",
                  borderRadius: "4px",
                  background: "white",
                  color: "#666",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}