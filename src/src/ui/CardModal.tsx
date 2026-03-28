import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardCard, CardDetail, ChecklistItem, Label, User, TimelineItem, ReactionGroup, Artifact } from "./api.ts";
import * as api from "./api.ts";
import {
  describeActivity,
  formatActivityTimestamp,
  getChecklistProgress,
  parseChecklist,
  stringifyChecklist,
} from "./card-utils.ts";
import { renderInlineContent } from "./render-inline.tsx";

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
  currentUser: User;
  isOwner: boolean;
  onCreate: (title: string, description: string) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
  onCardUpdated: (card: BoardCard | CardDetail) => void;
  onClose: () => void;
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
  return formatActivityTimestamp(timestamp);
}

function renderMentions(
  content: string,
  boardMembers: { id: string; username: string }[]
): React.ReactNode {
  const memberUsernames = new Set(boardMembers.map((m) => m.username));
  const parts: React.ReactNode[] = [];
  const regex = /@(\w+)/g;
  let lastIndex = 0;
  let match = regex.exec(content);
  let key = 0;

  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const username = match[1]!;
    if (memberUsernames.has(username)) {
      parts.push(
        <strong key={key++} className="mention">
          @{username}
        </strong>
      );
    } else {
      parts.push(match[0]);
    }
    lastIndex = regex.lastIndex;
    match = regex.exec(content);
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

const ALLOWED_EMOJI = ["\u{1F44D}", "\u{1F44E}", "\u2764\uFE0F", "\u{1F389}", "\u{1F604}", "\u{1F615}", "\u{1F680}", "\u{1F440}"];

interface ReactionBarProps {
  boardId: string;
  targetType: "comment" | "activity";
  targetId: string;
  reactions: ReactionGroup[];
  currentUserId: string;
  onReactionToggled: () => void;
}

function ReactionBar({
  boardId,
  targetType,
  targetId,
  reactions,
  currentUserId,
  onReactionToggled,
}: ReactionBarProps): React.ReactElement {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPicker) return;

    function handleClickOutside(event: MouseEvent): void {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPicker]);

  async function handleToggleReaction(emoji: string): Promise<void> {
    setShowPicker(false);
    try {
      await api.toggleReaction(boardId, targetType, targetId, emoji);
      onReactionToggled();
    } catch {
      // Silently fail — next refresh will sync
    }
  }

  return (
    <div className="reaction-bar-wrapper" ref={pickerRef}>
      <div className="reaction-bar-row">
        {reactions.length > 0 && (
          <div className="reaction-chips">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className={`reaction-chip reaction-chip-interactive${r.user_ids.includes(currentUserId) ? " reaction-mine" : ""}`}
                onClick={() => void handleToggleReaction(r.emoji)}
                title={`${r.count} reaction${r.count === 1 ? "" : "s"}`}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="btn-add-reaction"
          onClick={() => setShowPicker((p) => !p)}
          title="Add reaction"
        >
          {"\u{1F642}"}
        </button>
      </div>
      {showPicker && (
        <div className="reaction-picker">
          {ALLOWED_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="reaction-picker-emoji"
              onClick={() => void handleToggleReaction(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

function extractDateAndTime(dateTimeString: string | null): { date: string; time: string } {
  if (!dateTimeString) return { date: "", time: "" };
  
  if (dateTimeString.includes('T')) {
    const [date, timeWithZ] = dateTimeString.split('T');
    const time = timeWithZ ? timeWithZ.replace('Z', '').slice(0, 5) : "";
    return { date: date ?? "", time };
  }
  
  return { date: dateTimeString, time: "" };
}

function combineDateAndTime(date: string, time: string): string {
  if (!date) return "";
  if (!time) return date;
  return `${date}T${time}`;
}

function formatDateTimeDisplay(dateTimeString: string | null): string {
  if (!dateTimeString) return "";
  
  const date = new Date(dateTimeString);
  if (isNaN(date.getTime())) return "";
  
  const hasTime = dateTimeString.includes('T');
  
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(hasTime ? {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    } : {})
  };
  
  return new Intl.DateTimeFormat('en-US', options).format(date);
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
  currentUser,
  isOwner,
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
  const [showStartTime, setShowStartTime] = useState(false);
  const [showDueTime, setShowDueTime] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentFocused, setCommentFocused] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [watchLoading, setWatchLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showArtifactForm, setShowArtifactForm] = useState(false);
  const [artifactFilename, setArtifactFilename] = useState("");
  const [artifactFiletype, setArtifactFiletype] = useState<Artifact["filetype"]>("md");
  const [artifactContent, setArtifactContent] = useState("");
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [expandedArtifactContent, setExpandedArtifactContent] = useState<string>("");
  const [editingArtifact, setEditingArtifact] = useState<Artifact | null>(null);
  const [editingArtifactContent, setEditingArtifactContent] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const requestVersion = useRef(0);
  const onCardUpdatedRef = useRef(onCardUpdated);
  onCardUpdatedRef.current = onCardUpdated;

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

  const cardId = card?.id ?? null;

  useEffect(() => {
    if (!card || !cardId) {
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
      timeline: [],
      is_watching: false,
      watcher_count: 0,
      board_members: [],
      artifacts: [],
    });

    void Promise.all([
      api.fetchCardDetail(boardId, cardId),
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
        // Check if dates have time components
        setShowStartTime(cardDetail.start_date ? cardDetail.start_date.includes('T') : false);
        setShowDueTime(cardDetail.due_date ? cardDetail.due_date.includes('T') : false);
        onCardUpdatedRef.current(cardDetail);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, cardId]);

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
    onCardUpdatedRef.current(cardDetail);
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
    onCardUpdatedRef.current(optimistic);

    try {
      await api.updateCard(boardId, card.id, updates);
      await refreshDetail();
    } catch (err: unknown) {
      setDetail(previous);
      onCardUpdatedRef.current(previous);
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

  async function handleToggleWatch(): Promise<void> {
    if (!card || !detail || watchLoading) return;
    setWatchLoading(true);
    try {
      const { watching } = await api.toggleWatch(boardId, card.id);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              is_watching: watching,
              watcher_count: watching
                ? prev.watcher_count + 1
                : Math.max(0, prev.watcher_count - 1),
            }
          : prev
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setWatchLoading(false);
    }
  }

  async function handleSubmitComment(): Promise<void> {
    if (!card || !detail) return;
    const trimmed = commentText.trim();
    if (trimmed === "") return;

    setCommentText("");
    setCommentFocused(false);
    try {
      await api.createComment(boardId, card.id, trimmed);
      await refreshDetail();
    } catch (err: unknown) {
      setCommentText(trimmed);
      setError(getErrorMessage(err));
    }
  }

  async function handleUpdateComment(commentId: string): Promise<void> {
    if (!card) return;
    const trimmed = editingCommentText.trim();
    if (trimmed === "") return;

    setEditingCommentId(null);
    try {
      await api.updateComment(boardId, card.id, commentId, trimmed);
      await refreshDetail();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  async function handleDeleteComment(commentId: string): Promise<void> {
    if (!card || !window.confirm("Delete this comment?")) return;
    try {
      await api.deleteComment(boardId, card.id, commentId);
      await refreshDetail();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  function isDateRangeValid(
    nextStartDate: string | null,
    nextDueDate: string | null
  ): boolean {
    if (nextStartDate && nextDueDate) {
      // Extract just the dates for comparison
      const startDate = extractDateAndTime(nextStartDate).date;
      const dueDate = extractDateAndTime(nextDueDate).date;
      
      if (startDate > dueDate) {
        setError("Start date must be before or equal to due date");
        return false;
      }
      
      // If same date, check times
      if (startDate === dueDate && nextStartDate.includes('T') && nextDueDate.includes('T')) {
        const startTime = extractDateAndTime(nextStartDate).time;
        const dueTime = extractDateAndTime(nextDueDate).time;
        if (startTime > dueTime) {
          setError("Start time must be before or equal to due time on the same day");
          return false;
        }
      }
    }
    return true;
  }

  async function saveDateField(
    field: "start_date" | "due_date",
    value: string | null,
    includeTime: boolean = false
  ): Promise<void> {
    if (!detail) return;

    const nextStartDate = field === "start_date" ? value : detail.start_date;
    const nextDueDate = field === "due_date" ? value : detail.due_date;
    if (!isDateRangeValid(nextStartDate, nextDueDate)) {
      return;
    }

    setError("");
    
    // Clear time state if date is cleared
    if (!value) {
      if (field === "start_date") {
        setShowStartTime(false);
      } else {
        setShowDueTime(false);
      }
    }
    
    await persistCardPatch(
      { [field]: value },
      (current) => ({ ...current, [field]: value })
    );
  }

  async function toggleTimeForDate(field: "start_date" | "due_date"): Promise<void> {
    if (!detail) return;

    const isStartDate = field === "start_date";
    const currentValue = isStartDate ? detail.start_date : detail.due_date;
    const showTime = isStartDate ? showStartTime : showDueTime;
    
    if (showTime) {
      // Remove time
      const { date } = extractDateAndTime(currentValue);
      if (isStartDate) {
        setShowStartTime(false);
      } else {
        setShowDueTime(false);
      }
      await saveDateField(field, date || null);
    } else {
      // Add time (default to current time)
      const { date } = extractDateAndTime(currentValue);
      if (date) {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const dateTime = combineDateAndTime(date, `${hours}:${minutes}`);
        
        if (isStartDate) {
          setShowStartTime(true);
        } else {
          setShowDueTime(true);
        }
        await saveDateField(field, dateTime);
      }
    }
  }

  async function updateTime(field: "start_date" | "due_date", time: string): Promise<void> {
    if (!detail) return;
    
    const currentValue = field === "start_date" ? detail.start_date : detail.due_date;
    const { date } = extractDateAndTime(currentValue);
    
    if (date) {
      const dateTime = combineDateAndTime(date, time);
      await saveDateField(field, dateTime);
    }
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
    onCardUpdatedRef.current(optimistic);

    try {
      if (alreadyAssigned) {
        await api.removeCardLabel(boardId, card.id, label.id);
      } else {
        await api.assignCardLabel(boardId, card.id, label.id);
      }
      await refreshDetail(true);
    } catch (err: unknown) {
      setDetail(previous);
      onCardUpdatedRef.current(previous);
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

  const filteredMentionMembers = detail && mentionQuery !== null
    ? detail.board_members.filter((m) => m.username.toLowerCase().startsWith(mentionQuery))
    : [];

  function insertMention(username: string): void {
    const textarea = commentRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBefore = commentText.slice(0, cursorPos);
    const textAfter = commentText.slice(cursorPos);
    const atIndex = textBefore.lastIndexOf("@");
    if (atIndex === -1) return;

    const newText = `${textBefore.slice(0, atIndex)}@${username} ${textAfter}`;
    setCommentText(newText);
    setMentionQuery(null);

    const newCursorPos = atIndex + username.length + 2;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }

  async function loadArtifactContent(artifactId: string): Promise<void> {
    if (!card) return;
    try {
      const artifact = await api.fetchArtifact(boardId, artifactId);
      setExpandedArtifactContent(artifact.content || "");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  async function createArtifact(): Promise<void> {
    if (!card || !detail) return;
    if (!artifactFilename.trim() || !artifactContent.trim()) return;

    try {
      const created = await api.createCardArtifact(
        boardId,
        card.id,
        artifactFilename.trim(),
        artifactFiletype,
        artifactContent.trim()
      );
      
      // Update local state
      const updatedDetail = {
        ...detail,
        artifacts: [...(detail.artifacts || []), created].sort((a, b) => a.position - b.position),
      };
      setDetail(updatedDetail);
      onCardUpdatedRef.current(updatedDetail);
      
      // Reset form
      setShowArtifactForm(false);
      setArtifactFilename("");
      setArtifactContent("");
      setArtifactFiletype("md");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  async function updateArtifact(artifactId: string, content: string): Promise<void> {
    if (!card || !detail) return;
    
    try {
      const updated = await api.updateArtifact(boardId, artifactId, { content });
      
      // Update local state
      const updatedDetail = {
        ...detail,
        artifacts: detail.artifacts?.map(a => 
          a.id === artifactId ? { ...a, ...updated } : a
        ) || [],
      };
      setDetail(updatedDetail);
      onCardUpdatedRef.current(updatedDetail);
      
      // Reset editing state
      setEditingArtifact(null);
      setEditingArtifactContent("");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  async function deleteArtifact(artifactId: string): Promise<void> {
    if (!card || !detail || !confirm("Delete this artifact?")) return;
    
    try {
      await api.deleteArtifact(boardId, artifactId);
      
      // Update local state
      const updatedDetail = {
        ...detail,
        artifacts: detail.artifacts?.filter(a => a.id !== artifactId) || [],
      };
      setDetail(updatedDetail);
      onCardUpdatedRef.current(updatedDetail);
      
      // Reset expanded state if this was the expanded artifact
      if (expandedArtifact === artifactId) {
        setExpandedArtifact(null);
        setExpandedArtifactContent("");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  function getFiletypeIcon(filetype: Artifact["filetype"]): string {
    switch (filetype) {
      case "md": return "📝";
      case "html": return "🌐";
      case "js": return "📜";
      case "ts": return "📘";
      case "sh": return "⚡";
      default: return "📄";
    }
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
          <div className="card-modal-header-actions">
            {detail && (
              <button
                className={`btn-watch${detail.is_watching ? " watching" : ""}`}
                onClick={() => void handleToggleWatch()}
                disabled={watchLoading}
                title={detail.is_watching ? "Watching" : "Watch"}
              >
                <span className="watch-icon">{detail.is_watching ? "\u{1F441}\uFE0F" : "\u{1F441}"}</span>
                <span className="watch-count">{detail.watcher_count}</span>
              </button>
            )}
            <button className="btn-icon modal-close-btn" onClick={onClose} title="Close">
              &times;
            </button>
          </div>
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
                <div className="date-field">
                  <span>Start date</span>
                  {detail.start_date && (
                    <div className="date-display">{formatDateTimeDisplay(detail.start_date)}</div>
                  )}
                  <div className="date-input-row">
                    <input
                      type="date"
                      value={extractDateAndTime(detail.start_date).date}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        if (showStartTime && newDate) {
                          const { time } = extractDateAndTime(detail.start_date);
                          void saveDateField("start_date", combineDateAndTime(newDate, time));
                        } else {
                          void saveDateField("start_date", newDate || null);
                        }
                      }}
                    />
                    {showStartTime && detail.start_date && (
                      <input
                        type="time"
                        value={extractDateAndTime(detail.start_date).time}
                        onChange={(e) => void updateTime("start_date", e.target.value)}
                      />
                    )}
                    <button
                      type="button"
                      className="btn-text"
                      disabled={!detail.start_date}
                      onClick={() => void saveDateField("start_date", null)}
                    >
                      Clear
                    </button>
                    {detail.start_date && (
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => void toggleTimeForDate("start_date")}
                      >
                        {showStartTime ? "Remove time" : "Add time"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="date-field">
                  <span>Due date</span>
                  {detail.due_date && (
                    <div className="date-display">{formatDateTimeDisplay(detail.due_date)}</div>
                  )}
                  <div className="date-input-row">
                    <input
                      type="date"
                      value={extractDateAndTime(detail.due_date).date}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        if (showDueTime && newDate) {
                          const { time } = extractDateAndTime(detail.due_date);
                          void saveDateField("due_date", combineDateAndTime(newDate, time));
                        } else {
                          void saveDateField("due_date", newDate || null);
                        }
                      }}
                    />
                    {showDueTime && detail.due_date && (
                      <input
                        type="time"
                        value={extractDateAndTime(detail.due_date).time}
                        onChange={(e) => void updateTime("due_date", e.target.value)}
                      />
                    )}
                    <button
                      type="button"
                      className="btn-text"
                      disabled={!detail.due_date}
                      onClick={() => void saveDateField("due_date", null)}
                    >
                      Clear
                    </button>
                    {detail.due_date && (
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => void toggleTimeForDate("due_date")}
                      >
                        {showDueTime ? "Remove time" : "Add time"}
                      </button>
                    )}
                  </div>
                </div>
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
                <h3>Artifacts</h3>
                <span className="section-meta">
                  {detail.artifacts?.length || 0} file{(detail.artifacts?.length || 0) === 1 ? "" : "s"}
                </span>
              </div>

              {!detail.artifacts?.length && !showArtifactForm ? (
                <div className="artifact-empty-state">
                  <p className="empty-inline-state">No artifacts</p>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => setShowArtifactForm(true)}
                  >
                    Add Artifact
                  </button>
                </div>
              ) : (
                <>
                  {showArtifactForm ? (
                    <div className="artifact-form">
                      <div className="artifact-form-row">
                        <input
                          type="text"
                          placeholder="filename.md"
                          value={artifactFilename}
                          onChange={(e) => setArtifactFilename(e.target.value)}
                          className="artifact-filename-input"
                        />
                        <select
                          value={artifactFiletype}
                          onChange={(e) => setArtifactFiletype(e.target.value as Artifact["filetype"])}
                          className="artifact-type-select"
                        >
                          <option value="md">Markdown (.md)</option>
                          <option value="html">HTML (.html)</option>
                          <option value="js">JavaScript (.js)</option>
                          <option value="ts">TypeScript (.ts)</option>
                          <option value="sh">Shell (.sh)</option>
                        </select>
                      </div>
                      <textarea
                        className="artifact-content-textarea"
                        placeholder="Enter content..."
                        value={artifactContent}
                        onChange={(e) => setArtifactContent(e.target.value)}
                        rows={10}
                      />
                      <div className="artifact-form-actions">
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => void createArtifact()}
                          disabled={!artifactFilename.trim() || !artifactContent.trim()}
                        >
                          Save Artifact
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            setShowArtifactForm(false);
                            setArtifactFilename("");
                            setArtifactContent("");
                            setArtifactFiletype("md");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="artifact-list">
                        {detail.artifacts?.map((artifact) => (
                          <div key={artifact.id} className="artifact-item">
                            <div
                              className="artifact-header"
                              onClick={() => {
                                if (expandedArtifact === artifact.id) {
                                  setExpandedArtifact(null);
                                  setExpandedArtifactContent("");
                                } else {
                                  setExpandedArtifact(artifact.id);
                                  void loadArtifactContent(artifact.id);
                                }
                              }}
                            >
                              <span className="artifact-icon">{getFiletypeIcon(artifact.filetype)}</span>
                              <span className="artifact-filename">{artifact.filename}</span>
                              <span className="artifact-meta">
                                {artifact.filetype.toUpperCase()} • {formatActivityTimestamp(artifact.created_at)}
                              </span>
                              <div className="artifact-actions">
                                <button
                                  type="button"
                                  className="btn-icon btn-sm"
                                  title="Edit"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setEditingArtifact(artifact);
                                    // Expand the artifact and load content
                                    if (expandedArtifact !== artifact.id) {
                                      const fullArtifact = await api.fetchArtifact(boardId, artifact.id);
                                      setExpandedArtifact(artifact.id);
                                      setExpandedArtifactContent(fullArtifact.content || "");
                                      setEditingArtifactContent(fullArtifact.content || "");
                                    } else {
                                      setEditingArtifactContent(expandedArtifactContent);
                                    }
                                  }}
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  className="btn-icon btn-sm"
                                  title="Delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void deleteArtifact(artifact.id);
                                  }}
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                            {expandedArtifact === artifact.id && (
                              <div className="artifact-content">
                                {editingArtifact?.id === artifact.id ? (
                                  <>
                                    <textarea
                                      className="artifact-content-textarea"
                                      value={editingArtifactContent}
                                      onChange={(e) => setEditingArtifactContent(e.target.value)}
                                      rows={15}
                                    />
                                    <div className="artifact-edit-actions">
                                      <button
                                        type="button"
                                        className="btn-primary btn-sm"
                                        onClick={() => void updateArtifact(artifact.id, editingArtifactContent)}
                                        disabled={!editingArtifactContent.trim()}
                                      >
                                        Save Changes
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-secondary btn-sm"
                                        onClick={() => {
                                          setEditingArtifact(null);
                                          setEditingArtifactContent("");
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <pre className="artifact-content-display">{expandedArtifactContent}</pre>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="btn-primary btn-sm artifact-add-btn"
                        onClick={() => setShowArtifactForm(true)}
                      >
                        Add Artifact
                      </button>
                    </>
                  )}
                </>
              )}
            </section>

            <section className="card-section">
              <div className="card-section-header">
                <h3>Activity</h3>
                <span className="section-meta">
                  {detail.timeline.filter((item) => item.type === "comment").length} comment{detail.timeline.filter((item) => item.type === "comment").length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="comment-input-area">
                {commentFocused ? (
                  <div className="comment-compose">
                    <div className="comment-textarea-wrapper">
                      <textarea
                        ref={commentRef}
                        className="comment-textarea"
                        placeholder="Write a comment..."
                        value={commentText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCommentText(val);

                          const cursorPos = e.target.selectionStart;
                          const textBefore = val.slice(0, cursorPos);
                          const mentionMatch = /@(\w*)$/.exec(textBefore);
                          if (mentionMatch) {
                            setMentionQuery(mentionMatch[1]!.toLowerCase());
                            setMentionIndex(0);
                          } else {
                            setMentionQuery(null);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (mentionQuery !== null && filteredMentionMembers.length > 0) {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setMentionIndex((i) => Math.min(i + 1, filteredMentionMembers.length - 1));
                              return;
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setMentionIndex((i) => Math.max(i - 1, 0));
                              return;
                            }
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              insertMention(filteredMentionMembers[mentionIndex]!.username);
                              return;
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setMentionQuery(null);
                              return;
                            }
                          }
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            void handleSubmitComment();
                          }
                          if (e.key === "Escape") {
                            setCommentFocused(false);
                          }
                        }}
                        rows={3}
                        autoFocus
                      />
                      {mentionQuery !== null && filteredMentionMembers.length > 0 && (
                        <div className="mention-dropdown">
                          {filteredMentionMembers.map((member, idx) => (
                            <button
                              key={member.id}
                              type="button"
                              className={`mention-option${idx === mentionIndex ? " mention-option-active" : ""}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                insertMention(member.username);
                              }}
                            >
                              @{member.username}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="comment-compose-actions">
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => void handleSubmitComment()}
                        disabled={commentText.trim() === ""}
                      >
                        Save
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setCommentFocused(false);
                          setCommentText("");
                          setMentionQuery(null);
                        }}
                      >
                        Cancel
                      </button>
                      <span className="comment-hint">Ctrl+Enter to submit</span>
                    </div>
                  </div>
                ) : (
                  <input
                    type="text"
                    className="comment-input-collapsed"
                    placeholder="Write a comment..."
                    onFocus={() => setCommentFocused(true)}
                    readOnly
                  />
                )}
              </div>

              {detail.timeline.length === 0 ? (
                <p className="empty-inline-state">No activity recorded</p>
              ) : (
                <div className="timeline">
                  {detail.timeline.filter((item) => !(item.type === "activity" && item.action === "commented")).map((item) => {
                    if (item.type === "comment") {
                      const canEdit = item.user_id === currentUser.id;
                      const canDelete = item.user_id === currentUser.id || isOwner;
                      const isEditing = editingCommentId === item.id;

                      return (
                        <div key={item.id} className="timeline-item timeline-comment">
                          <span
                            className="timeline-avatar"
                            style={{ backgroundColor: getAvatarColor(item.username) }}
                          >
                            {item.username.charAt(0).toUpperCase()}
                          </span>
                          <div className="timeline-content">
                            <div className="timeline-meta">
                              <strong className="timeline-username">{item.username}</strong>
                              <span className="timeline-time">{relativeTime(item.created_at)}</span>
                              {item.created_at !== item.updated_at && (
                                <span className="timeline-edited">(edited)</span>
                              )}
                            </div>
                            {isEditing ? (
                              <div className="comment-edit-area">
                                <textarea
                                  className="comment-textarea"
                                  value={editingCommentText}
                                  onChange={(e) => setEditingCommentText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                      e.preventDefault();
                                      void handleUpdateComment(item.id);
                                    }
                                    if (e.key === "Escape") {
                                      setEditingCommentId(null);
                                    }
                                  }}
                                  rows={3}
                                  autoFocus
                                />
                                <div className="comment-compose-actions">
                                  <button
                                    className="btn-primary btn-sm"
                                    onClick={() => void handleUpdateComment(item.id)}
                                    disabled={editingCommentText.trim() === ""}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="btn-secondary btn-sm"
                                    onClick={() => setEditingCommentId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="timeline-comment-body">
                                {renderMentions(item.content, detail.board_members)}
                              </p>
                            )}
                            {!isEditing && (canEdit || canDelete) && (
                              <div className="timeline-actions">
                                {canEdit && (
                                  <button
                                    className="btn-text btn-xs"
                                    onClick={() => {
                                      setEditingCommentId(item.id);
                                      setEditingCommentText(item.content);
                                    }}
                                  >
                                    Edit
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    className="btn-text btn-xs btn-danger-text"
                                    onClick={() => void handleDeleteComment(item.id)}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            )}
                            {!isEditing && (
                              <ReactionBar
                                boardId={boardId}
                                targetType="comment"
                                targetId={item.id}
                                reactions={item.reactions}
                                currentUserId={currentUser.id}
                                onReactionToggled={() => void refreshDetail()}
                              />
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={item.id} className="timeline-item timeline-activity">
                        <span className="timeline-activity-icon">
                          {"\u2022"}
                        </span>
                        <div className="timeline-content">
                          <p className="timeline-activity-text">
                            <span className="timeline-actor">
                              {item.username ?? "System"}
                            </span>
                            {" "}
                            {describeActivity({
                              id: item.id,
                              card_id: "",
                              board_id: "",
                              action: item.action,
                              detail: item.detail,
                              timestamp: item.timestamp,
                            })}
                          </p>
                          <span className="timeline-time">{relativeTime(item.timestamp)}</span>
                          <ReactionBar
                            boardId={boardId}
                            targetType="activity"
                            targetId={item.id}
                            reactions={item.reactions}
                            currentUserId={currentUser.id}
                            onReactionToggled={() => void refreshDetail()}
                          />
                        </div>
                      </div>
                    );
                  })}
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
