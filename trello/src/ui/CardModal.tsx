import { useEffect, useRef, useState } from "react";
import type { BoardCard, CardDetail, ChecklistItem, Label } from "./api.ts";
import * as api from "./api.ts";
import {
  describeActivity,
  formatActivityTimestamp,
  getChecklistProgress,
  parseChecklist,
  stringifyChecklist,
} from "./card-utils.ts";

const PRESET_LABEL_COLORS = [
  "#e74c3c",
  "#f39c12",
  "#f1c40f",
  "#27ae60",
  "#16a085",
  "#2980b9",
  "#8e44ad",
  "#c0392b",
  "#7f8c8d",
  "#2d3436",
];

interface CardModalProps {
  boardId: string;
  card: BoardCard | null;
  columnId: string;
  onCreate: (title: string, description: string) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
  onCardUpdated: (card: BoardCard | CardDetail) => void;
  onClose: () => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

function createChecklistItem(text: string): ChecklistItem {
  return {
    id: globalThis.crypto.randomUUID(),
    text,
    checked: false,
  };
}

function sortLabels(labels: Label[]): Label[] {
  return [...labels].sort((left, right) => left.position - right.position);
}

function renderInlineContent(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null) {
    const token = match[0];
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-${match.index}`}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      parts.push(
        <em key={`${keyPrefix}-${match.index}`}>
          {token.slice(1, -1)}
        </em>
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        parts.push(
          <a
            key={`${keyPrefix}-${match.index}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function renderFormattedDescription(description: string): React.ReactNode {
  if (description.trim() === "") {
    return <p className="empty-inline-state">Add a description...</p>;
  }

  const blocks: React.ReactNode[] = [];
  const lines = description.split("\n");
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  function flushParagraph(key: string): void {
    if (paragraphLines.length === 0) return;
    const content = paragraphLines.join(" ").trim();
    paragraphLines = [];
    if (content !== "") {
      blocks.push(
        <p key={key} className="formatted-paragraph">
          {renderInlineContent(content, key)}
        </p>
      );
    }
  }

  function flushList(key: string): void {
    if (listItems.length === 0) return;
    const items = [...listItems];
    listItems = [];
    blocks.push(
      <ul key={key} className="formatted-list">
        {items.map((item, index) => (
          <li key={`${key}-${index}`}>{renderInlineContent(item, `${key}-${index}`)}</li>
        ))}
      </ul>
    );
  }

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("- ")) {
      flushParagraph(`paragraph-${index}`);
      listItems.push(trimmedLine.slice(2));
      return;
    }

    if (trimmedLine === "") {
      flushParagraph(`paragraph-${index}`);
      flushList(`list-${index}`);
      return;
    }

    flushList(`list-${index}`);
    paragraphLines.push(trimmedLine);
  });

  flushParagraph(`paragraph-${lines.length}`);
  flushList(`list-${lines.length}`);

  return blocks;
}

