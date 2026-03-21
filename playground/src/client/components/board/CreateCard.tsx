import { useState } from "react";
import { createCard } from "../../api/cards";
import type { CardColumn } from "../../types";

interface CreateCardProps {
  boardId: string;
  column: CardColumn;
  position: number;
  onCardCreated: () => void;
}

export function CreateCard({ boardId, column, position, onCardCreated }: CreateCardProps): JSX.Element {
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const resetForm = (): void => {
    setTitle("");
    setDescription("");
    setError("");
    setIsFormVisible(false);
  };

  const handleSubmit = async (): Promise<void> => {
    setError("");
    
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setIsCreating(true);
    
    try {
      await createCard({
        title: title.trim(),
        description: description.trim(),
        boardId,
        column,
        position,
      });
      
      resetForm();
      onCardCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create card");
    } finally {
      setIsCreating(false);
    }
  };

  if (!isFormVisible) {
    return (
      <button
        data-testid="add-card-button"
        onClick={() => setIsFormVisible(true)}
        style={{
          width: "100%",
          padding: "8px",
          backgroundColor: "transparent",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "14px",
          color: "#666",
          textAlign: "left",
          transition: "background-color 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#e0e0e0";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        + Add a card
      </button>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "8px",
        padding: "12px",
        marginBottom: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
      }}
    >
      <input
        type="text"
        placeholder="Enter card title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{
          width: "100%",
          padding: "8px",
          border: "1px solid #ddd",
          borderRadius: "4px",
          fontSize: "14px",
          marginBottom: "8px",
          outline: "none",
        }}
        autoFocus
      />
      
      <textarea
        placeholder="Add a description (optional)..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{
          width: "100%",
          padding: "8px",
          border: "1px solid #ddd",
          borderRadius: "4px",
          fontSize: "14px",
          marginBottom: "8px",
          minHeight: "60px",
          resize: "vertical",
          outline: "none",
        }}
      />
      
      {error && (
        <div style={{ color: "#d32f2f", fontSize: "12px", marginBottom: "8px" }}>
          {error}
        </div>
      )}
      
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          data-testid="create-card-submit"
          onClick={handleSubmit}
          disabled={isCreating}
          style={{
            padding: "6px 12px",
            backgroundColor: "#1976d2",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            fontSize: "14px",
            cursor: isCreating ? "not-allowed" : "pointer",
            opacity: isCreating ? 0.7 : 1,
          }}
        >
          {isCreating ? "Creating..." : "Add card"}
        </button>
        
        <button
          data-testid="create-card-cancel"
          onClick={resetForm}
          disabled={isCreating}
          style={{
            padding: "6px 12px",
            backgroundColor: "transparent",
            color: "#666",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}