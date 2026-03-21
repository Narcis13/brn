import React, { useState } from "react";
import { createBoard } from "../../api/boards";
import type { NewBoard } from "../../types";

export function CreateBoard(): JSX.Element {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();

    // Validation
    if (!trimmedName) {
      setError("Board name is required");
      return;
    }

    if (trimmedName.length < 3) {
      setError("Board name must be at least 3 characters");
      return;
    }

    setIsLoading(true);

    try {
      const newBoard: NewBoard = { name: trimmedName };
      await createBoard(newBoard);
      
      // Clear form
      setName("");
      
      // Emit event to refresh board list
      window.dispatchEvent(new CustomEvent("board-created"));
    } catch (err) {
      setError("Failed to create board. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      border: "1px solid #e0e0e0",
      borderRadius: "8px",
      padding: "24px",
      marginBottom: "24px",
      backgroundColor: "#f9f9f9",
    }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: "20px" }}>Create New Board</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "16px" }}>
          <input
            type="text"
            placeholder="Enter board name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontSize: "16px",
              boxSizing: "border-box",
            }}
          />
          {error && (
            <p style={{ 
              color: "#ff4444", 
              marginTop: "8px", 
              marginBottom: "0",
              fontSize: "14px",
            }}>
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "10px 24px",
            border: "none",
            borderRadius: "4px",
            background: isLoading ? "#999" : "#4CAF50",
            color: "white",
            fontSize: "16px",
            cursor: isLoading ? "not-allowed" : "pointer",
            width: "100%",
          }}
        >
          {isLoading ? "Creating..." : "Create Board"}
        </button>
      </form>
    </div>
  );
}