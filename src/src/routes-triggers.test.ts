import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createApp } from "./routes.ts";
import { createTestDb } from "./db.ts";
import { mkdirSync, rmSync } from "node:fs";
import { initializeActivitySubscriber } from "./activity-subscriber.ts";
import { eventBus } from "./event-bus.ts";
import type { TriggerRow, TriggerLogRow, NotificationRow } from "./db.ts";

const TEST_DIR = "/tmp/brn-test-triggers-routes-" + Date.now();
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
}

async function registerUser(username = "testuser", password = "password123"): Promise<AuthResponse> {
  const res = await app.fetch(req("POST", "/api/auth/register", { username, password }));
  return res.json() as Promise<AuthResponse>;
}

async function createTestBoard(token: string, title = "Test Board"): Promise<BoardResponse> {
  const res = await app.fetch(authReq("POST", "/api/boards", token, { title }));
  return res.json() as Promise<BoardResponse>;
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  db = createTestDb(`${TEST_DIR}/test-${Date.now()}.db`);
  eventBus.clear();
  initializeActivitySubscriber(db);
  app = createApp(db);
});

afterEach(() => {
  db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ============================================================
// Trigger API
// ============================================================

describe("POST /api/boards/:boardId/triggers", () => {
  it("creates a trigger", async () => {
    const auth = await registerUser();
    const board = await createTestBoard(auth.token);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers`, auth.token, {
        name: "Card move hook",
        event_types: ["card.moved"],
        action_type: "webhook",
        action_config: { url: "https://example.com/hook" },
      })
    );

    expect(res.status).toBe(201);
    const trigger = (await res.json()) as TriggerRow;
    expect(trigger.name).toBe("Card move hook");
    expect(trigger.action_type).toBe("webhook");
    expect(trigger.enabled).toBe(1);
  });

  it("validates required fields", async () => {
    const auth = await registerUser();
    const board = await createTestBoard(auth.token);

    // Missing name
    const res1 = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers`, auth.token, {
        event_types: ["card.moved"],
        action_type: "webhook",
        action_config: { url: "https://x.com" },
      })
    );
    expect(res1.status).toBe(400);

    // Missing event_types
    const res2 = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers`, auth.token, {
        name: "Test",
        action_type: "webhook",
        action_config: { url: "https://x.com" },
      })
    );
    expect(res2.status).toBe(400);

    // Invalid action_type
    const res3 = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers`, auth.token, {
        name: "Test",
        event_types: ["card.moved"],
        action_type: "invalid",
        action_config: {},
      })
    );
    expect(res3.status).toBe(400);
  });

  it("rejects non-member", async () => {
    const auth1 = await registerUser("user1");
    const auth2 = await registerUser("user2");
    const board = await createTestBoard(auth1.token);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers`, auth2.token, {
        name: "Test",
        event_types: ["card.moved"],
        action_type: "notify",
        action_config: { target: "watchers" },
      })
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/boards/:boardId/triggers", () => {
  it("lists triggers for a board", async () => {
    const auth = await registerUser();
    const board = await createTestBoard(auth.token);

    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers`, auth.token, {
        name: "T1",
        event_types: ["card.moved"],
        action_type: "notify",
        action_config: { target: "watchers" },
      })
    );

    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers`, auth.token, {
        name: "T2",
        event_types: ["card.created"],
        action_type: "webhook",
        action_config: { url: "https://x.com" },
      })
    );

    const res = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/triggers`, auth.token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { triggers: TriggerRow[] };
    expect(data.triggers).toHaveLength(2);
  });
});

describe("PATCH /api/boards/:boardId/triggers/:id", () => {
  it("updates trigger fields", async () => {
    const auth = await registerUser();
    const board = await createTestBoard(auth.token);

    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers`, auth.token, {
        name: "Original",
        event_types: ["card.moved"],
        action_type: "notify",
        action_config: { target: "watchers" },
      })
    );
    const trigger = (await createRes.json()) as TriggerRow;

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/triggers/${trigger.id}`, auth.token, {
        name: "Updated",
        enabled: false,
      })
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as TriggerRow;
    expect(updated.name).toBe("Updated");
    expect(updated.enabled).toBe(0);
  });
});

describe("DELETE /api/boards/:boardId/triggers/:id", () => {
  it("deletes a trigger", async () => {
    const auth = await registerUser();
    const board = await createTestBoard(auth.token);

    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers`, auth.token, {
        name: "ToDelete",
        event_types: ["card.moved"],
        action_type: "notify",
        action_config: { target: "watchers" },
      })
    );
    const trigger = (await createRes.json()) as TriggerRow;

    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board.id}/triggers/${trigger.id}`, auth.token)
    );
    expect(res.status).toBe(200);

    // Verify deleted
    const listRes = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/triggers`, auth.token)
    );
    const data = (await listRes.json()) as { triggers: TriggerRow[] };
    expect(data.triggers).toHaveLength(0);
  });
});

// ============================================================
// Notification API
// ============================================================

describe("GET /api/notifications", () => {
  it("returns empty list when no notifications", async () => {
    const auth = await registerUser();
    const res = await app.fetch(
      authReq("GET", "/api/notifications", auth.token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { notifications: NotificationRow[] };
    expect(data.notifications).toHaveLength(0);
  });
});

describe("GET /api/notifications/count", () => {
  it("returns unread count", async () => {
    const auth = await registerUser();
    const res = await app.fetch(
      authReq("GET", "/api/notifications/count", auth.token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { unread: number };
    expect(data.unread).toBe(0);
  });
});

describe("POST /api/notifications/read-all", () => {
  it("marks all as read", async () => {
    const auth = await registerUser();
    const res = await app.fetch(
      authReq("POST", "/api/notifications/read-all", auth.token, {})
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });
});

describe("DELETE /api/notifications", () => {
  it("cleans up old read notifications", async () => {
    const auth = await registerUser();
    const res = await app.fetch(
      authReq("DELETE", "/api/notifications", auth.token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { deleted: number };
    expect(data.deleted).toBe(0);
  });
});

// ============================================================
// Trigger Log API
// ============================================================

describe("GET /api/boards/:boardId/triggers/log", () => {
  it("returns empty list when no logs", async () => {
    const auth = await registerUser();
    const board = await createTestBoard(auth.token);

    const res = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/triggers/log`, auth.token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { logs: TriggerLogRow[] };
    expect(data.logs).toHaveLength(0);
  });
});

describe("POST /api/boards/:boardId/triggers/:id/test", () => {
  it("fires a test event", async () => {
    const auth = await registerUser();
    const board = await createTestBoard(auth.token);

    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers`, auth.token, {
        name: "Test Trigger",
        event_types: ["card.moved"],
        action_type: "notify",
        action_config: { target: "watchers" },
      })
    );
    const trigger = (await createRes.json()) as TriggerRow;

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/triggers/${trigger.id}/test`, auth.token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; event: { eventType: string } };
    expect(data.ok).toBe(true);
    expect(data.event.eventType).toBe("card.moved");
  });
});
