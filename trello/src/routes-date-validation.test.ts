import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createApp } from "./routes.ts";
import { createTestDb } from "./db.ts";
import { mkdirSync, rmSync } from "node:fs";

const TEST_DIR = "/tmp/brn-test-date-validation-" + Date.now();
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
  description?: string;
  column_id: string;
  position: number;
  due_date?: string | null;
  start_date?: string | null;
  checklist?: string;
  created_at: string;
  updated_at: string;
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  db = createTestDb(`${TEST_DIR}/test.db`);
  app = createApp(db);
});

afterEach(() => {
  db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

async function registerUser(): Promise<{ token: string; userId: string }> {
  const res = await app.fetch(
    req("POST", "/api/auth/register", {
      username: "testuser",
      password: "password123",
    })
  );
  const data = (await res.json()) as AuthResponse;
  return { token: data.token, userId: data.user.id };
}

async function createTestBoard(token: string): Promise<BoardResponse> {
  const res = await app.fetch(
    authReq("POST", "/api/boards", token, { title: "Test Board" })
  );
  return (await res.json()) as BoardResponse;
}

async function getColumns(token: string, boardId: string): Promise<ColumnResponse[]> {
  const res = await app.fetch(authReq("GET", `/api/boards/${boardId}/columns`, token));
  const data = (await res.json()) as { columns: ColumnResponse[] };
  return data.columns;
}

async function createCard(
  token: string,
  boardId: string,
  columnId: string,
  title: string
): Promise<CardResponse> {
  const res = await app.fetch(
    authReq("POST", `/api/boards/${boardId}/cards`, token, {
      title,
      columnId,
      description: "Test card",
    })
  );
  return (await res.json()) as CardResponse;
}

describe("PATCH /api/boards/:boardId/cards/:id - Date Validation", () => {
  it("accepts valid date-only format (YYYY-MM-DD)", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const columns = await getColumns(token, board.id);
    const card = await createCard(token, board.id, columns[0]!.id, "Test Card");

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        due_date: "2026-12-25",
        start_date: "2026-12-20",
      })
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as CardResponse;
    expect(updated.due_date).toBe("2026-12-25");
    expect(updated.start_date).toBe("2026-12-20");
  });

  it("accepts valid datetime format (YYYY-MM-DDTHH:MM)", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const columns = await getColumns(token, board.id);
    const card = await createCard(token, board.id, columns[0]!.id, "Test Card");

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        due_date: "2026-12-25T14:30",
        start_date: "2026-12-20T09:00",
      })
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as CardResponse;
    expect(updated.due_date).toBe("2026-12-25T14:30");
    expect(updated.start_date).toBe("2026-12-20T09:00");
  });

  it("accepts mixed date formats", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const columns = await getColumns(token, board.id);
    const card = await createCard(token, board.id, columns[0]!.id, "Test Card");

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        due_date: "2026-12-25T14:30",
        start_date: "2026-12-20", // date-only
      })
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as CardResponse;
    expect(updated.due_date).toBe("2026-12-25T14:30");
    expect(updated.start_date).toBe("2026-12-20");
  });

  it("allows clearing dates by setting to null", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const columns = await getColumns(token, board.id);
    const card = await createCard(token, board.id, columns[0]!.id, "Test Card");

    // First set dates
    await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        due_date: "2026-12-25",
        start_date: "2026-12-20",
      })
    );

    // Then clear them
    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        due_date: null,
        start_date: null,
      })
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as CardResponse;
    expect(updated.due_date).toBeNull();
    expect(updated.start_date).toBeNull();
  });

  it("rejects invalid date-only format", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const columns = await getColumns(token, board.id);
    const card = await createCard(token, board.id, columns[0]!.id, "Test Card");

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        due_date: "2026-13-01", // Invalid month
      })
    );

    expect(res.status).toBe(400);
    const error = (await res.json()) as { error: string };
    expect(error.error).toBe("due_date must be in format YYYY-MM-DD or YYYY-MM-DDTHH:MM");
  });

  it("rejects malformed time values", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const columns = await getColumns(token, board.id);
    const card = await createCard(token, board.id, columns[0]!.id, "Test Card");

    const testCases = [
      { due_date: "2026-03-24T25:00" }, // Invalid hour
      { due_date: "2026-03-24T14:60" }, // Invalid minute
      { due_date: "2026-03-24T24:00" }, // 24:00 rejected
      { due_date: "2026-03-24T1:5" }, // Missing padding
      { start_date: "2026-03-24T14" }, // Missing minutes
      { start_date: "2026-03-24T" }, // Missing time
    ];

    for (const testCase of testCases) {
      const res = await app.fetch(
        authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, testCase)
      );
      expect(res.status).toBe(400);
      const error = (await res.json()) as { error: string };
      expect(error.error).toContain("must be in format YYYY-MM-DD or YYYY-MM-DDTHH:MM");
    }
  });

  it("validates start_date <= due_date constraint", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const columns = await getColumns(token, board.id);
    const card = await createCard(token, board.id, columns[0]!.id, "Test Card");

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        start_date: "2026-12-25T14:30",
        due_date: "2026-12-20T09:00", // Earlier than start
      })
    );

    expect(res.status).toBe(400);
    const error = (await res.json()) as { error: string };
    expect(error.error).toBe("start_date must be before or equal to due_date");
  });

  it("allows start_date equal to due_date", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const columns = await getColumns(token, board.id);
    const card = await createCard(token, board.id, columns[0]!.id, "Test Card");

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        start_date: "2026-12-25T14:30",
        due_date: "2026-12-25T14:30",
      })
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as CardResponse;
    expect(updated.start_date).toBe("2026-12-25T14:30");
    expect(updated.due_date).toBe("2026-12-25T14:30");
  });

  it("accepts valid edge case times", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const columns = await getColumns(token, board.id);
    const card = await createCard(token, board.id, columns[0]!.id, "Test Card");

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        start_date: "2026-01-01T00:00", // Midnight
        due_date: "2026-01-01T23:59", // Last minute of day
      })
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as CardResponse;
    expect(updated.start_date).toBe("2026-01-01T00:00");
    expect(updated.due_date).toBe("2026-01-01T23:59");
  });
});