import { describe, expect, it } from "bun:test";
import {
  describeActivity,
  getChecklistProgress,
  getDueBadge,
  parseChecklist,
} from "./card-utils.ts";

describe("parseChecklist", () => {
  it("returns valid checklist items and ignores invalid entries", () => {
    const items = parseChecklist(
      JSON.stringify([
        { id: "a", text: "Write UI", checked: true },
        { id: "b", text: "Ship CSS", checked: false },
        { nope: true },
      ])
    );

    expect(items).toHaveLength(2);
    expect(getChecklistProgress(items)).toEqual({ total: 2, done: 1 });
  });

  it("returns an empty array for invalid JSON", () => {
    expect(parseChecklist("not-json")).toEqual([]);
  });
});

describe("getDueBadge", () => {
  const reference = new Date(2026, 2, 23, 9, 0, 0, 0);

  it("classifies overdue, today, soon, and future dates", () => {
    expect(getDueBadge("2026-03-22", reference)?.tone).toBe("overdue");
    expect(getDueBadge("2026-03-23", reference)?.tone).toBe("today");
    expect(getDueBadge("2026-03-25", reference)?.tone).toBe("soon");
    expect(getDueBadge("2026-03-30", reference)?.tone).toBe("future");
  });

  it("returns null when there is no due date", () => {
    expect(getDueBadge(null, reference)).toBeNull();
  });
});

describe("describeActivity", () => {
  it("renders move activity detail when available", () => {
    expect(
      describeActivity({
        id: "1",
        card_id: "card-1",
        board_id: "board-1",
        action: "moved",
        detail: JSON.stringify({ from: "To Do", to: "Done" }),
        timestamp: "2026-03-23T18:00:00Z",
      })
    ).toBe("Moved from To Do to Done");
  });
});
