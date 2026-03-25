import { describe, expect, it } from "bun:test";
import type { BoardCard, Column, Label } from "./api.ts";
import {
  buildVisibleCardIds,
  countVisibleCards,
  mergeLabels,
  reorderColumnIds,
  reorderColumns,
} from "./board-utils.ts";

function makeCard(overrides: Partial<BoardCard>): BoardCard {
  return {
    id: overrides.id ?? "card-1",
    title: overrides.title ?? "Untitled",
    description: overrides.description ?? "",
    position: overrides.position ?? 0,
    column_id: overrides.column_id ?? "column-1",
    created_at: overrides.created_at ?? "2026-03-23T00:00:00Z",
    due_date: overrides.due_date ?? null,
    start_date: overrides.start_date ?? null,
    checklist: overrides.checklist ?? "[]",
    updated_at: overrides.updated_at ?? "2026-03-23T00:00:00Z",
    labels: overrides.labels ?? [],
    checklist_total: overrides.checklist_total ?? 0,
    checklist_done: overrides.checklist_done ?? 0,
  };
}

function makeColumn(id: string, cards: BoardCard[], position: number): Column {
  return {
    id,
    title: `Column ${position + 1}`,
    position,
    cards,
  };
}

describe("buildVisibleCardIds", () => {
  const bugLabel: Label = {
    id: "label-bug",
    board_id: "board-1",
    name: "Bug",
    color: "#e74c3c",
    position: 0,
  };

  const featureLabel: Label = {
    id: "label-feature",
    board_id: "board-1",
    name: "Feature",
    color: "#3498db",
    position: 1,
  };

  const columns = [
    makeColumn(
      "column-1",
      [
        makeCard({
          id: "card-a",
          title: "Fix login bug",
          description: "Escape wildcard handling in search",
          labels: [bugLabel],
        }),
        makeCard({
          id: "card-b",
          title: "Ship board filters",
          description: "Add label pills to the board header",
          labels: [featureLabel],
        }),
      ],
      0
    ),
  ];

  it("filters by local text match and active label", () => {
    const visible = buildVisibleCardIds(columns, "search", bugLabel.id);
    expect([...visible]).toEqual(["card-a"]);
    expect(countVisibleCards(columns, visible)).toBe(1);
  });

  it("narrows search results with debounced API matches when provided", () => {
    const visible = buildVisibleCardIds(
      columns,
      "board",
      null,
      new Set(["card-a"])
    );

    expect([...visible]).toEqual([]);
  });
});

describe("reorderColumnIds", () => {
  const columns = [
    makeColumn("todo", [], 0),
    makeColumn("doing", [], 1),
    makeColumn("done", [], 2),
  ];

  it("moves a column before another target", () => {
    expect(reorderColumnIds(columns, "done", "todo", "before")).toEqual([
      "done",
      "todo",
      "doing",
    ]);
  });

  it("moves a column after another target", () => {
    expect(reorderColumnIds(columns, "todo", "doing", "after")).toEqual([
      "doing",
      "todo",
      "done",
    ]);
  });

  it("rebuilds ordered columns with fresh positions", () => {
    const reordered = reorderColumns(columns, ["doing", "done", "todo"]);
    expect(reordered.map((column) => column.id)).toEqual([
      "doing",
      "done",
      "todo",
    ]);
    expect(reordered.map((column) => column.position)).toEqual([0, 1, 2]);
  });
});

describe("mergeLabels", () => {
  it("deduplicates by id and keeps labels position-sorted", () => {
    const merged = mergeLabels(
      [
        {
          id: "label-2",
          board_id: "board-1",
          name: "Later",
          color: "#f1c40f",
          position: 2,
        },
      ],
      [
        {
          id: "label-1",
          board_id: "board-1",
          name: "Now",
          color: "#2ecc71",
          position: 0,
        },
        {
          id: "label-2",
          board_id: "board-1",
          name: "Later",
          color: "#f1c40f",
          position: 1,
        },
      ]
    );

    expect(merged.map((label) => label.id)).toEqual(["label-1", "label-2"]);
    expect(merged.map((label) => label.position)).toEqual([0, 1]);
  });
});
