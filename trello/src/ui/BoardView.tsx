import {
  useState,
  useEffect,
  useCallback,
  useDeferredValue,
  useRef,
} from "react";
import type { CSSProperties } from "react";
import type { Column, BoardCard, CardDetail, Label } from "./api.ts";
import * as api from "./api.ts";
import { renderInlineContent } from "./render-inline.tsx";
import { getDueBadge } from "./card-utils.ts";
import {
  buildVisibleCardIds,
  cardIsVisible,
  countVisibleCards,
  mergeLabels,
  normalizeSearchQuery,
  reorderColumnIds,
  reorderColumns,
} from "./board-utils.ts";
import { CardModal } from "./CardModal.tsx";
import { CalendarView } from "./CalendarView.tsx";

export type ViewMode = "board" | "calendar";

interface BoardViewProps {
  boardId: string;
}

interface ModalState {
  open: boolean;
  card: BoardCard | null;
  columnId: string;
}

const SEARCH_DEBOUNCE_MS = 250;

function toBoardCard(card: BoardCard | CardDetail): BoardCard {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    position: card.position,
    column_id: card.column_id,
    created_at: card.created_at,
    due_date: card.due_date,
    start_date: card.start_date,
    checklist: card.checklist,
    updated_at: card.updated_at,
    labels: card.labels,
    checklist_total: card.checklist_total,
    checklist_done: card.checklist_done,
  };
}

function replaceCardInColumns(
  columns: Column[],
  nextCard: BoardCard | CardDetail
): Column[] {
  const summary = toBoardCard(nextCard);

  return columns.map((column) => {
    const remainingCards = column.cards.filter((card) => card.id !== summary.id);
    if (column.id !== summary.column_id) {
      if (remainingCards.length === column.cards.length) {
        return column;
      }
      return { ...column, cards: remainingCards };
    }

    return {
      ...column,
      cards: [...remainingCards, summary].sort(
        (left, right) => left.position - right.position
      ),
    };
  });
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^- /gm, "");
}

function truncateDescription(description: string, cardId: string): React.ReactNode {
  const trimmed = description.trim();
  const plainLength = stripInlineMarkdown(trimmed).length;
  if (plainLength <= 88) {
    return renderInlineContent(trimmed, `desc-${cardId}`);
  }
  // Truncate the raw text, then render inline
  const truncated = trimmed.slice(0, 88);
  return <>{renderInlineContent(truncated, `desc-${cardId}`)}...</>;
}

function clearCardDropIndicators(): void {
  document
    .querySelectorAll(".drop-above, .drop-below, .drop-zone-active")
    .forEach((element) => {
      element.classList.remove("drop-above", "drop-below", "drop-zone-active");
    });
}

function clearColumnDropIndicators(): void {
  document
    .querySelectorAll(
      ".column-drop-before, .column-drop-after, .column-header-dragging"
    )
    .forEach((element) => {
      element.classList.remove(
        "column-drop-before",
        "column-drop-after",
        "column-header-dragging"
      );
    });
}

