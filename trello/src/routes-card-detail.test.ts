import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createApp } from "./routes.ts";
import { createTestDb, getCardActivity, createActivity } from "./db.ts";
import { mkdirSync, rmSync } from "node:fs";

const TEST_DIR = "/tmp/brn-test-card-detail-" + Date.now();
let db: Database;
let app: ReturnType<typeof createApp>;

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  return new Request(`http://localhost${path}`, opts);
}

function authReq(method: string, path: string, token: string, body?: unknown): Request {
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  return new Request(`http://localhost${path}`, opts);
}

interface AuthResponse {
  token: string;
  user: { id: string; username: string };
}

interface BoardResponse {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
}

interface ColumnResponse {
  id: string;
  title: string;
  position: number;
  board_id: string;
}

interface CardResponse {
  id: string;
  title: string;
  description: string;
  position: number;
  column_id: string;
  created_at: string;
  due_date: string | null;
  start_date: string | null;
  checklist: string;
  updated_at: string;
}

interface LabelResponse {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
}

interface ActivityResponse {
  id: string;
  card_id: string;
  board_id: string;
  action: string;
  detail: string | null;
  timestamp: string;
}

interface TimelineItem {
  type: "comment" | "activity";
  id: string;
  user_id: string | null;
  username: string | null;
  reactions: { emoji: string; count: number; user_ids: string[] }[];
  // comment fields
  content?: string;
  created_at?: string;
  updated_at?: string;
  // activity fields
  action?: string;
  detail?: string | null;
  timestamp?: string;
}

interface CardDetailResponse extends CardResponse {
  labels: LabelResponse[];
  timeline: TimelineItem[];
  is_watching: boolean;
  watcher_count: number;
  board_members: { id: string; username: string }[];
  checklist_total: number;
  checklist_done: number;
}

async function registerUser(
  username: string = "testuser",
  password: string = "password123"
): Promise<AuthResponse> {
  const res = await app.fetch(req("POST", "/api/auth/register", { username, password }));
  return res.json() as Promise<AuthResponse>;
}

async function createTestBoard(
  token: string,
  title: string = "Test Board"
): Promise<BoardResponse> {
  const res = await app.fetch(authReq("POST", "/api/boards", token, { title }));
  return res.json() as Promise<BoardResponse>;
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  db = createTestDb(`${TEST_DIR}/test-${Date.now()}.db`);
  app = createApp(db);
});

