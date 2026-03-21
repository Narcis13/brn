import { useState, useEffect } from "react";
import { updateCard } from "../../api/cards";
import type { Card } from "../../types";

interface EditCardProps {
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function EditCard({ card, isOpen, onClose, onUpdate }: EditCardProps): JSX.Element | null {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when card changes
  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description || "");
    setError("");
  }, [card]);

  const handleSave = async (): Promise<void> => {
    setError("");
    
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setIsSaving(true);
    
    try {
      await updateCard(card.id, {
        title: title.trim(),
        description: description.trim(),
      });
      
      onUpdate();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update card");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    // Prevent form submission, handle save through button click
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div
        data-testid="modal-backdrop"
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
      />
      
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: "#fff",
          borderRadius: "8px",
          padding: "24px",
          width: "90%",
          maxWidth: "500px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          zIndex: 1001,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 16px 0", fontSize: "20px", fontWeight: "600" }}>
          Edit Card
        </h2>
        
        <form data-testid="edit-card-form" onSubmit={handleFormSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="card-title"
              style={{
                display: "block",
                marginBottom: "4px",
                fontSize: "14px",
                fontWeight: "500",
                color: "#333",
              }}
            >
              Title
            </label>
            <input
              id="card-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "14px",
                outline: "none",
              }}
              autoFocus
            />
          </div>
          
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="card-description"
              style={{
                display: "block",
                marginBottom: "4px",
                fontSize: "14px",
                fontWeight: "500",
                color: "#333",
              }}
            >
              Description
            </label>
            <textarea
              id="card-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description (optional)..."
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "14px",
                minHeight: "100px",
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>
          
          {error && (
            <div style={{ color: "#d32f2f", fontSize: "14px", marginBottom: "16px" }}>
              {error}
            </div>
          )}
          
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              data-testid="cancel-edit-button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: "8px 16px",
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
            
            <button
              type="button"
              data-testid="save-card-button"
              onClick={handleSave}
              disabled={isSaving}
              style={{
                padding: "8px 16px",
                backgroundColor: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                fontSize: "14px",
                cursor: isSaving ? "not-allowed" : "pointer",
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}