import type { BoardCard, Column, Label } from "./api.ts";

export type ColumnDropPlacement = "before" | "after";

export function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function buildVisibleCardIds(
  columns: Column[],
  query: string,
  activeLabelId: string | null,
  remoteSearchIds: Set<string> | null = null
): Set<string> {
  const normalizedQuery = normalizeSearchQuery(query);
  const useRemoteResults = normalizedQuery !== "" && remoteSearchIds !== null;
  const visibleCardIds = new Set<string>();

  for (const column of columns) {
    for (const card of column.cards) {
      if (
        activeLabelId &&
        !card.labels.some((label) => label.id === activeLabelId)
      ) {
        continue;
      }

      if (
        normalizedQuery !== "" &&
        !`${card.title} ${card.description}`.toLowerCase().includes(normalizedQuery)
      ) {
        continue;
      }

      if (useRemoteResults && !remoteSearchIds.has(card.id)) {
        continue;
      }

      visibleCardIds.add(card.id);
    }
  }

  return visibleCardIds;
}

export function countVisibleCards(
  columns: Column[],
  visibleCardIds: Set<string>
): number {
  let count = 0;

  for (const column of columns) {
    for (const card of column.cards) {
      if (visibleCardIds.has(card.id)) {
        count += 1;
      }
    }
  }

  return count;
}

export function reorderColumnIds(
  columns: Column[],
  draggedId: string,
  targetId: string,
  placement: ColumnDropPlacement
): string[] {
  const currentIds = columns.map((column) => column.id);

  if (draggedId === targetId) {
    return currentIds;
  }

  const draggedIndex = currentIds.indexOf(draggedId);
  const targetIndex = currentIds.indexOf(targetId);
  if (draggedIndex === -1 || targetIndex === -1) {
    return currentIds;
  }

  const nextIds = currentIds.filter((id) => id !== draggedId);
  const nextTargetIndex = nextIds.indexOf(targetId);
  const insertIndex =
    placement === "before" ? nextTargetIndex : nextTargetIndex + 1;

  nextIds.splice(insertIndex, 0, draggedId);
  return nextIds;
}

export function mergeLabels(current: Label[], incoming: Label[]): Label[] {
  const labelsById = new Map(current.map((label) => [label.id, label]));

  for (const label of incoming) {
    labelsById.set(label.id, label);
  }

  return Array.from(labelsById.values()).sort(
    (left, right) =>
      left.position - right.position || left.name.localeCompare(right.name)
  );
}

export function reorderColumns(columns: Column[], orderedIds: string[]): Column[] {
  const columnsById = new Map(columns.map((column) => [column.id, column]));

  return orderedIds
    .map((id, index) => {
      const column = columnsById.get(id);
      if (!column) {
        return null;
      }

      return {
        ...column,
        position: index,
      };
    })
    .filter((column): column is Column => column !== null);
}

export function cardIsVisible(
  card: BoardCard,
  visibleCardIds: Set<string>
): boolean {
  return visibleCardIds.has(card.id);
}
