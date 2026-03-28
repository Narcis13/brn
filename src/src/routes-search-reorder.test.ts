import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createApp } from "./routes.ts";
import { createTestDb } from "./db.ts";
import { mkdirSync, rmSync } from "node:fs";
import { initializeActivitySubscriber } from "./activity-subscriber.ts";
import { eventBus } from "./event-bus.ts";

const TEST_DIR = "/tmp/brn-test-search-reorder-" + Date.now();

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
  cards: CardResponse[];
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

interface CardSearchResponse extends CardResponse {
  column_title: string;
  labels: LabelResponse[];
}

function formatDateOnly(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return formatDateOnly(date);
}

async function registerUser(
  username: string = "testuser",
  password: string = "password123"
): Promise<AuthResponse> {
  const res = await app.fetch(req("POST", "/api/auth/register", { username, password }));
  return res.json() as Promise<AuthResponse>;
}

async function createBoard(
  token: string,
  title: string = "Search Board"
): Promise<BoardResponse> {
  const res = await app.fetch(authReq("POST", "/api/boards", token, { title }));
  return res.json() as Promise<BoardResponse>;
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  db = createTestDb(`${TEST_DIR}/test-${Date.now()}.db`);
  eventBus.clear(); // Clear any existing subscriptions
  initializeActivitySubscriber(db);
  app = createApp(db);
});

