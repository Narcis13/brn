import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createApp } from "./routes.ts";
import { createTestDb } from "./db.ts";
import { mkdirSync, rmSync } from "node:fs";
import type { ColumnWithCards, ColumnRow, CardRow } from "./db.ts";

const TEST_DIR = "/tmp/brn-test-trello-" + Date.now();
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

// ============================================================
// Auth: Register
// ============================================================

describe("POST /api/auth/register", () => {
  it("registers a new user and returns JWT + user", async () => {
    const res = await app.fetch(
      req("POST", "/api/auth/register", { username: "alice", password: "secret123" })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as AuthResponse;
    expect(data.token).toBeDefined();
    expect(data.user.username).toBe("alice");
    expect(data.user.id).toBeDefined();
  });

  it("rejects short username", async () => {
    const res = await app.fetch(
      req("POST", "/api/auth/register", { username: "ab", password: "secret123" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid username characters", async () => {
    const res = await app.fetch(
      req("POST", "/api/auth/register", { username: "bad user!", password: "secret123" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects short password", async () => {
    const res = await app.fetch(
      req("POST", "/api/auth/register", { username: "alice", password: "12345" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects duplicate username with 409", async () => {
    await app.fetch(
      req("POST", "/api/auth/register", { username: "alice", password: "secret123" })
    );
    const res = await app.fetch(
      req("POST", "/api/auth/register", { username: "alice", password: "other456" })
    );
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("already taken");
  });
});

// ============================================================
// Auth: Login
// ============================================================

describe("POST /api/auth/login", () => {
  it("authenticates valid credentials and returns JWT", async () => {
    await registerUser("alice", "secret123");
    const res = await app.fetch(
      req("POST", "/api/auth/login", { username: "alice", password: "secret123" })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as AuthResponse;
    expect(data.token).toBeDefined();
    expect(data.user.username).toBe("alice");
  });

  it("rejects wrong password with 401", async () => {
    await registerUser("alice", "secret123");
    const res = await app.fetch(
      req("POST", "/api/auth/login", { username: "alice", password: "wrongpass" })
    );
    expect(res.status).toBe(401);
  });

  it("rejects non-existent user with 401", async () => {
    const res = await app.fetch(
      req("POST", "/api/auth/login", { username: "nobody", password: "secret123" })
    );
    expect(res.status).toBe(401);
  });
});

// ============================================================
// Auth: Me
// ============================================================

describe("GET /api/auth/me", () => {
  it("returns current user from valid JWT", async () => {
    const { token, user } = await registerUser("alice", "secret123");
    const res = await app.fetch(authReq("GET", "/api/auth/me", token));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; username: string };
    expect(data.username).toBe("alice");
    expect(data.id).toBe(user.id);
  });

  it("returns 401 without token", async () => {
    const res = await app.fetch(req("GET", "/api/auth/me"));
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.fetch(authReq("GET", "/api/auth/me", "garbage.token.here"));
    expect(res.status).toBe(401);
  });
});

// ============================================================
// Auth Middleware
// ============================================================

describe("auth middleware", () => {
  it("blocks protected routes without token", async () => {
    const res = await app.fetch(req("GET", "/api/boards"));
    expect(res.status).toBe(401);
  });

  it("allows public routes without token", async () => {
    const res = await app.fetch(
      req("POST", "/api/auth/register", { username: "alice", password: "secret123" })
    );
    expect(res.status).toBe(201);
  });
});

// ============================================================
// Boards: List
// ============================================================

describe("GET /api/boards", () => {
  it("returns empty boards array initially", async () => {
    const { token } = await registerUser();
    const res = await app.fetch(authReq("GET", "/api/boards", token));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { boards: BoardResponse[] };
    expect(data.boards).toEqual([]);
  });

  it("returns only the authenticated user's boards", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");

    await createTestBoard(alice.token, "Alice Board");
    await createTestBoard(bob.token, "Bob Board");

    const res = await app.fetch(authReq("GET", "/api/boards", alice.token));
    const data = (await res.json()) as { boards: BoardResponse[] };
    expect(data.boards).toHaveLength(1);
    expect(data.boards[0]!.title).toBe("Alice Board");
  });
});

// ============================================================
// Boards: Create
// ============================================================

describe("POST /api/boards", () => {
  it("creates a board and seeds 3 default columns", async () => {
    const { token } = await registerUser();
    const res = await app.fetch(authReq("POST", "/api/boards", token, { title: "My Board" }));
    expect(res.status).toBe(201);
    const board = (await res.json()) as BoardResponse;
    expect(board.title).toBe("My Board");
    expect(board.id).toBeDefined();

    // Verify 3 default columns were seeded
    const colRes = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/columns`, token)
    );
    const colData = (await colRes.json()) as { columns: ColumnWithCards[] };
    expect(colData.columns).toHaveLength(3);
    expect(colData.columns.map((c) => c.title)).toEqual(["To Do", "In Progress", "Done"]);
  });

  it("rejects empty title", async () => {
    const { token } = await registerUser();
    const res = await app.fetch(authReq("POST", "/api/boards", token, { title: "" }));
    expect(res.status).toBe(400);
  });
});

// ============================================================
// Boards: Delete
// ============================================================

describe("DELETE /api/boards/:id", () => {
  it("deletes board and cascades columns/cards", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token, "Doomed Board");

    // Add a card to one of the seeded columns
    const colRes = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/columns`, token)
    );
    const cols = ((await colRes.json()) as { columns: ColumnWithCards[] }).columns;
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards`, token, {
        title: "A Card",
        columnId: cols[0]!.id,
      })
    );

    // Delete the board
    const res = await app.fetch(authReq("DELETE", `/api/boards/${board.id}`, token));
    expect(res.status).toBe(200);

    // Verify board is gone
    const listRes = await app.fetch(authReq("GET", "/api/boards", token));
    const listData = (await listRes.json()) as { boards: BoardResponse[] };
    expect(listData.boards).toHaveLength(0);

    // Verify columns are gone (via direct DB query)
    const colCount = db.query("SELECT COUNT(*) as c FROM columns WHERE board_id = ?").get(
      board.id
    ) as { c: number };
    expect(colCount.c).toBe(0);
  });

  it("returns 404 for other user's board", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token, "Alice's Board");

    const res = await app.fetch(authReq("DELETE", `/api/boards/${board.id}`, bob.token));
    expect(res.status).toBe(404);
  });
});

// ============================================================
// Scoped Columns
// ============================================================

describe("GET /api/boards/:boardId/columns", () => {
  it("returns columns with nested cards", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);

    // Get seeded columns
    const res = await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { columns: ColumnWithCards[] };
    expect(data.columns).toHaveLength(3);
    expect(data.columns[0]!.cards).toEqual([]);
  });

  it("returns 404 for other user's board", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);

    const res = await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, bob.token));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/boards/:boardId/columns", () => {
  it("creates a column in the board", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/columns`, token, { title: "Custom" })
    );
    expect(res.status).toBe(201);
    const col = (await res.json()) as ColumnRow;
    expect(col.title).toBe("Custom");
    expect(col.position).toBe(3); // After the 3 seeded columns (0,1,2)
    expect(col.board_id).toBe(board.id);
  });
});

describe("PATCH /api/boards/:boardId/columns/:id", () => {
  it("renames a column", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/columns/${cols[0]!.id}`, token, {
        title: "Renamed",
      })
    );
    expect(res.status).toBe(200);
    const col = (await res.json()) as ColumnRow;
    expect(col.title).toBe("Renamed");
  });

  it("returns 404 for column not on this board", async () => {
    const { token } = await registerUser();
    const board1 = await createTestBoard(token, "Board 1");
    const board2 = await createTestBoard(token, "Board 2");
    const cols1 = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board1.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;

    // Try to update board1's column via board2's route
    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board2.id}/columns/${cols1[0]!.id}`, token, {
        title: "Hacked",
      })
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/boards/:boardId/columns/:id", () => {
  it("deletes a column and cascades cards", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;

    // Add a card first
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards`, token, {
        title: "Card",
        columnId: cols[0]!.id,
      })
    );

    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board.id}/columns/${cols[0]!.id}`, token)
    );
    expect(res.status).toBe(200);

    // Verify column and its cards are gone
    const afterCols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;
    expect(afterCols).toHaveLength(2);
  });
});

// ============================================================
// Scoped Cards
// ============================================================

describe("POST /api/boards/:boardId/cards", () => {
  it("creates a card in a board's column", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards`, token, {
        title: "Task 1",
        columnId: cols[0]!.id,
        description: "Do the thing",
      })
    );
    expect(res.status).toBe(201);
    const card = (await res.json()) as CardRow;
    expect(card.title).toBe("Task 1");
    expect(card.description).toBe("Do the thing");
    expect(card.column_id).toBe(cols[0]!.id);
  });

  it("rejects card for column on another board", async () => {
    const { token } = await registerUser();
    const board1 = await createTestBoard(token, "Board 1");
    const board2 = await createTestBoard(token, "Board 2");
    const cols1 = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board1.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;

    // Try to create card in board2 using board1's column
    const res = await app.fetch(
      authReq("POST", `/api/boards/${board2.id}/cards`, token, {
        title: "Sneaky",
        columnId: cols1[0]!.id,
      })
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/boards/:boardId/cards/:id", () => {
  it("updates card title and description", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;

    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards`, token, {
        title: "Old",
        columnId: cols[0]!.id,
      })
    );
    const created = (await createRes.json()) as CardRow;

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${created.id}`, token, {
        title: "New",
        description: "Updated",
      })
    );
    expect(res.status).toBe(200);
    const card = (await res.json()) as CardRow;
    expect(card.title).toBe("New");
    expect(card.description).toBe("Updated");
  });

  it("moves card between columns", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;

    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards`, token, {
        title: "Movable",
        columnId: cols[0]!.id,
      })
    );
    const created = (await createRes.json()) as CardRow;

    // Move to second column
    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${created.id}`, token, {
        columnId: cols[1]!.id,
        position: 0,
      })
    );
    expect(res.status).toBe(200);
    const card = (await res.json()) as CardRow;
    expect(card.column_id).toBe(cols[1]!.id);
    expect(card.position).toBe(0);
  });
});

describe("DELETE /api/boards/:boardId/cards/:id", () => {
  it("deletes a card and reorders remaining", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;

    const c1 = (
      await (
        await app.fetch(
          authReq("POST", `/api/boards/${board.id}/cards`, token, {
            title: "Card A",
            columnId: cols[0]!.id,
          })
        )
      ).json()
    ) as CardRow;
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards`, token, {
        title: "Card B",
        columnId: cols[0]!.id,
      })
    );

    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board.id}/cards/${c1.id}`, token)
    );
    expect(res.status).toBe(200);

    // Card B should now be at position 0
    const afterCols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;
    const todoCards = afterCols[0]!.cards;
    expect(todoCards).toHaveLength(1);
    expect(todoCards[0]!.title).toBe("Card B");
    expect(todoCards[0]!.position).toBe(0);
  });

  it("returns 404 for card on another board", async () => {
    const { token } = await registerUser();
    const board1 = await createTestBoard(token, "Board 1");
    const board2 = await createTestBoard(token, "Board 2");
    const cols1 = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board1.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;

    const card = (
      await (
        await app.fetch(
          authReq("POST", `/api/boards/${board1.id}/cards`, token, {
            title: "Card",
            columnId: cols1[0]!.id,
          })
        )
      ).json()
    ) as CardRow;

    // Try to delete via board2
    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board2.id}/cards/${card.id}`, token)
    );
    expect(res.status).toBe(404);
  });
});