export function CardModal({
  boardId,
  card,
  columnId,
  onCreate,
  onDelete,
  onCardUpdated,
  onClose,
}: CardModalProps): React.ReactElement {
  const [title, setTitle] = useState(card?.title ?? "");
  const [descriptionDraft, setDescriptionDraft] = useState(card?.description ?? "");
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [boardLabels, setBoardLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(card !== null);
  const [error, setError] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(card === null);
  const [isEditingDescription, setIsEditingDescription] = useState(card === null);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(PRESET_LABEL_COLORS[0] ?? "#e74c3c");
  const [newChecklistText, setNewChecklistText] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (!card) {
      setLoading(false);
      setDetail(null);
      setBoardLabels([]);
      setTitle("");
      setDescriptionDraft("");
      setError("");
      setIsEditingTitle(true);
      setIsEditingDescription(true);
      return;
    }

    let cancelled = false;
    const nextRequest = requestVersion.current + 1;
    requestVersion.current = nextRequest;

    setLoading(true);
    setError("");
    setTitle(card.title);
    setDescriptionDraft(card.description);
    setIsEditingTitle(false);
    setIsEditingDescription(false);
    setDetail({
      ...card,
      activity: [],
    });

    void Promise.all([
      api.fetchCardDetail(boardId, card.id),
      api.fetchBoardLabels(boardId),
    ])
      .then(([cardDetail, labelResponse]) => {
        if (cancelled || requestVersion.current !== nextRequest) {
          return;
        }
        setDetail(cardDetail);
        setBoardLabels(labelResponse.labels);
        setTitle(cardDetail.title);
        setDescriptionDraft(cardDetail.description);
        onCardUpdated(cardDetail);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardId, card, onCardUpdated]);

  async function refreshDetail(refreshLabels: boolean = false): Promise<void> {
    if (!card) return;

    const nextRequest = requestVersion.current + 1;
    requestVersion.current = nextRequest;

    const tasks: [Promise<CardDetail>, Promise<{ labels: Label[] }> | null] = [
      api.fetchCardDetail(boardId, card.id),
      refreshLabels ? api.fetchBoardLabels(boardId) : null,
    ];

    const [cardDetail, labelResponse] = await Promise.all([
      tasks[0],
      tasks[1] ?? Promise.resolve(null),
    ]);

    if (requestVersion.current !== nextRequest) {
      return;
    }

    setDetail(cardDetail);
    if (refreshLabels && labelResponse) {
      setBoardLabels(labelResponse.labels);
    }
    onCardUpdated(cardDetail);
  }

  async function persistCardPatch(
    updates: {
      title?: string;
      description?: string;
      due_date?: string | null;
      start_date?: string | null;
      checklist?: string;
    },
    buildOptimisticDetail: (current: CardDetail) => CardDetail,
    onRollback?: () => void
  ): Promise<void> {
    if (!card || !detail) return;

    const previous = detail;
    const optimistic = buildOptimisticDetail(previous);
    setError("");
    setDetail(optimistic);
    onCardUpdated(optimistic);

    try {
      await api.updateCard(boardId, card.id, updates);
      await refreshDetail();
    } catch (err: unknown) {
      setDetail(previous);
      onCardUpdated(previous);
      onRollback?.();
      setError(getErrorMessage(err));
    }
  }

  async function handleCreateSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle === "") {
      setError("Title cannot be empty");
      return;
    }

    setError("");
    try {
      await onCreate(trimmedTitle, descriptionDraft.trim());
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  async function saveTitle(): Promise<void> {
    if (!detail) return;
    const trimmedTitle = title.trim();

    if (trimmedTitle === "") {
      setTitle(detail.title);
      setIsEditingTitle(false);
      setError("Title cannot be empty");
      return;
    }

    setIsEditingTitle(false);
    if (trimmedTitle === detail.title) {
      setTitle(detail.title);
      return;
    }

    const previousTitle = detail.title;
    await persistCardPatch(
      { title: trimmedTitle },
      (current) => ({ ...current, title: trimmedTitle }),
      () => setTitle(previousTitle)
    );
  }

  async function saveDescription(): Promise<void> {
    if (!detail) return;
    const nextDescription = descriptionDraft.trim();
    setIsEditingDescription(false);

    if (nextDescription === detail.description) {
      setDescriptionDraft(detail.description);
      return;
    }

    const previousDescription = detail.description;
    await persistCardPatch(
      { description: nextDescription },
      (current) => ({ ...current, description: nextDescription }),
      () => setDescriptionDraft(previousDescription)
    );
  }

  function isDateRangeValid(
    nextStartDate: string | null,
    nextDueDate: string | null
  ): boolean {
    if (nextStartDate && nextDueDate && nextStartDate > nextDueDate) {
      setError("Start date must be before or equal to due date");
      return false;
    }
    return true;
  }

  async function saveDateField(
    field: "start_date" | "due_date",
    value: string | null
  ): Promise<void> {
    if (!detail) return;

    const nextStartDate = field === "start_date" ? value : detail.start_date;
    const nextDueDate = field === "due_date" ? value : detail.due_date;
    if (!isDateRangeValid(nextStartDate, nextDueDate)) {
      return;
    }

    setError("");
    await persistCardPatch(
      { [field]: value },
      (current) => ({ ...current, [field]: value })
    );
  }

  async function saveChecklist(items: ChecklistItem[]): Promise<void> {
    if (!detail) return;
    const nextChecklist = stringifyChecklist(items);
    const progress = getChecklistProgress(items);

    await persistCardPatch(
      { checklist: nextChecklist },
      (current) => ({
        ...current,
        checklist: nextChecklist,
        checklist_total: progress.total,
        checklist_done: progress.done,
      })
    );
  }

  async function toggleChecklistItem(itemId: string): Promise<void> {
    if (!detail) return;
    const currentItems = parseChecklist(detail.checklist);
    const nextItems = currentItems.map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    await saveChecklist(nextItems);
  }

  async function removeChecklistItem(itemId: string): Promise<void> {
    if (!detail) return;
    const currentItems = parseChecklist(detail.checklist);
    const nextItems = currentItems.filter((item) => item.id !== itemId);
    await saveChecklist(nextItems);
  }

  async function addChecklistItem(): Promise<void> {
    if (!detail) return;
    const trimmed = newChecklistText.trim();
    if (trimmed === "") return;
    const currentItems = parseChecklist(detail.checklist);
    const nextItems = [...currentItems, createChecklistItem(trimmed)];
    setNewChecklistText("");
    await saveChecklist(nextItems);
  }

  async function toggleLabel(label: Label): Promise<void> {
    if (!card || !detail) return;

    const alreadyAssigned = detail.labels.some((entry) => entry.id === label.id);
    const previous = detail;
    const optimisticLabels = alreadyAssigned
      ? detail.labels.filter((entry) => entry.id !== label.id)
      : sortLabels([...detail.labels, label]);
    const optimistic = {
      ...detail,
      labels: optimisticLabels,
    };

    setError("");
    setDetail(optimistic);
    onCardUpdated(optimistic);

    try {
      if (alreadyAssigned) {
        await api.removeCardLabel(boardId, card.id, label.id);
      } else {
        await api.assignCardLabel(boardId, card.id, label.id);
      }
      await refreshDetail(true);
    } catch (err: unknown) {
      setDetail(previous);
      onCardUpdated(previous);
      setError(getErrorMessage(err));
    }
  }

  async function createAndAssignLabel(): Promise<void> {
    if (!card || newLabelName.trim() === "") return;

    try {
      const created = await api.createLabel(boardId, newLabelName.trim(), newLabelColor);
      setBoardLabels((current) => sortLabels([...current, created]));
      setNewLabelName("");
      await toggleLabel(created);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  function focusDescriptionEditor(): void {
    setIsEditingDescription(true);
    requestAnimationFrame(() => {
      descriptionRef.current?.focus();
    });
  }

  function insertFormatting(
    prefix: string,
    suffix: string,
    placeholder: string
  ): void {
    const textarea = descriptionRef.current;
    if (!textarea) return;

    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selected = descriptionDraft.slice(selectionStart, selectionEnd);
    const nextText = selected === "" ? placeholder : selected;
    const replacement = `${prefix}${nextText}${suffix}`;

    setDescriptionDraft(
      `${descriptionDraft.slice(0, selectionStart)}${replacement}${descriptionDraft.slice(
        selectionEnd
      )}`
    );

    requestAnimationFrame(() => {
      textarea.focus();
      const start = selectionStart + prefix.length;
      const end = start + nextText.length;
      textarea.setSelectionRange(start, end);
    });
  }

  function insertBulletList(): void {
    const textarea = descriptionRef.current;
    if (!textarea) return;

    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selected = descriptionDraft.slice(selectionStart, selectionEnd);
    const nextText = (selected || "List item")
      .split("\n")
      .map((line) => (line.startsWith("- ") ? line : `- ${line}`))
      .join("\n");

    setDescriptionDraft(
      `${descriptionDraft.slice(0, selectionStart)}${nextText}${descriptionDraft.slice(
        selectionEnd
      )}`
    );

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionStart + nextText.length);
    });
  }

  const checklistItems = detail ? parseChecklist(detail.checklist) : [];
  const checklistProgress = getChecklistProgress(checklistItems);

  if (!card) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal card-modal card-modal-create" onClick={(e) => e.stopPropagation()}>
          <div className="card-modal-topbar">
            <div>
              <p className="card-modal-kicker">New card</p>
              <h2>Create a card</h2>
            </div>
            <button className="btn-icon modal-close-btn" onClick={onClose} title="Close">
              &times;
            </button>
          </div>

          {error && <p className="modal-inline-error">{error}</p>}

          <form onSubmit={(e) => void handleCreateSubmit(e)} className="card-create-form">
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
              placeholder="What needs to happen?"
            />

            <label htmlFor="card-desc">Description</label>
            <textarea
              id="card-desc"
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              placeholder="Add context, notes, or links..."
              rows={6}
            />

            <div className="modal-actions">
              <button type="submit" className="btn-primary">
                Save card
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card-modal card-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-modal-topbar">
          <div className="card-modal-heading">
            <p className="card-modal-kicker">Card detail</p>
            {loading || !detail ? (
              <h2>Loading card...</h2>
            ) : isEditingTitle ? (
              <input
                ref={titleRef}
                className="card-modal-title-input"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError("");
                }}
                onBlur={() => void saveTitle()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveTitle();
                  }
                  if (e.key === "Escape") {
                    setTitle(detail.title);
                    setIsEditingTitle(false);
                  }
                }}
              />
            ) : (
              <button
                className="card-modal-title-button"
                onClick={() => setIsEditingTitle(true)}
              >
                {detail.title}
              </button>
            )}
          </div>
          <button className="btn-icon modal-close-btn" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        {error && <p className="modal-inline-error">{error}</p>}

        {loading || !detail ? (
          <div className="card-modal-loading">Loading card details...</div>
        ) : (
          <>
            <section className="card-section">
              <div className="card-section-header">
                <h3>Labels</h3>
                <button
                  type="button"
                  className="btn-secondary btn-chip"
                  onClick={() => setShowLabelPicker((current) => !current)}
                >
                  {showLabelPicker ? "Close" : "+ Label"}
                </button>
              </div>

              {detail.labels.length > 0 ? (
                <div className="label-pill-row">
                  {detail.labels.map((label) => (
                    <span
                      key={label.id}
                      className="label-pill"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="empty-inline-state">No labels yet. Open the picker to add one.</p>
              )}

              {showLabelPicker && (
                <div className="label-picker">
                  {boardLabels.length === 0 ? (
                    <p className="empty-inline-state">Create your first label</p>
                  ) : (
                    <div className="label-picker-list">
                      {boardLabels.map((label) => {
                        const assigned = detail.labels.some((entry) => entry.id === label.id);
                        return (
                          <button
                            key={label.id}
                            type="button"
                            className={`label-picker-option${assigned ? " assigned" : ""}`}
                            onClick={() => void toggleLabel(label)}
                          >
                            <span
                              className="label-picker-swatch"
                              style={{ backgroundColor: label.color }}
                            />
                            <span className="label-picker-name">{label.name}</span>
                            <span className="label-picker-check">{assigned ? "✓" : ""}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="label-create-panel">
                    <div className="label-color-grid">
                      {PRESET_LABEL_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`label-color-option${
                            newLabelColor === color ? " active" : ""
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => setNewLabelColor(color)}
                          title={color}
                        />
                      ))}
                    </div>
                    <div className="label-create-controls">
                      <input
                        type="text"
                        value={newLabelName}
                        maxLength={30}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        placeholder="New label name"
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void createAndAssignLabel()}
                      >
                        Create label
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="card-section">
              <div className="card-section-header">
                <h3>Dates</h3>
              </div>
              <div className="date-grid">
                <label className="date-field">
                  <span>Start date</span>
                  <div className="date-input-row">
                    <input
                      type="date"
                      value={detail.start_date ?? ""}
                      onChange={(e) => void saveDateField("start_date", e.target.value || null)}
                    />
                    <button
                      type="button"
                      className="btn-text"
                      disabled={!detail.start_date}
                      onClick={() => void saveDateField("start_date", null)}
                    >
                      Clear
                    </button>
                  </div>
                </label>

                <label className="date-field">
                  <span>Due date</span>
                  <div className="date-input-row">
                    <input
                      type="date"
                      value={detail.due_date ?? ""}
                      onChange={(e) => void saveDateField("due_date", e.target.value || null)}
                    />
                    <button
                      type="button"
                      className="btn-text"
                      disabled={!detail.due_date}
                      onClick={() => void saveDateField("due_date", null)}
                    >
                      Clear
                    </button>
                  </div>
                </label>
              </div>
            </section>

            <section className="card-section">
              <div className="card-section-header">
                <h3>Description</h3>
                {!isEditingDescription && (
                  <button
                    type="button"
                    className="btn-secondary btn-chip"
                    onClick={focusDescriptionEditor}
                  >
                    Edit
                  </button>
                )}
              </div>

              {isEditingDescription ? (
                <div className="description-editor">
                  <div className="description-toolbar">
                    <button
                      type="button"
                      className="btn-toolbar"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertFormatting("**", "**", "bold text")}
                    >
                      Bold
                    </button>
                    <button
                      type="button"
                      className="btn-toolbar"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertFormatting("*", "*", "italic text")}
                    >
                      Italic
                    </button>
                    <button
                      type="button"
                      className="btn-toolbar"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        insertFormatting("[", "](https://example.com)", "link text")
                      }
                    >
                      Link
                    </button>
                    <button
                      type="button"
                      className="btn-toolbar"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={insertBulletList}
                    >
                      List
                    </button>
                  </div>
                  <textarea
                    ref={descriptionRef}
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    onBlur={() => void saveDescription()}
                    rows={8}
                    placeholder="Describe the work, add links, or drop a short checklist outline..."
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="description-preview"
                  onClick={focusDescriptionEditor}
                >
                  {renderFormattedDescription(detail.description)}
                </button>
              )}
            </section>

            <section className="card-section">
              <div className="card-section-header">
                <h3>Checklist</h3>
                {checklistProgress.total > 0 && (
                  <span className="section-meta">
                    {checklistProgress.done}/{checklistProgress.total} complete
                  </span>
                )}
              </div>

              {checklistProgress.total > 0 ? (
                <div className="checklist-progress">
                  <div className="checklist-progress-track">
                    <div
                      className="checklist-progress-fill"
                      style={{
                        width: `${Math.round(
                          (checklistProgress.done / checklistProgress.total) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="empty-inline-state">Add an item...</p>
              )}

              <div className="checklist-items">
                {checklistItems.map((item) => (
                  <div key={item.id} className="checklist-item">
                    <label className="checklist-item-label">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => void toggleChecklistItem(item.id)}
                      />
                      <span className={item.checked ? "checked" : ""}>{item.text}</span>
                    </label>
                    <button
                      type="button"
                      className="btn-icon btn-checklist-delete"
                      onClick={() => void removeChecklistItem(item.id)}
                      title="Remove item"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              <div className="checklist-add-row">
                <input
                  type="text"
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addChecklistItem();
                    }
                  }}
                  placeholder="Add an item..."
                />
                <button type="button" className="btn-primary" onClick={() => void addChecklistItem()}>
                  Add
                </button>
              </div>
            </section>

            <section className="card-section">
              <div className="card-section-header">
                <h3>Activity</h3>
              </div>
              {detail.activity.length === 0 ? (
                <p className="empty-inline-state">No activity recorded</p>
              ) : (
                <div className="activity-log">
                  {detail.activity.map((activity) => (
                    <div key={activity.id} className="activity-item">
                      <p className="activity-copy">{describeActivity(activity)}</p>
                      <p className="activity-time">
                        {formatActivityTimestamp(activity.timestamp)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="modal-actions modal-actions-detail">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Close
              </button>
              {onDelete && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => void onDelete()}
                >
                  Delete card
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