afterEach(() => {
  db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Search and column reorder endpoints", () => {
  let authToken: string;
  let boardId: string;
  let columnIds: string[];
  let cardIds: string[];
  let labelIds: string[];

  beforeEach(async () => {
    const auth = await registerUser("alice", "secret123");
    authToken = auth.token;

    const board = await createBoard(authToken);
    boardId = board.id;

    const columnsRes = await app.fetch(authReq("GET", `/api/boards/${boardId}/columns`, authToken));
    const columnsData = await columnsRes.json() as { columns: ColumnResponse[] };
    columnIds = columnsData.columns.map((column) => column.id);

    const labels: Array<{ name: string; color: string }> = [
      { name: "Bug", color: "#e74c3c" },
      { name: "Feature", color: "#3498db" },
      { name: "Ops", color: "#2ecc71" },
    ];

    labelIds = [];
    for (const label of labels) {
      const labelRes = await app.fetch(
        authReq("POST", `/api/boards/${boardId}/labels`, authToken, label)
      );
      const createdLabel = await labelRes.json() as LabelResponse;
      labelIds.push(createdLabel.id);
    }

    const cards: Array<{
      title: string;
      description: string;
      columnId: string;
      dueDate: string | null;
      labelIds: string[];
    }> = [
      {
        title: "Fix login bug",
        description: "User cannot log in when the password contains symbols",
        columnId: columnIds[0]!,
        dueDate: dateOffset(-2),
        labelIds: [labelIds[0]!],
      },
      {
        title: "Add search feature",
        description: "Implement mobile card search and filters",
        columnId: columnIds[1]!,
        dueDate: dateOffset(0),
        labelIds: [labelIds[1]!],
      },
      {
        title: "Plan sprint review",
        description: "Prepare next week board review notes",
        columnId: columnIds[1]!,
        dueDate: dateOffset(3),
        labelIds: [labelIds[2]!],
      },
      {
        title: "Write documentation",
        description: "Refresh API docs",
        columnId: columnIds[2]!,
        dueDate: null,
        labelIds: [],
      },
      {
        title: "100%_complete",
        description: "Literal wildcard title",
        columnId: columnIds[0]!,
        dueDate: dateOffset(10),
        labelIds: [],
      },
      {
        title: "100abcxcomplete",
        description: "Decoy title that should not match escaped wildcard search",
        columnId: columnIds[2]!,
        dueDate: dateOffset(11),
        labelIds: [],
      },
    ];

    cardIds = [];
    for (const card of cards) {
      const cardRes = await app.fetch(
        authReq("POST", `/api/boards/${boardId}/cards`, authToken, {
          title: card.title,
          description: card.description,
          columnId: card.columnId,
        })
      );
      const createdCard = await cardRes.json() as { id: string };
      cardIds.push(createdCard.id);

      if (card.dueDate) {
        await app.fetch(
          authReq("PATCH", `/api/boards/${boardId}/cards/${createdCard.id}`, authToken, {
            due_date: card.dueDate,
          })
        );
      }

      for (const labelId of card.labelIds) {
        await app.fetch(
          authReq("POST", `/api/boards/${boardId}/cards/${createdCard.id}/labels`, authToken, {
            labelId,
          })
        );
      }
    }
  });

  describe("GET /api/boards/:boardId/search", () => {
    it("searches title and description case-insensitively", async () => {
      const titleRes = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search?q=BUG`, authToken)
      );
      expect(titleRes.status).toBe(200);
      const titleData = await titleRes.json() as { cards: CardSearchResponse[] };
      expect(titleData.cards).toHaveLength(1);
      expect(titleData.cards[0]!.title).toBe("Fix login bug");

      const descriptionRes = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search?q=mobile`, authToken)
      );
      expect(descriptionRes.status).toBe(200);
      const descriptionData = await descriptionRes.json() as { cards: CardSearchResponse[] };
      expect(descriptionData.cards).toHaveLength(1);
      expect(descriptionData.cards[0]!.title).toBe("Add search feature");
    });

    it("combines text, label, and due filters", async () => {
      const res = await app.fetch(
        authReq(
          "GET",
          `/api/boards/${boardId}/search?q=fix&label=${labelIds[0]}&due=overdue`,
          authToken
        )
      );
      expect(res.status).toBe(200);

      const data = await res.json() as { cards: CardSearchResponse[] };
      expect(data.cards).toHaveLength(1);
      expect(data.cards[0]!.title).toBe("Fix login bug");
      expect(data.cards[0]!.labels.map((label) => label.name)).toEqual(["Bug"]);
    });

    it("filters overdue, today, week, and none buckets", async () => {
      const overdueRes = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search?due=overdue`, authToken)
      );
      const overdueData = await overdueRes.json() as { cards: CardSearchResponse[] };
      expect(overdueRes.status).toBe(200);
      expect(overdueData.cards.map((card) => card.title)).toEqual(["Fix login bug"]);

      const todayRes = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search?due=today`, authToken)
      );
      const todayData = await todayRes.json() as { cards: CardSearchResponse[] };
      expect(todayData.cards.map((card) => card.title)).toEqual(["Add search feature"]);

      const weekRes = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search?due=week`, authToken)
      );
      const weekData = await weekRes.json() as { cards: CardSearchResponse[] };
      expect(weekData.cards.map((card) => card.title)).toEqual(["Plan sprint review"]);

      const noneRes = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search?due=none`, authToken)
      );
      const noneData = await noneRes.json() as { cards: CardSearchResponse[] };
      expect(noneData.cards.map((card) => card.title)).toEqual(["Write documentation"]);
    });

    it("returns column info and labels", async () => {
      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search?q=filters`, authToken)
      );
      expect(res.status).toBe(200);

      const data = await res.json() as { cards: CardSearchResponse[] };
      expect(data.cards).toHaveLength(1);
      expect(data.cards[0]!.column_title).toBe("In Progress");
      expect(data.cards[0]!.labels.map((label) => label.name)).toEqual(["Feature"]);
    });

    it("escapes SQL wildcard characters in the text query", async () => {
      const query = encodeURIComponent("100%_complete");
      const res = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search?q=${query}`, authToken)
      );
      expect(res.status).toBe(200);

      const data = await res.json() as { cards: CardSearchResponse[] };
      expect(data.cards).toHaveLength(1);
      expect(data.cards[0]!.title).toBe("100%_complete");
    });

    it("rejects invalid due filters and cross-board label ids", async () => {
      const invalidDueRes = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search?due=invalid`, authToken)
      );
      expect(invalidDueRes.status).toBe(400);

      const otherBoard = await createBoard(authToken, "Other Board");
      const otherLabelRes = await app.fetch(
        authReq("POST", `/api/boards/${otherBoard.id}/labels`, authToken, {
          name: "Other Label",
          color: "#f39c12",
        })
      );
      const otherLabel = await otherLabelRes.json() as LabelResponse;

      const invalidLabelRes = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search?label=${otherLabel.id}`, authToken)
      );
      expect(invalidLabelRes.status).toBe(404);
    });

    it("requires auth and board ownership", async () => {
      const unauthRes = await app.fetch(req("GET", `/api/boards/${boardId}/search`));
      expect(unauthRes.status).toBe(401);

      const otherUser = await registerUser("bob", "secret456");
      const otherUserRes = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/search`, otherUser.token)
      );
      expect(otherUserRes.status).toBe(404);
    });
  });

  describe("PATCH /api/boards/:boardId/columns/reorder", () => {
    it("reorders columns and keeps cards in their columns", async () => {
      const reordered = [columnIds[2]!, columnIds[0]!, columnIds[1]!];
      const res = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/columns/reorder`, authToken, {
          column_ids: reordered,
        })
      );
      expect(res.status).toBe(200);

      const columnsRes = await app.fetch(
        authReq("GET", `/api/boards/${boardId}/columns`, authToken)
      );
      const columnsData = await columnsRes.json() as { columns: ColumnResponse[] };
      expect(columnsData.columns.map((column) => column.id)).toEqual(reordered);

      const todoColumn = columnsData.columns.find((column) => column.id === columnIds[0]);
      expect(todoColumn?.cards.map((card) => card.title)).toContain("Fix login bug");
      expect(todoColumn?.cards.map((card) => card.title)).toContain("100%_complete");
    });

    it("rejects invalid column id sets and invalid payload types", async () => {
      const partialRes = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/columns/reorder`, authToken, {
          column_ids: columnIds.slice(0, 2),
        })
      );
      expect(partialRes.status).toBe(400);

      const duplicateRes = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/columns/reorder`, authToken, {
          column_ids: [columnIds[0], columnIds[0], columnIds[2]],
        })
      );
      expect(duplicateRes.status).toBe(400);

      const invalidTypeRes = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/columns/reorder`, authToken, {
          column_ids: "not-an-array",
        })
      );
      expect(invalidTypeRes.status).toBe(400);
    });

    it("rejects columns from another board and enforces auth", async () => {
      const otherBoard = await createBoard(authToken, "Other Board");
      const otherColumnsRes = await app.fetch(
        authReq("GET", `/api/boards/${otherBoard.id}/columns`, authToken)
      );
      const otherColumns = await otherColumnsRes.json() as { columns: ColumnResponse[] };

      const crossBoardRes = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/columns/reorder`, authToken, {
          column_ids: otherColumns.columns.map((column) => column.id),
        })
      );
      expect(crossBoardRes.status).toBe(400);

      const unauthRes = await app.fetch(
        req("PATCH", `/api/boards/${boardId}/columns/reorder`, {
          column_ids: columnIds,
        })
      );
      expect(unauthRes.status).toBe(401);

      const otherUser = await registerUser("charlie", "secret789");
      const otherUserRes = await app.fetch(
        authReq("PATCH", `/api/boards/${boardId}/columns/reorder`, otherUser.token, {
          column_ids: columnIds,
        })
      );
      expect(otherUserRes.status).toBe(404);
    });
  });
});
