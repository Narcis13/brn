import type { Activity, ChecklistItem } from "./api.ts";

export type DueTone = "overdue" | "today" | "soon" | "future";

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day, 12, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function atLocalNoon(reference: Date): Date {
  const next = new Date(reference);
  next.setHours(12, 0, 0, 0);
  return next;
}

export function parseChecklist(rawChecklist: string): ChecklistItem[] {
  try {
    const parsed = JSON.parse(rawChecklist) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isChecklistItem);
  } catch {
    return [];
  }
}

export function stringifyChecklist(items: ChecklistItem[]): string {
  return JSON.stringify(items);
}

export function getChecklistProgress(items: ChecklistItem[]): {
  total: number;
  done: number;
} {
  return {
    total: items.length,
    done: items.filter((item) => item.checked).length,
  };
}

export function getDueBadge(
  dueDate: string | null,
  referenceDate: Date = new Date()
): { tone: DueTone; label: string } | null {
  if (!dueDate) {
    return null;
  }

  const due = parseDateOnly(dueDate);
  if (!due) {
    return {
      tone: "future",
      label: dueDate,
    };
  }

  const today = atLocalNoon(referenceDate);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { tone: "overdue", label: formatDateLabel(dueDate) };
  }
  if (diffDays === 0) {
    return { tone: "today", label: formatDateLabel(dueDate) };
  }
  if (diffDays <= 3) {
    return { tone: "soon", label: formatDateLabel(dueDate) };
  }

  return { tone: "future", label: formatDateLabel(dueDate) };
}

export function formatDateLabel(value: string): string {
  const date = parseDateOnly(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatActivityTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function describeActivity(activity: Activity): string {
  const detail = parseActivityDetail(activity.detail);

  switch (activity.action) {
    case "created":
      return "Card created";
    case "moved":
      if (detail?.from && detail?.to) {
        return `Moved from ${detail.from} to ${detail.to}`;
      }
      return "Moved to a new column";
    case "edited":
      return "Card updated";
    case "dates_changed":
      return "Dates changed";
    case "checklist_added":
      return "Checklist item added";
    case "checklist_removed":
      return "Checklist item removed";
    case "checklist_checked":
      return "Checklist item completed";
    case "checklist_unchecked":
      return "Checklist item reopened";
    case "label_added":
      return "Label added";
    case "label_removed":
      return "Label removed";
    default:
      return activity.action.replace(/_/g, " ");
  }
}

function isChecklistItem(value: unknown): value is ChecklistItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.text === "string" &&
    typeof item.checked === "boolean"
  );
}

function parseActivityDetail(detail: string | null): Record<string, string> | null {
  if (!detail) {
    return null;
  }

  try {
    const parsed = JSON.parse(detail) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}
