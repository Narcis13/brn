import {
  useState,
  useEffect,
  useCallback,
  useDeferredValue,
  useRef,
} from "react";
import type { CSSProperties } from "react";
import type { Column, BoardCard, CardDetail, Label, BoardMember, User, BoardActivityItem } from "./api.ts";
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
  currentUser: User;
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

const AVATAR_COLORS = [
  "#e74c3c", "#3498db", "#27ae60", "#f39c12", "#8e44ad",
  "#16a085", "#c0392b", "#2980b9", "#d35400", "#2d3436",
];

function getAvatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

export function BoardView({ boardId, currentUser }: BoardViewProps): React.ReactElement {
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [columns, setColumns] = useState<Column[]>([]);
  const [boardLabels, setBoardLabels] = useState<Label[]>([]);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteStatus, setInviteStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [showActivitySidebar, setShowActivitySidebar] = useState(false);
  const [activityItems, setActivityItems] = useState<BoardActivityItem[]>([]);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const inviteRef = useRef<HTMLDivElement>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);
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
    const [{ columns: nextColumns }, { labels: nextLabels }, { members: nextMembers }] = await Promise.all([
      api.fetchColumns(boardId),
      api.fetchBoardLabels(boardId),
      api.fetchBoardMembers(boardId),
    ]);

    setColumns(nextColumns);
    setBoardLabels(nextLabels);
    setMembers(nextMembers);
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

  useEffect(() => {
    if (!showInvite) return;
    inviteInputRef.current?.focus();

    function handleClickOutside(event: MouseEvent): void {
      if (inviteRef.current && !inviteRef.current.contains(event.target as Node)) {
        setShowInvite(false);
        setInviteUsername("");
        setInviteStatus(null);
      }
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setShowInvite(false);
        setInviteUsername("");
        setInviteStatus(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showInvite]);

  async function handleInvite(): Promise<void> {
    const trimmed = inviteUsername.trim();
    if (trimmed === "" || inviteLoading) return;

    setInviteLoading(true);
    setInviteStatus(null);
    try {
      await api.inviteMember(boardId, trimmed);
      setInviteStatus({ type: "success", message: `Invited ${trimmed}` });
      setInviteUsername("");
      const { members: nextMembers } = await api.fetchBoardMembers(boardId);
      setMembers(nextMembers);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to invite";
      setInviteStatus({ type: "error", message });
    } finally {
      setInviteLoading(false);
    }
  }

  async function loadActivity(before?: string): Promise<void> {
    setActivityLoading(true);
    try {
      const { items, has_more } = await api.fetchBoardActivity(boardId, { limit: 30, before });
      if (before) {
        setActivityItems((prev) => [...prev, ...items]);
      } else {
        setActivityItems(items);
      }
      setActivityHasMore(has_more);
    } catch {
      // Silently fail
    } finally {
      setActivityLoading(false);
    }
  }

  function openActivitySidebar(): void {
    setShowActivitySidebar(true);
    void loadActivity();
  }

  function closeActivitySidebar(): void {
    setShowActivitySidebar(false);
    setActivityItems([]);
    setActivityHasMore(false);
  }

  function handleLoadMore(): void {
    if (activityItems.length === 0 || activityLoading) return;
    const lastItem = activityItems[activityItems.length - 1]!;
    void loadActivity(lastItem.timestamp);
  }

  useEffect(() => {
    if (!showActivitySidebar) return;

    function handleClickOutside(event: MouseEvent): void {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        closeActivitySidebar();
      }
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        closeActivitySidebar();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showActivitySidebar]);

  function relativeTime(timestamp: string): string {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    if (Number.isNaN(then)) return timestamp;
    const diff = now - then;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  const isOwner = members.some((m) => m.id === currentUser.id && m.role === "owner");
  const displayMembers = members.slice(0, 5);
  const overflowCount = members.length - 5;

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
          <div className="board-controls-top">
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

            <div className="board-members-section">
            <div className="member-avatars">
              {displayMembers.map((member) => (
                <span
                  key={member.id}
                  className={`member-avatar${member.role === "owner" ? " member-avatar-owner" : ""}`}
                  style={{ backgroundColor: getAvatarColor(member.username) }}
                  title={`${member.username}${member.role === "owner" ? " (owner)" : ""}`}
                >
                  {member.username.charAt(0).toUpperCase()}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="member-avatar member-avatar-overflow" title={`${overflowCount} more member${overflowCount === 1 ? "" : "s"}`}>
                  +{overflowCount}
                </span>
              )}
            </div>

            <button
              className={`btn-activity-toggle${showActivitySidebar ? " active" : ""}`}
              onClick={() => {
                if (showActivitySidebar) {
                  closeActivitySidebar();
                } else {
                  openActivitySidebar();
                }
              }}
              title="Board activity"
            >
              {"\u{1F552}"}
            </button>

            {isOwner && (
              <div className="invite-wrapper" ref={inviteRef}>
                <button
                  className="btn-invite"
                  onClick={() => {
                    setShowInvite((prev) => !prev);
                    setInviteStatus(null);
                    setInviteUsername("");
                  }}
                  title="Invite member"
                >
                  +
                </button>
                {showInvite && (
                  <div className="invite-popover">
                    <p className="invite-popover-title">Invite to board</p>
                    <div className="invite-input-row">
                      <input
                        ref={inviteInputRef}
                        type="text"
                        className="invite-input"
                        placeholder="Username"
                        value={inviteUsername}
                        onChange={(e) => {
                          setInviteUsername(e.target.value);
                          if (inviteStatus) setInviteStatus(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleInvite();
                        }}
                        disabled={inviteLoading}
                      />
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => void handleInvite()}
                        disabled={inviteUsername.trim() === "" || inviteLoading}
                      >
                        {inviteLoading ? "..." : "Invite"}
                      </button>
                    </div>
                    {inviteStatus && (
                      <p className={`invite-status invite-status-${inviteStatus.type}`}>
                        {inviteStatus.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
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
          currentUser={currentUser}
          isOwner={isOwner}
          onCreate={handleCreateCard}
          onDelete={modal.card ? () => handleDeleteCard() : null}
          onCardUpdated={handleCardUpdated}
          onClose={() => setModal({ open: false, card: null, columnId: "" })}
        />
      )}

      {showActivitySidebar && (
        <div className="activity-sidebar-overlay">
          <div className="activity-sidebar" ref={sidebarRef}>
            <div className="activity-sidebar-header">
              <h3>Board Activity</h3>
              <button
                className="btn-icon modal-close-btn"
                onClick={closeActivitySidebar}
                title="Close"
              >
                &times;
              </button>
            </div>
            <div className="activity-sidebar-body">
              {activityItems.length === 0 && !activityLoading && (
                <p className="activity-sidebar-empty">No activity yet</p>
              )}
              {activityItems.map((item) => (
                <div key={`${item.type}-${item.id}`} className="activity-sidebar-item">
                  <span
                    className="sidebar-item-avatar"
                    style={{ backgroundColor: getAvatarColor(item.username ?? "System") }}
                  >
                    {(item.username ?? "S").charAt(0).toUpperCase()}
                  </span>
                  <div className="sidebar-item-content">
                    <p className="sidebar-item-text">
                      <strong>{item.username ?? "System"}</strong>
                      {" "}
                      {item.type === "comment" ? "commented" : item.action ?? "updated"}
                      {item.detail ? `: ${item.detail}` : ""}
                    </p>
                    {item.card_title && (
                      <button
                        type="button"
                        className="sidebar-card-link"
                        onClick={() => {
                          if (item.card_id) {
                            const matchCard = columns.flatMap((c) => c.cards).find((c) => c.id === item.card_id);
                            if (matchCard) {
                              openEditCard(matchCard);
                            }
                          }
                        }}
                      >
                        {item.card_title}
                      </button>
                    )}
                    {item.type === "comment" && item.content && (
                      <p className="sidebar-comment-preview">{item.content.slice(0, 120)}{item.content.length > 120 ? "..." : ""}</p>
                    )}
                    <span className="sidebar-item-time">{relativeTime(item.timestamp)}</span>
                  </div>
                </div>
              ))}
              {activityLoading && (
                <p className="activity-sidebar-loading">Loading...</p>
              )}
              {activityHasMore && !activityLoading && (
                <button
                  className="btn-secondary btn-load-more"
                  onClick={handleLoadMore}
                >
                  Load more
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
