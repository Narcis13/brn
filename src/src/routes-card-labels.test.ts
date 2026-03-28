import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createApp } from "./routes.ts";
import { createTestDb, getCardLabels } from "./db.ts";
import { mkdirSync, rmSync } from "node:fs";
import { initializeActivitySubscriber } from "./activity-subscriber.ts";
import { eventBus } from "./event-bus.ts";

const TEST_DIR = "/tmp/brn-test-card-labels-" + Date.now();
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
}

interface LabelResponse {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
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
  eventBus.clear(); // Clear any existing subscriptions
  initializeActivitySubscriber(db);
  app = createApp(db);
});

afterEach(() => {
  db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Card-Label Assignment Routes", () => {
  let authToken: string;
  let boardId: string;
  let columnId: string;
  let cardId: string;
  let labelId: string;
  let label2Id: string;

  beforeEach(async () => {
    // Register user and get token
    const authData = await registerUser();
    authToken = authData.token;

    // Create test board
    const boardData = await createTestBoard(authToken);
    boardId = boardData.id;

    // Get a column (created by default with board)
    const columnsRes = await app.fetch(authReq("GET", `/api/boards/${boardId}/columns`, authToken));
    const columnsData = await columnsRes.json();
    columnId = columnsData.columns[0].id;

    // Create a test card
    const cardRes = await app.fetch(authReq("POST", `/api/boards/${boardId}/cards`, authToken, {
      title: "Test Card",
      columnId,
    }));
    const cardData = await cardRes.json() as CardResponse;
    cardId = cardData.id;

    // Create test labels
    const label1Res = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
      name: "Bug",
      color: "#e74c3c",
    }));
    const label1Data = await label1Res.json() as LabelResponse;
    labelId = label1Data.id;

    const label2Res = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
      name: "Feature",
      color: "#3498db",
    }));
    const label2Data = await label2Res.json() as LabelResponse;
    label2Id = label2Data.id;
  });

  describe("POST /api/boards/:boardId/cards/:cardId/labels", () => {
    it("should assign label to card", async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
        labelId,
      }));

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);

      // Verify label was assigned
      const labels = getCardLabels(db, cardId);
      expect(labels).toHaveLength(1);
      expect(labels[0]!.id).toBe(labelId);
    });

    it("should return 404 for non-existent board", async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/nonexistent/cards/${cardId}/labels`, authToken, {
        labelId,
      }));

      expect(res.status).toBe(404);
    });

    it("should return 404 for non-existent card", async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/cards/nonexistent/labels`, authToken, {
        labelId,
      }));

      expect(res.status).toBe(404);
    });

    it("should return 400 without labelId", async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {}));

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("labelId is required");
    });

    it("should return 404 if label not on board", async () => {
      // Create another board with a label
      const board2Data = await createTestBoard(authToken, "Board 2");

      const otherLabelRes = await app.fetch(authReq("POST", `/api/boards/${board2Data.id}/labels`, authToken, {
        name: "Other",
        color: "#27ae60",
      }));
      const otherLabelData = await otherLabelRes.json() as LabelResponse;

      // Try to assign label from other board
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
        labelId: otherLabelData.id,
      }));

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("label not found on this board");
    });

    it("should return 409 if label already assigned", async () => {
      // Assign label first time
      await app.fetch(authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
        labelId,
      }));

      // Try to assign same label again
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
        labelId,
      }));

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("already assigned");
    });

    it("should allow multiple labels on same card", async () => {
      // Assign first label
      await app.fetch(authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
        labelId,
      }));

      // Assign second label
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
        labelId: label2Id,
      }));

      expect(res.status).toBe(201);

      // Verify both labels assigned
      const labels = getCardLabels(db, cardId);
      expect(labels).toHaveLength(2);
      expect(labels.find(l => l.id === labelId)).toBeTruthy();
      expect(labels.find(l => l.id === label2Id)).toBeTruthy();
    });

    it("should return 401 without auth", async () => {
      const res = await app.fetch(req("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, {
        labelId,
      }));

      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/boards/:boardId/cards/:cardId/labels/:labelId", () => {
    beforeEach(async () => {
      // Assign label to card
      await app.fetch(authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
        labelId,
      }));
    });

    it("should remove label from card", async () => {
      const res = await app.fetch(authReq("DELETE", `/api/boards/${boardId}/cards/${cardId}/labels/${labelId}`, authToken));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      // Verify label was removed
      const labels = getCardLabels(db, cardId);
      expect(labels).toHaveLength(0);
    });

    it("should return 404 if label not assigned", async () => {
      // Remove label first
      await app.fetch(authReq("DELETE", `/api/boards/${boardId}/cards/${cardId}/labels/${labelId}`, authToken));

      // Try to remove again
      const res = await app.fetch(authReq("DELETE", `/api/boards/${boardId}/cards/${cardId}/labels/${labelId}`, authToken));

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not assigned");
    });

    it("should return 404 for non-existent card", async () => {
      const res = await app.fetch(authReq("DELETE", `/api/boards/${boardId}/cards/nonexistent/labels/${labelId}`, authToken));

      expect(res.status).toBe(404);
    });

    it("should only remove specified label", async () => {
      // Assign second label
      await app.fetch(authReq("POST", `/api/boards/${boardId}/cards/${cardId}/labels`, authToken, {
        labelId: label2Id,
      }));

      // Remove first label
      await app.fetch(authReq("DELETE", `/api/boards/${boardId}/cards/${cardId}/labels/${labelId}`, authToken));

      // Verify only first label was removed
      const labels = getCardLabels(db, cardId);
      expect(labels).toHaveLength(1);
      expect(labels[0]!.id).toBe(label2Id);
    });

    it("should not affect label itself", async () => {
      // Remove label from card
      await app.fetch(authReq("DELETE", `/api/boards/${boardId}/cards/${cardId}/labels/${labelId}`, authToken));

      // Verify label still exists on board
      const labelsRes = await app.fetch(authReq("GET", `/api/boards/${boardId}/labels`, authToken));
      const labelsData = await labelsRes.json();
      expect(labelsData.labels.find((l: any) => l.id === labelId)).toBeTruthy();
    });

    it("should return 401 without auth", async () => {
      const res = await app.fetch(req("DELETE", `/api/boards/${boardId}/cards/${cardId}/labels/${labelId}`));

      expect(res.status).toBe(401);
    });
  });
});