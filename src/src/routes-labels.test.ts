import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createApp } from "./routes.ts";
import { createTestDb } from "./db.ts";
import { mkdirSync, rmSync } from "node:fs";
import { initializeActivitySubscriber } from "./activity-subscriber.ts";
import { eventBus } from "./event-bus.ts";

const TEST_DIR = "/tmp/brn-test-labels-" + Date.now();
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

describe("Label Routes", () => {
  let authToken: string;
  let boardId: string;

  beforeEach(async () => {
    // Register user and get token
    const authData = await registerUser();
    authToken = authData.token;

    // Create a test board
    const boardData = await createTestBoard(authToken);
    boardId = boardData.id;
  });

  describe("GET /api/boards/:boardId/labels", () => {
    it("should return empty array for new board", async () => {
      const res = await app.fetch(authReq("GET", `/api/boards/${boardId}/labels`, authToken));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.labels).toBeArray();
      expect(data.labels).toHaveLength(0);
    });

    it("should return 404 for non-existent board", async () => {
      const res = await app.fetch(authReq("GET", "/api/boards/nonexistent/labels", authToken));
      expect(res.status).toBe(404);
    });

    it("should return 401 without auth", async () => {
      const res = await app.fetch(req("GET", `/api/boards/${boardId}/labels`));
      expect(res.status).toBe(401);
    });

    it("should return labels ordered by position", async () => {
      // Create labels
      await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Label 2",
        color: "#e74c3c",
      }));
      await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Label 1",
        color: "#3498db",
      }));

      const res = await app.fetch(authReq("GET", `/api/boards/${boardId}/labels`, authToken));
      const data = await res.json();
      expect(data.labels).toHaveLength(2);
      expect(data.labels[0].position).toBe(0);
      expect(data.labels[1].position).toBe(1);
    });
  });

  describe("POST /api/boards/:boardId/labels", () => {
    it("should create a new label", async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Bug",
        color: "#e74c3c",
      }));

      expect(res.status).toBe(201);
      const label = await res.json() as LabelResponse;
      expect(label.id).toBeString();
      expect(label.board_id).toBe(boardId);
      expect(label.name).toBe("Bug");
      expect(label.color).toBe("#e74c3c");
      expect(label.position).toBe(0);
    });

    it("should trim name", async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "  Feature  ",
        color: "#3498db",
      }));

      const label = await res.json() as LabelResponse;
      expect(label.name).toBe("Feature");
    });

    it("should reject empty name", async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "   ",
        color: "#3498db",
      }));

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("name is required");
    });

    it("should reject name longer than 30 chars", async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "This is a very long label name that exceeds limit",
        color: "#3498db",
      }));

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("30 characters or less");
    });

    it("should reject invalid color format", async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Bug",
        color: "red",
      }));

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("valid hex color");
    });

    it("should reject duplicate name on same board", async () => {
      // Create first label
      await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Bug",
        color: "#e74c3c",
      }));

      // Try to create duplicate
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Bug",
        color: "#3498db",
      }));

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("already exists");
    });

    it("should auto-assign next position", async () => {
      const res1 = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Label 1",
        color: "#e74c3c",
      }));
      const label1 = await res1.json() as LabelResponse;

      const res2 = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Label 2",
        color: "#3498db",
      }));
      const label2 = await res2.json() as LabelResponse;

      expect(label1.position).toBe(0);
      expect(label2.position).toBe(1);
    });
  });

  describe("PATCH /api/boards/:boardId/labels/:labelId", () => {
    let labelId: string;

    beforeEach(async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Original",
        color: "#e74c3c",
      }));
      const label = await res.json() as LabelResponse;
      labelId = label.id;
    });

    it("should update label name", async () => {
      const res = await app.fetch(authReq("PATCH", `/api/boards/${boardId}/labels/${labelId}`, authToken, {
        name: "Updated",
      }));

      expect(res.status).toBe(200);
      const label = await res.json() as LabelResponse;
      expect(label.name).toBe("Updated");
      expect(label.color).toBe("#e74c3c"); // unchanged
    });

    it("should update label color", async () => {
      const res = await app.fetch(authReq("PATCH", `/api/boards/${boardId}/labels/${labelId}`, authToken, {
        color: "#3498db",
      }));

      const label = await res.json() as LabelResponse;
      expect(label.color).toBe("#3498db");
      expect(label.name).toBe("Original"); // unchanged
    });

    it("should update position and reorder", async () => {
      // Create more labels
      const res2 = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Label 2",
        color: "#3498db",
      }));
      const label2 = await res2.json() as LabelResponse;

      const res3 = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Label 3",
        color: "#27ae60",
      }));
      const label3 = await res3.json() as LabelResponse;

      // Move first label to position 2
      const res = await app.fetch(authReq("PATCH", `/api/boards/${boardId}/labels/${labelId}`, authToken, {
        position: 2,
      }));

      expect(res.status).toBe(200);

      // Check all labels
      const listRes = await app.fetch(authReq("GET", `/api/boards/${boardId}/labels`, authToken));
      const data = await listRes.json();
      
      expect(data.labels[0].name).toBe("Label 2");
      expect(data.labels[0].position).toBe(0);
      expect(data.labels[1].name).toBe("Label 3");
      expect(data.labels[1].position).toBe(1);
      expect(data.labels[2].name).toBe("Original");
      expect(data.labels[2].position).toBe(2);
    });

    it("should return 404 for non-existent label", async () => {
      const res = await app.fetch(authReq("PATCH", `/api/boards/${boardId}/labels/nonexistent`, authToken, {
        name: "Updated",
      }));

      expect(res.status).toBe(404);
    });

    it("should reject duplicate name", async () => {
      // Create another label
      await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Existing",
        color: "#3498db",
      }));

      // Try to update to duplicate name
      const res = await app.fetch(authReq("PATCH", `/api/boards/${boardId}/labels/${labelId}`, authToken, {
        name: "Existing",
      }));

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("already exists");
    });
  });

  describe("DELETE /api/boards/:boardId/labels/:labelId", () => {
    let labelId: string;

    beforeEach(async () => {
      const res = await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "ToDelete",
        color: "#e74c3c",
      }));
      const label = await res.json() as LabelResponse;
      labelId = label.id;
    });

    it("should delete label", async () => {
      const res = await app.fetch(authReq("DELETE", `/api/boards/${boardId}/labels/${labelId}`, authToken));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      // Verify it's gone
      const listRes = await app.fetch(authReq("GET", `/api/boards/${boardId}/labels`, authToken));
      const listData = await listRes.json();
      expect(listData.labels).toHaveLength(0);
    });

    it("should update positions after delete", async () => {
      // Create more labels
      await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Label 2",
        color: "#3498db",
      }));
      await app.fetch(authReq("POST", `/api/boards/${boardId}/labels`, authToken, {
        name: "Label 3",
        color: "#27ae60",
      }));

      // Delete first label
      await app.fetch(authReq("DELETE", `/api/boards/${boardId}/labels/${labelId}`, authToken));

      // Check remaining labels
      const listRes = await app.fetch(authReq("GET", `/api/boards/${boardId}/labels`, authToken));
      const data = await listRes.json();
      
      expect(data.labels).toHaveLength(2);
      expect(data.labels[0].position).toBe(0);
      expect(data.labels[1].position).toBe(1);
    });

    it("should return 404 for non-existent label", async () => {
      const res = await app.fetch(authReq("DELETE", `/api/boards/${boardId}/labels/nonexistent`, authToken));
      expect(res.status).toBe(404);
    });
  });
});