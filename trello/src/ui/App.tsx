import { useState, useEffect, useCallback, useRef } from "react";
import type { Column, Card } from "./api.ts";
import * as api from "./api.ts";
import { CardModal } from "./CardModal.tsx";

interface ModalState {
  open: boolean;
  card: Card | null;
  columnId: string;
}

export function App(): React.ReactElement {
  const [columns, setColumns] = useState<Column[]>([]);
  const [modal, setModal] = useState<ModalState>({ open: false, card: null, columnId: "" });
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnTitle, setEditingColumnTitle] = useState("");
  const columnInputRef = useRef<HTMLInputElement>(null);

  const loadBoard = useCallback(async (): Promise<void> => {
    const { columns: cols } = await api.fetchColumns();
    setColumns(cols);
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (editingColumnId && columnInputRef.current) {
      columnInputRef.current.focus();
      columnInputRef.current.select();
    }
  }, [editingColumnId]);

  // --- Column management ---

  async function handleAddColumn(): Promise<void> {
    await api.createColumn("New Column");
    await loadBoard();
  }

  function startEditColumn(col: Column): void {
    setEditingColumnId(col.id);
    setEditingColumnTitle(col.title);
  }

  async function commitColumnRename(): Promise<void> {
    if (!editingColumnId) return;
    const trimmed = editingColumnTitle.trim();
    if (trimmed) {
      await api.updateColumn(editingColumnId, trimmed);
    }
    setEditingColumnId(null);
    await loadBoard();
  }

  async function handleDeleteColumn(id: string): Promise<void> {
    const col = columns.find((c) => c.id === id);
    const msg = col && col.cards.length > 0
      ? `Delete "${col.title}" and its ${col.cards.length} card(s)?`
      : `Delete "${col?.title}"?`;
    if (!window.confirm(msg)) return;
    await api.deleteColumn(id);
    await loadBoard();
  }

  // --- Card modal ---

  function openAddCard(columnId: string): void {
    setModal({ open: true, card: null, columnId });
  }

  function openEditCard(card: Card): void {
    setModal({ open: true, card, columnId: card.column_id });
  }

  async function handleSaveCard(title: string, description: string): Promise<void> {
    if (modal.card) {
      await api.updateCard(modal.card.id, { title, description });
    } else {
      await api.createCard(title, modal.columnId, description);
    }
    setModal({ open: false, card: null, columnId: "" });
    await loadBoard();
  }

  async function handleDeleteCard(): Promise<void> {
    if (!modal.card) return;
    await api.deleteCard(modal.card.id);
    setModal({ open: false, card: null, columnId: "" });
    await loadBoard();
  }

  // --- Drag and drop ---

  const dragCard = useRef<{ cardId: string; sourceColumnId: string } | null>(null);

  function handleDragStart(e: React.DragEvent, card: Card): void {
    dragCard.current = { cardId: card.id, sourceColumnId: card.column_id };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.id);
    (e.target as HTMLElement).classList.add("dragging");
  }

  function handleDragEnd(e: React.DragEvent): void {
    (e.target as HTMLElement).classList.remove("dragging");
    dragCard.current = null;
    // Remove all drop indicators
    document.querySelectorAll(".drop-above, .drop-below, .drop-zone-active").forEach((el) => {
      el.classList.remove("drop-above", "drop-below", "drop-zone-active");
    });
  }

  function handleDragOver(e: React.DragEvent): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleCardDragOver(e: React.DragEvent, _card: Card): void {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const target = (e.target as HTMLElement).closest(".card") as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    // Remove existing indicators from siblings
    target.parentElement?.querySelectorAll(".drop-above, .drop-below").forEach((el) => {
      el.classList.remove("drop-above", "drop-below");
    });

    if (e.clientY < midY) {
      target.classList.add("drop-above");
    } else {
      target.classList.add("drop-below");
    }
  }

  function handleCardDragLeave(e: React.DragEvent): void {
    const target = (e.target as HTMLElement).closest(".card");
    target?.classList.remove("drop-above", "drop-below");
  }

  function handleColumnDragOver(e: React.DragEvent): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const target = (e.target as HTMLElement).closest(".column-cards");
    target?.classList.add("drop-zone-active");
  }

  function handleColumnDragLeave(e: React.DragEvent): void {
    const target = (e.target as HTMLElement).closest(".column-cards");
    if (target && !target.contains(e.relatedTarget as Node)) {
      target.classList.remove("drop-zone-active");
    }
  }

  async function handleDropOnCard(e: React.DragEvent, targetCard: Card, columnId: string): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    const target = (e.target as HTMLElement).closest(".card") as HTMLElement | null;
    target?.classList.remove("drop-above", "drop-below");
    target?.parentElement?.querySelector(".drop-zone-active")?.classList.remove("drop-zone-active");

    if (!dragCard.current) return;
    const { cardId } = dragCard.current;
    if (cardId === targetCard.id) return;

    const rect = target?.getBoundingClientRect();
    const dropAbove = rect ? e.clientY < rect.top + rect.height / 2 : false;
    const newPosition = dropAbove ? targetCard.position : targetCard.position + 1;

    await api.updateCard(cardId, { columnId, position: newPosition });
    await loadBoard();
  }

  async function handleDropOnColumn(e: React.DragEvent, columnId: string): Promise<void> {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest(".column-cards");
    target?.classList.remove("drop-zone-active");

    if (!dragCard.current) return;
    const { cardId } = dragCard.current;

    // Drop at end of column
    const col = columns.find((c) => c.id === columnId);
    const newPosition = col ? col.cards.length : 0;
    await api.updateCard(cardId, { columnId, position: newPosition });
    await loadBoard();
  }

  // --- Render ---

  if (columns.length === 0) {
    return (
      <div className="empty-board">
        <p>Add a column to get started</p>
        <button className="btn-primary" onClick={handleAddColumn}>
          + Add Column
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="board">
        {columns.map((col) => (
          <div key={col.id} className="column">
            <div className="column-header">
              {editingColumnId === col.id ? (
                <input
                  ref={columnInputRef}
                  className="column-title-input"
                  value={editingColumnTitle}
                  onChange={(e) => setEditingColumnTitle(e.target.value)}
                  onBlur={() => void commitColumnRename()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitColumnRename();
                    if (e.key === "Escape") setEditingColumnId(null);
                  }}
                />
              ) : (
                <h3
                  className="column-title"
                  onClick={() => startEditColumn(col)}
                  title="Click to rename"
                >
                  {col.title}
                </h3>
              )}
              <button
                className="btn-icon btn-delete-col"
                onClick={() => void handleDeleteColumn(col.id)}
                title="Delete column"
              >
                &times;
              </button>
            </div>

            <div
              className="column-cards"
              onDragOver={handleColumnDragOver}
              onDragLeave={handleColumnDragLeave}
              onDrop={(e) => void handleDropOnColumn(e, col.id)}
            >
              {col.cards.length === 0 && (
                <p className="empty-column-msg">No cards yet</p>
              )}
              {col.cards.map((card) => (
                <div
                  key={card.id}
                  className="card"
                  draggable
                  onDragStart={(e) => handleDragStart(e, card)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleCardDragOver(e, card)}
                  onDragLeave={handleCardDragLeave}
                  onDrop={(e) => void handleDropOnCard(e, card, col.id)}
                  onClick={() => openEditCard(card)}
                >
                  <p className="card-title">{card.title}</p>
                  {card.description && (
                    <p className="card-desc">
                      {card.description.length > 80
                        ? card.description.slice(0, 80) + "..."
                        : card.description}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button
              className="btn-add-card"
              onClick={() => openAddCard(col.id)}
            >
              + Add a card
            </button>
          </div>
        ))}

        <div className="column column-add">
          <button className="btn-add-column" onClick={handleAddColumn}>
            + Add another column
          </button>
        </div>
      </div>

      {modal.open && (
        <CardModal
          card={modal.card}
          columnId={modal.columnId}
          onSave={(t, d) => void handleSaveCard(t, d)}
          onDelete={modal.card ? () => void handleDeleteCard() : null}
          onClose={() => setModal({ open: false, card: null, columnId: "" })}
        />
      )}
    </>
  );
}
