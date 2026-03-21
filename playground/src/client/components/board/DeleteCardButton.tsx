import { useState } from "react";
import { deleteCard } from "../../api/cards";

interface DeleteCardButtonProps {
  cardId: string;
  onDelete: () => void;
}

export function DeleteCardButton({ cardId, onDelete }: DeleteCardButtonProps): JSX.Element {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async (): Promise<void> => {
    setIsDeleting(true);
    setError("");
    
    try {
      await deleteCard(cardId);
      onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete card");
      setShowConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const buttonStyle: React.CSSProperties = {
    padding: "4px 8px",
    backgroundColor: "transparent",
    color: "#d32f2f",
    border: "1px solid #d32f2f",
    borderRadius: "4px",
    fontSize: "12px",
    cursor: isDeleting ? "not-allowed" : "pointer",
    opacity: isDeleting ? 0.7 : 1,
    transition: "all 0.2s",
  };

  if (showConfirm) {
    return (
      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: "#666" }}>Delete?</span>
        <button
          data-testid="confirm-delete"
          onClick={handleDelete}
          disabled={isDeleting}
          style={{
            ...buttonStyle,
            backgroundColor: "#d32f2f",
            color: "#fff",
            border: "none",
          }}
        >
          {isDeleting ? "..." : "Yes"}
        </button>
        <button
          data-testid="cancel-delete"
          onClick={() => setShowConfirm(false)}
          disabled={isDeleting}
          style={{
            ...buttonStyle,
            color: "#666",
            border: "1px solid #ddd",
          }}
        >
          No
        </button>
      </div>
    );
  }

  return (
    <>
      {error && (
        <span style={{ fontSize: "11px", color: "#d32f2f", marginRight: "8px" }}>
          {error}
        </span>
      )}
      <button
        data-testid="delete-card-button"
        onClick={() => setShowConfirm(true)}
        style={buttonStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#d32f2f";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "#d32f2f";
        }}
      >
        Delete
      </button>
    </>
  );
}