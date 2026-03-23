import { useState, useEffect, useRef } from "react";
import type { Card } from "./api.ts";

interface CardModalProps {
  card: Card | null;
  columnId: string;
  onSave: (title: string, description: string) => void;
  onDelete: (() => void) | null;
  onClose: () => void;
}

export function CardModal({ card, columnId, onSave, onDelete, onClose }: CardModalProps): React.ReactElement {
  const [title, setTitle] = useState(card?.title ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title cannot be empty");
      return;
    }
    onSave(trimmed, description.trim());
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{card ? "Edit Card" : "Add Card"}</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="card-title">Title</label>
          <input
            id="card-title"
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError("");
            }}
            placeholder="Enter card title..."
          />
          {error && <p className="field-error">{error}</p>}

          <label htmlFor="card-desc">Description</label>
          <textarea
            id="card-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            rows={4}
          />

          <div className="modal-actions">
            <button type="submit" className="btn-primary">
              Save
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            {onDelete && (
              <button type="button" className="btn-danger" onClick={onDelete}>
                Delete Card
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