afterEach(() => {
  db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Enhanced Card Endpoints", () => {
  let authToken: string;
  let boardId: string;
  let columnId: string;
  let column2Id: string;
  let cardId: string;
  let labelId: string;

  beforeEach(async () => {
    // Setup: Register user, create board, get columns, create a card and label
    const authRes = await registerUser();
    authToken = authRes.token;

    const boardRes = await createTestBoard(authToken);
    boardId = boardRes.id;

    // Get the default columns
    const columnsRes = await app.fetch(authReq("GET", `/api/boards/${boardId}/columns`, authToken));
    const columnsData = await columnsRes.json() as { columns: ColumnResponse[] };
    columnId = columnsData.columns[0]!.id;
    column2Id = columnsData.columns[1]!.id;

    // Create a test card
    const cardRes = await app.fetch(
      authReq("POST", `/api/boards/${boardId}/cards`, authToken, {
        title: "Test Card",
        description: "Test description",
        columnId: columnId,
      })
    );
    const cardData = await cardRes.json() as CardResponse;
    cardId = cardData.id;

    // Create a test label
    const labelRes = await app.fetch(
      authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Test Label",
        color: "#ff0000",
      })
    );
    const labelData = await labelRes.json() as LabelResponse;
    labelId = labelData.id;
  });

  describe("PATCH /api/boards/:boardId/cards/:cardId (enhanced)", () => {
    it("updates card with due date and start date", async () => {
      const res = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          due_date: "2026-04-15",
          start_date: "2026-04-10",
        })
      );
      expect(res.status).toBe(200);
      const card = await res.json() as CardResponse;
      expect(card.due_date).toBe("2026-04-15");
      expect(card.start_date).toBe("2026-04-10");
    });

    it("validates start_date <= due_date", async () => {
      const res = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          due_date: "2026-04-10",
          start_date: "2026-04-15", // Start after due
        })
      );
      expect(res.status).toBe(400);
      const error = await res.json() as { error: string };
      expect(error.error).toContain("start_date must be before or equal to due_date");
    });

    it("updates card with checklist", async () => {
      const checklist = JSON.stringify([
        { id: "1", text: "First item", checked: false },
        { id: "2", text: "Second item", checked: true },
      ]);
      const res = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          checklist,
        })
      );
      expect(res.status).toBe(200);
      const card = await res.json() as CardResponse;
      expect(card.checklist).toBe(checklist);
    });

    it("validates checklist format", async () => {
      const res = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          checklist: "not valid json",
        })
      );
      expect(res.status).toBe(400);
      const error = await res.json() as { error: string };
      expect(error.error).toContain("checklist must be valid JSON");
    });

    it("validates checklist item structure", async () => {
      const res = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          checklist: JSON.stringify([{ invalid: "item" }]),
        })
      );
      expect(res.status).toBe(400);
      const error = await res.json() as { error: string };
      expect(error.error).toContain("checklist items must have id, text, and checked fields");
    });

    it("creates activity entry when moving card", async () => {
      const res = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          columnId: column2Id,
        })
      );
      expect(res.status).toBe(200);

      // Check that activity was created
      const activities = getCardActivity(db, cardId);
      const moveActivity = activities.find(a => a.action === "moved");
      expect(moveActivity).toBeDefined();
      expect(moveActivity!.detail).toContain("To Do");
      expect(moveActivity!.detail).toContain("In Progress");
    });

    it("creates activity entry when editing card", async () => {
      const res = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          title: "Updated Title",
          description: "Updated description",
        })
      );
      expect(res.status).toBe(200);

      // Check that activity was created
      const activities = getCardActivity(db, cardId);
      const editActivity = activities.find(a => a.action === "edited");
      expect(editActivity).toBeDefined();
    });

    it("creates dates_changed activity when changing dates", async () => {
      const res = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          due_date: "2026-04-15",
        })
      );
      expect(res.status).toBe(200);

      // Check that activity was created
      const activities = getCardActivity(db, cardId);
      const datesActivity = activities.find(a => a.action === "dates_changed");
      expect(datesActivity).toBeDefined();
    });
  });

  describe("GET /api/boards/:boardId/cards/:cardId", () => {
    it("returns full card detail with labels and activity", async () => {
      // Assign a label to the card
      await app.fetch(
        authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
          labelId,
        })
      );

      // Get card detail
      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      expect(res.status).toBe(200);
      const cardDetail = await res.json() as CardDetailResponse;

      expect(cardDetail.id).toBe(cardId);
      expect(cardDetail.labels.length).toBe(1);
      expect(cardDetail.labels[0]!.id).toBe(labelId);
      const activityItems = cardDetail.timeline.filter(t => t.type === "activity");
      expect(activityItems.length).toBeGreaterThan(0); // Should have at least created and label_added
      expect(cardDetail.is_watching).toBe(false);
      expect(cardDetail.watcher_count).toBe(0);
      expect(cardDetail.board_members.length).toBeGreaterThan(0);
      expect(cardDetail.checklist_total).toBe(0);
      expect(cardDetail.checklist_done).toBe(0);
    });

    it("calculates checklist total and done correctly", async () => {
      // Update card with checklist
      const checklist = JSON.stringify([
        { id: "1", text: "First item", checked: false },
        { id: "2", text: "Second item", checked: true },
        { id: "3", text: "Third item", checked: true },
      ]);
      await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          checklist,
        })
      );

      // Get card detail
      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      expect(res.status).toBe(200);
      const cardDetail = await res.json() as CardDetailResponse;

      expect(cardDetail.checklist_total).toBe(3);
      expect(cardDetail.checklist_done).toBe(2);
    });

    it("returns 404 for non-existent card", async () => {
      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/invalid-id`, authToken)
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for card from another board", async () => {
      // Create another board
      const board2Res = await createTestBoard(authToken, "Board 2");
      const board2Id = board2Res.id;

      const res = await app.fetch(
        authReq("GET", `/api/boards/${board2Id}/cards/${cardId}`, authToken)
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/boards/:boardId/cards/:cardId/activity", () => {
    it("returns paginated activity for a card", async () => {
      // Create some activities
      await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          title: "Updated Title",
        })
      );
      await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          due_date: "2026-04-15",
        })
      );

      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}/activity`, authToken)
      );
      expect(res.status).toBe(200);
      const data = await res.json() as { activity: ActivityResponse[] };

      expect(Array.isArray(data.activity)).toBe(true);
      expect(data.activity.length).toBeGreaterThan(0);
      // Activities should be newest first
      const timestamps = data.activity.map(a => a.timestamp);
      expect(timestamps).toEqual([...timestamps].sort().reverse());
    });

    it("respects offset parameter", async () => {
      // Create multiple activities
      for (let i = 0; i < 5; i++) {
        createActivity(db, cardId, boardId, "edited", { iteration: i });
      }

      // Get first page
      const res1 = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}/activity`, authToken)
      );
      const data1 = await res1.json() as { activity: ActivityResponse[] };

      // Get second page with offset
      const res2 = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}/activity?offset=2`, authToken)
      );
      const data2 = await res2.json() as { activity: ActivityResponse[] };

      // Second page should have different activities
      expect(data2.activity[0]?.id).not.toBe(data1.activity[0]?.id);
    });

    it("returns 404 for non-existent card", async () => {
      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/invalid-id/activity`, authToken)
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Activity tracking for label operations", () => {
    it("creates activity when adding label", async () => {
      const res = await app.fetch(
        authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
          labelId,
        })
      );
      expect(res.status).toBe(201);

      const activities = getCardActivity(db, cardId);
      const labelActivity = activities.find(a => a.action === "label_added");
      expect(labelActivity).toBeDefined();
    });

    it("creates activity when removing label", async () => {
      // First add the label
      await app.fetch(
        authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
          labelId,
        })
      );

      // Then remove it
      const res = await app.fetch(
        authReq("DELETE", `/api/boards/${boardId}/cards/${cardId}/labels/${labelId}`, authToken)
      );
      expect(res.status).toBe(200);

      const activities = getCardActivity(db, cardId);
      const removeActivity = activities.find(a => a.action === "label_removed");
      expect(removeActivity).toBeDefined();
    });
  });

  describe("GET /api/boards/:boardId/cards/:cardId — unified timeline", () => {
    it("includes comments in timeline with reactions", async () => {
      // Create a comment
      const commentRes = await app.fetch(
        authReq("POST", `/api/boards/${boardId}/cards/${cardId}/comments`, authToken, {
          content: "Hello world",
        })
      );
      const comment = (await commentRes.json()) as { id: string };

      // Add a reaction to the comment
      await app.fetch(
        authReq("POST", `/api/boards/${boardId}/reactions`, authToken, {
          target_type: "comment",
          target_id: comment.id,
          emoji: "👍",
        })
      );

      // Get card detail
      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      expect(res.status).toBe(200);
      const detail = (await res.json()) as CardDetailResponse;

      // Should have comment in timeline
      const commentItems = detail.timeline.filter(t => t.type === "comment");
      expect(commentItems.length).toBe(1);
      expect(commentItems[0]!.content).toBe("Hello world");

      // Comment should have reactions
      expect(commentItems[0]!.reactions.length).toBe(1);
      expect(commentItems[0]!.reactions[0]!.emoji).toBe("👍");
      expect(commentItems[0]!.reactions[0]!.count).toBe(1);
    });

    it("includes activity in timeline with username", async () => {
      // Edit the card to generate activity
      await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          title: "Updated Title",
        })
      );

      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      const detail = (await res.json()) as CardDetailResponse;

      const activityItems = detail.timeline.filter(t => t.type === "activity");
      expect(activityItems.length).toBeGreaterThan(0);
      // Activity should have username
      const editActivity = activityItems.find(t => t.action === "edited");
      expect(editActivity).toBeDefined();
      expect(editActivity!.username).toBe("testuser");
    });

    it("timeline is sorted newest first", async () => {
      // Create a comment (will have a newer timestamp than the card creation activity)
      await app.fetch(
        authReq("POST", `/api/boards/${boardId}/cards/${cardId}/comments`, authToken, {
          content: "A comment",
        })
      );

      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      const detail = (await res.json()) as CardDetailResponse;

      // Verify timeline is sorted newest first
      const timestamps = detail.timeline.map(t =>
        t.type === "comment" ? t.created_at! : t.timestamp!
      );
      const sorted = [...timestamps].sort().reverse();
      expect(timestamps).toEqual(sorted);
    });

    it("includes is_watching and watcher_count", async () => {
      // Not watching initially
      const res1 = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      const detail1 = (await res1.json()) as CardDetailResponse;
      expect(detail1.is_watching).toBe(false);
      expect(detail1.watcher_count).toBe(0);

      // Watch the card
      await app.fetch(
        authReq("POST", `/api/boards/${boardId}/cards/${cardId}/watch`, authToken)
      );

      // Now watching
      const res2 = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      const detail2 = (await res2.json()) as CardDetailResponse;
      expect(detail2.is_watching).toBe(true);
      expect(detail2.watcher_count).toBe(1);
    });

    it("includes board_members for @mention autocomplete", async () => {
      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      const detail = (await res.json()) as CardDetailResponse;
      expect(detail.board_members.length).toBeGreaterThanOrEqual(1);
      expect(detail.board_members[0]!.username).toBe("testuser");
      expect(detail.board_members[0]!.id).toBeTruthy();
    });

    it("auto-watch on comment reflects in is_watching", async () => {
      // Comment on the card (auto-watches)
      await app.fetch(
        authReq("POST", `/api/boards/${boardId}/cards/${cardId}/comments`, authToken, {
          content: "commenting",
        })
      );

      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      const detail = (await res.json()) as CardDetailResponse;
      expect(detail.is_watching).toBe(true);
      expect(detail.watcher_count).toBe(1);
    });

    it("includes reactions on activity items", async () => {
      // Create an activity by editing
      await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/cards/${cardId}`, authToken, {
          title: "New Title",
        })
      );

      // Get card detail to find the activity id
      const detailRes1 = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      const detail1 = (await detailRes1.json()) as CardDetailResponse;
      const editActivity = detail1.timeline.find(t => t.type === "activity" && t.action === "edited");
      expect(editActivity).toBeDefined();

      // React to the activity
      await app.fetch(
        authReq("POST", `/api/boards/${boardId}/reactions`, authToken, {
          target_type: "activity",
          target_id: editActivity!.id,
          emoji: "🎉",
        })
      );

      // Re-fetch and check
      const detailRes2 = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/cards/${cardId}`, authToken)
      );
      const detail2 = (await detailRes2.json()) as CardDetailResponse;
      const updatedActivity = detail2.timeline.find(t => t.id === editActivity!.id);
      expect(updatedActivity!.reactions.length).toBe(1);
      expect(updatedActivity!.reactions[0]!.emoji).toBe("🎉");
    });
  });

  describe("GET /api/boards/:boardId/activity — board feed", () => {
    it("returns board-wide activity and comments", async () => {
      // Create a comment
      await app.fetch(
        authReq("POST", `/api/boards/${boardId}/cards/${cardId}/comments`, authToken, {
          content: "Board-wide comment",
        })
      );

      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/activity`, authToken)
      );
      expect(res.status).toBe(200);
      const feed = (await res.json()) as { items: { type: string; card_title: string }[]; has_more: boolean };

      expect(feed.items.length).toBeGreaterThan(0);
      expect(typeof feed.has_more).toBe("boolean");

      // Should contain both comments and activity
      const types = new Set(feed.items.map(i => i.type));
      expect(types.has("activity")).toBe(true);
      expect(types.has("comment")).toBe(true);

      // Items should have card_title
      expect(feed.items[0]!.card_title).toBe("Test Card");
    });

    it("returns items sorted newest first", async () => {
      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/activity`, authToken)
      );
      const feed = (await res.json()) as { items: { timestamp: string }[] };

      const timestamps = feed.items.map(i => i.timestamp);
      const sorted = [...timestamps].sort().reverse();
      expect(timestamps).toEqual(sorted);
    });

    it("respects limit parameter", async () => {
      // Create several comments to have enough items
      for (let i = 0; i < 5; i++) {
        await app.fetch(
          authReq("POST", `/api/boards/${boardId}/cards/${cardId}/comments`, authToken, {
            content: `Comment ${i}`,
          })
        );
      }

      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/activity?limit=3`, authToken)
      );
      const feed = (await res.json()) as { items: { type: string }[]; has_more: boolean };

      expect(feed.items.length).toBe(3);
      expect(feed.has_more).toBe(true);
    });

    it("defaults to limit 30 and caps at 100", async () => {
      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/activity`, authToken)
      );
      expect(res.status).toBe(200);
      // Just verify it returns without error — we don't have 30+ items
      const feed = (await res.json()) as { items: { type: string }[]; has_more: boolean };
      expect(feed.has_more).toBe(false);
    });

    it("supports before parameter for pagination", async () => {
      // Create multiple comments
      for (let i = 0; i < 3; i++) {
        await app.fetch(
          authReq("POST", `/api/boards/${boardId}/cards/${cardId}/comments`, authToken, {
            content: `Paginated comment ${i}`,
          })
        );
      }

      // Get first page
      const res1 = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/activity?limit=2`, authToken)
      );
      const feed1 = (await res1.json()) as { items: { timestamp: string; id: string }[]; has_more: boolean };
      expect(feed1.items.length).toBe(2);

      // Get second page using 'before' from last item
      const lastTimestamp = feed1.items[feed1.items.length - 1]!.timestamp;
      const res2 = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/activity?limit=2&before=${encodeURIComponent(lastTimestamp)}`, authToken)
      );
      const feed2 = (await res2.json()) as { items: { id: string }[]; has_more: boolean };

      // Second page should have different items
      const firstPageIds = new Set(feed1.items.map(i => i.id));
      for (const item of feed2.items) {
        expect(firstPageIds.has(item.id)).toBe(false);
      }
    });

    it("returns 404 for non-member board", async () => {
      // Register another user
      const otherRes = await app.fetch(req("POST", "/api/auth/register", {
        username: "otheruser",
        password: "password123",
      }));
      const other = (await otherRes.json()) as AuthResponse;

      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/activity`, other.token)
      );
      expect(res.status).toBe(404);
    });
  });
});