export function BoardView({ boardId }: BoardViewProps): React.ReactElement {
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [columns, setColumns] = useState<Column[]>([]);
  const [boardLabels, setBoardLabels] = useState<Label[]>([]);
  const [modal, setModal] = useState<ModalState>({
    open: false,
    card: null,
    columnId: "",
  });
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnTitle, setEditingColumnTitle] = useState("");
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const [activeLabelId, setActiveLabelId] = useState<string | null>(null);
  const [remoteSearchIds, setRemoteSearchIds] = useState<Set<string> | null>(
    null
  );
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [searchError, setSearchError] = useState("");
  const columnInputRef = useRef<HTMLInputElement>(null);
  const dragCard = useRef<{
    cardId: string;
    sourceColumnId: string;
  } | null>(null);
  const dragColumnId = useRef<string | null>(null);

  const loadBoard = useCallback(async (): Promise<void> => {
    const [{ columns: nextColumns }, { labels: nextLabels }] = await Promise.all([
      api.fetchColumns(boardId),
      api.fetchBoardLabels(boardId),
    ]);

    setColumns(nextColumns);
    setBoardLabels(nextLabels);
  }, [boardId]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (editingColumnId && columnInputRef.current) {
      columnInputRef.current.focus();
      columnInputRef.current.select();
    }
  }, [editingColumnId]);

  useEffect(() => {
    const normalizedQuery = normalizeSearchQuery(deferredSearchText);

    if (normalizedQuery === "") {
      setRemoteSearchIds(null);
      setIsSearchPending(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();
    setRemoteSearchIds(null);
    setIsSearchPending(true);
    setSearchError("");

    const timeoutId = window.setTimeout(() => {
      void api
        .searchBoard(
          boardId,
          {
            q: normalizedQuery,
            labelId: activeLabelId ?? undefined,
          },
          controller.signal
        )
        .then(({ cards }) => {
          if (controller.signal.aborted) {
            return;
          }

          setRemoteSearchIds(new Set(cards.map((card) => card.id)));
          setIsSearchPending(false);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          console.error(error);
          setRemoteSearchIds(null);
          setIsSearchPending(false);
          setSearchError(
            "Description search is unavailable right now. Showing in-memory matches only."
          );
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [activeLabelId, boardId, columns, deferredSearchText]);

  async function handleAddColumn(): Promise<void> {
    await api.createColumn(boardId, "New Column");
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
      await api.updateColumn(boardId, editingColumnId, trimmed);
    }

    setEditingColumnId(null);
    await loadBoard();
  }

  async function handleDeleteColumn(id: string): Promise<void> {
    const col = columns.find((column) => column.id === id);
    const msg =
      col && col.cards.length > 0
        ? `Delete "${col.title}" and its ${col.cards.length} card(s)?`
        : `Delete "${col?.title}"?`;
    if (!window.confirm(msg)) return;

    await api.deleteColumn(boardId, id);
    await loadBoard();
  }

  function openAddCard(columnId: string): void {
    setModal({ open: true, card: null, columnId });
  }

  function openEditCard(card: BoardCard): void {
    setModal({ open: true, card, columnId: card.column_id });
  }

  async function handleCreateCard(
    title: string,
    description: string
  ): Promise<void> {
    await api.createCard(boardId, title, modal.columnId, description);
    setModal({ open: false, card: null, columnId: "" });
    await loadBoard();
  }

  const handleCardUpdated = useCallback(
    (card: BoardCard | CardDetail): void => {
      setColumns((current) => replaceCardInColumns(current, card));
      setBoardLabels((current) => mergeLabels(current, card.labels));
    },
    []
  );

  async function handleDeleteCard(): Promise<void> {
    if (!modal.card) return;

    await api.deleteCard(boardId, modal.card.id);
    setModal({ open: false, card: null, columnId: "" });
    await loadBoard();
  }

  function handleDragStart(e: React.DragEvent, card: BoardCard): void {
    dragCard.current = { cardId: card.id, sourceColumnId: card.column_id };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.id);
    (e.target as HTMLElement).classList.add("dragging");
  }

  function handleDragEnd(e: React.DragEvent): void {
    (e.target as HTMLElement).classList.remove("dragging");
    dragCard.current = null;
    clearCardDropIndicators();
  }

  function handleCardDragOver(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const target = (e.target as HTMLElement).closest(".card") as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    target.parentElement
      ?.querySelectorAll(".drop-above, .drop-below")
      .forEach((element) => {
        element.classList.remove("drop-above", "drop-below");
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

  async function handleDropOnCard(
    e: React.DragEvent,
    targetCard: BoardCard,
    columnId: string
  ): Promise<void> {
    e.preventDefault();
    e.stopPropagation();

    const target = (e.target as HTMLElement).closest(".card") as HTMLElement | null;
    target?.classList.remove("drop-above", "drop-below");
    target?.parentElement
      ?.querySelector(".drop-zone-active")
      ?.classList.remove("drop-zone-active");

    if (!dragCard.current) return;

    const { cardId } = dragCard.current;
    if (cardId === targetCard.id) return;

    const rect = target?.getBoundingClientRect();
    const dropAbove = rect ? e.clientY < rect.top + rect.height / 2 : false;
    const newPosition = dropAbove ? targetCard.position : targetCard.position + 1;

    await api.updateCard(boardId, cardId, { columnId, position: newPosition });
    await loadBoard();
  }

  async function handleDropOnColumn(
    e: React.DragEvent,
    columnId: string
  ): Promise<void> {
    e.preventDefault();

    const target = (e.target as HTMLElement).closest(".column-cards");
    target?.classList.remove("drop-zone-active");

    if (!dragCard.current) return;

    const { cardId } = dragCard.current;
    const column = columns.find((entry) => entry.id === columnId);
    const newPosition = column ? column.cards.length : 0;

    await api.updateCard(boardId, cardId, { columnId, position: newPosition });
    await loadBoard();
  }

  function handleColumnHeaderDragStart(
    e: React.DragEvent,
    columnId: string
  ): void {
    if (editingColumnId === columnId) {
      e.preventDefault();
      return;
    }

    dragColumnId.current = columnId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", columnId);
    (e.currentTarget as HTMLElement).classList.add("column-header-dragging");
  }

  function handleColumnHeaderDragOver(
    e: React.DragEvent,
    targetColumnId: string
  ): void {
    if (!dragColumnId.current) {
      return;
    }

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const targetColumn = (e.currentTarget as HTMLElement).closest(
      ".column"
    ) as HTMLElement | null;
    if (!targetColumn) {
      return;
    }

    document
      .querySelectorAll(".column-drop-before, .column-drop-after")
      .forEach((element) => {
        if (element !== targetColumn) {
          element.classList.remove("column-drop-before", "column-drop-after");
        }
      });

    if (dragColumnId.current === targetColumnId) {
      targetColumn.classList.remove("column-drop-before", "column-drop-after");
      return;
    }

    const rect = targetColumn.getBoundingClientRect();
    const placement = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
    targetColumn.classList.remove("column-drop-before", "column-drop-after");
    targetColumn.classList.add(
      placement === "before" ? "column-drop-before" : "column-drop-after"
    );
  }

  function handleColumnHeaderDragLeave(e: React.DragEvent): void {
    const targetColumn = (e.currentTarget as HTMLElement).closest(
      ".column"
    ) as HTMLElement | null;

    if (
      targetColumn &&
      e.relatedTarget instanceof Node &&
      targetColumn.contains(e.relatedTarget)
    ) {
      return;
    }

    targetColumn?.classList.remove("column-drop-before", "column-drop-after");
  }

  async function handleColumnHeaderDrop(
    e: React.DragEvent,
    targetColumnId: string
  ): Promise<void> {
    if (!dragColumnId.current) {
      return;
    }

    e.preventDefault();

    const draggedId = dragColumnId.current;
    const targetColumn = (e.currentTarget as HTMLElement).closest(
      ".column"
    ) as HTMLElement | null;
    const rect = targetColumn?.getBoundingClientRect();
    const placement =
      rect && e.clientX >= rect.left + rect.width / 2 ? "after" : "before";

    clearColumnDropIndicators();
    dragColumnId.current = null;

    if (draggedId === targetColumnId) {
      return;
    }

    const nextOrder = reorderColumnIds(columns, draggedId, targetColumnId, placement);
    const currentOrder = columns.map((column) => column.id);
    if (nextOrder.join(",") === currentOrder.join(",")) {
      return;
    }

    const previousColumns = columns;
    setColumns(reorderColumns(columns, nextOrder));

    try {
      await api.reorderColumns(boardId, nextOrder);
    } catch (error: unknown) {
      console.error(error);
      setColumns(previousColumns);
      await loadBoard();
    }
  }

  function handleColumnHeaderDragEnd(e: React.DragEvent): void {
    (e.currentTarget as HTMLElement).classList.remove("column-header-dragging");
    dragColumnId.current = null;
    clearColumnDropIndicators();
  }

  function toggleLabelFilter(labelId: string): void {
    setActiveLabelId((current) => (current === labelId ? null : labelId));
  }

  function clearFilters(): void {
    setSearchText("");
    setActiveLabelId(null);
    setRemoteSearchIds(null);
    setSearchError("");
  }

  const visibleCardIds = buildVisibleCardIds(
    columns,
    searchText,
    activeLabelId,
    remoteSearchIds
  );
  const totalCardCount = columns.reduce(
    (count, column) => count + column.cards.length,
    0
  );
  const visibleCardCount = countVisibleCards(columns, visibleCardIds);
  const hasActiveFilters = searchText.trim() !== "" || activeLabelId !== null;
  const showNoResults = hasActiveFilters && totalCardCount > 0 && visibleCardCount === 0;

  if (columns.length === 0) {
    return (
      <div className="empty-board">
        <p>Add a column to get started</p>
        <button className="btn-primary" onClick={() => void handleAddColumn()}>
          + Add Column
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="board-shell">
        <div className="board-controls">
          <div className="board-view-tabs">
            <button
              className={`board-view-tab${viewMode === "board" ? " active" : ""}`}
              onClick={() => setViewMode("board")}
            >
              Board
            </button>
            <span className="board-view-divider">|</span>
            <button
              className={`board-view-tab${viewMode === "calendar" ? " active" : ""}`}
              onClick={() => setViewMode("calendar")}
            >
              Calendar
            </button>
          </div>

          {viewMode === "board" && (
            <>
              <div className="board-search-row">
                <input
                  className="board-search-input"
                  type="search"
                  placeholder="Search cards by title or description"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                {(isSearchPending || hasActiveFilters) && (
                  <p className="board-search-status">
                    {isSearchPending
                      ? "Searching descriptions..."
                      : `${visibleCardCount} match${visibleCardCount === 1 ? "" : "es"}`}
                  </p>
                )}
              </div>

              {(boardLabels.length > 0 || hasActiveFilters) && (
                <div className="board-filter-row">
                  {boardLabels.map((label) => {
                const active = activeLabelId === label.id;
                const style: CSSProperties = active
                  ? {
                      backgroundColor: label.color,
                      borderColor: label.color,
                      color: "#fff",
                    }
                  : {
                      borderColor: `${label.color}66`,
                    };

                return (
                  <button
                    key={label.id}
                    type="button"
                    className={`board-filter-pill${active ? " active" : ""}`}
                    style={style}
                    onClick={() => toggleLabelFilter(label.id)}
                  >
                    <span
                      className="board-filter-pill-swatch"
                      style={{ backgroundColor: label.color }}
                    />
                    <span>{label.name}</span>
                  </button>
                );
              })}

              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn-text board-clear-filters"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              )}
            </div>
              )}

              {searchError !== "" && (
                <p className="board-search-error">{searchError}</p>
              )}
            </>
          )}
        </div>

        <div className="board-canvas">
          {viewMode === "board" ? (
            <>
              {showNoResults && (
                <div className="board-no-results">
                  <p>No cards match your search.</p>
                </div>
              )}

              <div className="board">
                {columns.map((col) => (
              <div key={col.id} className="column">
                <div
                  className="column-header"
                  draggable={editingColumnId !== col.id}
                  onDragStart={(e) => handleColumnHeaderDragStart(e, col.id)}
                  onDragOver={(e) => handleColumnHeaderDragOver(e, col.id)}
                  onDragLeave={handleColumnHeaderDragLeave}
                  onDrop={(e) => void handleColumnHeaderDrop(e, col.id)}
                  onDragEnd={handleColumnHeaderDragEnd}
                >
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

                  {col.cards.map((card) => {
                    const visible = cardIsVisible(card, visibleCardIds);
                    const dueBadge = getDueBadge(card.due_date);
                    const checklistPercent =
                      card.checklist_total > 0
                        ? Math.round(
                            (card.checklist_done / card.checklist_total) * 100
                          )
                        : 0;

                    return (
                      <div
                        key={card.id}
                        className={`card${visible ? "" : " card-hidden"}`}
                        draggable
                        aria-hidden={!visible}
                        onDragStart={(e) => handleDragStart(e, card)}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleCardDragOver}
                        onDragLeave={handleCardDragLeave}
                        onDrop={(e) => void handleDropOnCard(e, card, col.id)}
                        onClick={() => openEditCard(card)}
                      >
                        {card.labels.length > 0 && (
                          <div className="card-label-dots">
                            {card.labels.map((label) => (
                              <span
                                key={label.id}
                                className="card-label-dot"
                                style={{ backgroundColor: label.color }}
                                title={label.name}
                              />
                            ))}
                          </div>
                        )}

                        <p className="card-title">{card.title}</p>

                        {card.description.trim() !== "" && (
                          <p className="card-desc">
                            {truncateDescription(card.description, card.id)}
                          </p>
                        )}

                        {(dueBadge || card.checklist_total > 0) && (
                          <div className="card-meta">
                            {dueBadge && (
                              <span className={`card-due-badge due-${dueBadge.tone}`}>
                                {dueBadge.label}
                              </span>
                            )}

                            {card.checklist_total > 0 && (
                              <div className="card-checklist-summary">
                                <span className="card-checklist-count">
                                  {card.checklist_done}/{card.checklist_total}
                                </span>
                                <span className="card-progress-track">
                                  <span
                                    className="card-progress-fill"
                                    style={{ width: `${checklistPercent}%` }}
                                  />
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button className="btn-add-card" onClick={() => openAddCard(col.id)}>
                  + Add a card
                </button>
              </div>
            ))}

            <div className="column column-add">
              <button
                className="btn-add-column"
                onClick={() => void handleAddColumn()}
              >
                + Add another column
              </button>
            </div>
          </div>
            </>
          ) : (
            <CalendarView 
              boardId={boardId} 
              columns={columns}
              onCardClick={openEditCard} 
              onCardCreated={() => void loadBoard()}
            />
          )}
        </div>
      </div>

      {modal.open && (
        <CardModal
          boardId={boardId}
          card={modal.card}
          columnId={modal.columnId}
          onCreate={handleCreateCard}
          onDelete={modal.card ? () => handleDeleteCard() : null}
          onCardUpdated={handleCardUpdated}
          onClose={() => setModal({ open: false, card: null, columnId: "" })}
        />
      )}
    </>
  );
}
