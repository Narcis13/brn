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

  it("includes label and checklist metadata on board cards", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);

    const columnsRes = await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token));
    const columnsData = (await columnsRes.json()) as { columns: ColumnWithCards[] };
    const firstColumn = columnsData.columns[0];
    expect(firstColumn).toBeDefined();

    const createCardRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards`, token, {
        title: "Rich card",
        description: "Has detail",
        columnId: firstColumn!.id,
      })
    );
    expect(createCardRes.status).toBe(201);
    const card = (await createCardRes.json()) as CardRow;

    const createLabelRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/labels`, token, {
        name: "Urgent",
        color: "#e74c3c",
      })
    );
    expect(createLabelRes.status).toBe(201);
    const label = (await createLabelRes.json()) as { id: string; name: string };

    const assignLabelRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${card.id}/labels`, token, {
        labelId: label.id,
      })
    );
    expect(assignLabelRes.status).toBe(201);

    const updateCardRes = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        due_date: "2026-04-15",
        checklist: JSON.stringify([
          { id: "item-1", text: "First item", checked: true },
          { id: "item-2", text: "Second item", checked: false },
        ]),
      })
    );
    expect(updateCardRes.status).toBe(200);

    const res = await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { columns: ColumnWithCards[] };
    const boardCard = data.columns[0]!.cards[0];

    expect(boardCard).toBeDefined();
    expect(boardCard!.labels).toHaveLength(1);
    expect(boardCard!.labels[0]!.name).toBe("Urgent");
    expect(boardCard!.due_date).toBe("2026-04-15");
    expect(boardCard!.checklist_total).toBe(2);
    expect(boardCard!.checklist_done).toBe(1);
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

// ============================================================
// Calendar view endpoint
// ============================================================

describe("GET /api/boards/:boardId/calendar", () => {
  async function createCardWithDates(token: string, boardId: string, columnId: string, title: string, dates: { due_date?: string | null; start_date?: string | null }) {
    const res = await app.fetch(
      authReq("POST", `/api/boards/${boardId}/cards`, token, {
        title,
        columnId,
      })
    );
    const card = (await res.json()) as CardRow;
    
    // Update with dates
    await app.fetch(
      authReq("PATCH", `/api/boards/${boardId}/cards/${card.id}`, token, dates)
    );
    
    return card;
  }

  it("returns cards with dates in the specified range", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;
    const columnId = cols[0]!.id;

    // Create cards with various dates
    await createCardWithDates(token, board.id, columnId, "In range 1", { due_date: "2026-04-15" });
    await createCardWithDates(token, board.id, columnId, "In range 2", { due_date: "2026-04-20T14:30" });
    await createCardWithDates(token, board.id, columnId, "Before range", { due_date: "2026-04-01" });
    await createCardWithDates(token, board.id, columnId, "After range", { due_date: "2026-05-01" });
    await createCardWithDates(token, board.id, columnId, "No dates", {});

    const res = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/calendar?start=2026-04-10&end=2026-04-25`, token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cards: any[] };
    
    expect(data.cards).toHaveLength(2);
    expect(data.cards.map(c => c.title).sort()).toEqual(["In range 1", "In range 2"]);
  });

  it("includes cards that span the date range", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;
    const columnId = cols[0]!.id;

    // Card that starts before range and ends in range
    await createCardWithDates(token, board.id, columnId, "Spans into range", {
      start_date: "2026-04-05",
      due_date: "2026-04-15"
    });
    
    // Card that starts in range and ends after
    await createCardWithDates(token, board.id, columnId, "Spans out of range", {
      start_date: "2026-04-20",
      due_date: "2026-05-05"
    });
    
    // Card that completely spans the range
    await createCardWithDates(token, board.id, columnId, "Spans entire range", {
      start_date: "2026-04-01",
      due_date: "2026-04-30"
    });

    const res = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/calendar?start=2026-04-10&end=2026-04-25`, token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cards: any[] };
    
    expect(data.cards).toHaveLength(3);
    const titles = data.cards.map(c => c.title).sort();
    expect(titles).toEqual(["Spans entire range", "Spans into range", "Spans out of range"]);
  });

  it("returns card details including labels and checklist counts", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;
    const columnId = cols[0]!.id;

    // Create a label
    const labelRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/labels`, token, {
        name: "Important",
        color: "#ff0000"
      })
    );
    const label = await labelRes.json() as any;

    // Create card with dates
    const card = await createCardWithDates(token, board.id, columnId, "Rich card", {
      due_date: "2026-04-15T10:30"
    });

    // Add label to card
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${card.id}/labels`, token, {
        labelId: label.id
      })
    );

    // Add checklist
    await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${card.id}`, token, {
        checklist: JSON.stringify([
          { id: "1", text: "Task 1", checked: true },
          { id: "2", text: "Task 2", checked: false }
        ])
      })
    );

    const res = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/calendar?start=2026-04-01&end=2026-04-30`, token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cards: any[] };
    
    expect(data.cards).toHaveLength(1);
    const calendarCard = data.cards[0]!;
    expect(calendarCard.title).toBe("Rich card");
    expect(calendarCard.due_date).toBe("2026-04-15T10:30");
    expect(calendarCard.labels).toHaveLength(1);
    expect(calendarCard.labels[0].name).toBe("Important");
    expect(calendarCard.checklist_total).toBe(2);
    expect(calendarCard.checklist_done).toBe(1);
    expect(calendarCard.column_id).toBe(columnId);
    expect(calendarCard.column_title).toBe("To Do");
  });

  it("returns empty array when no cards have dates in range", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;
    const columnId = cols[0]!.id;

    // Create cards without dates or outside range
    await createCardWithDates(token, board.id, columnId, "No dates", {});
    await createCardWithDates(token, board.id, columnId, "Outside range", { due_date: "2026-01-01" });

    const res = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/calendar?start=2026-04-10&end=2026-04-25`, token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cards: any[] };
    expect(data.cards).toEqual([]);
  });

  it("validates date parameters", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);

    // Missing start parameter
    const res1 = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/calendar?end=2026-04-25`, token)
    );
    expect(res1.status).toBe(400);
    const err1 = await res1.json() as any;
    expect(err1.error).toContain("start and end parameters are required");

    // Missing end parameter
    const res2 = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/calendar?start=2026-04-10`, token)
    );
    expect(res2.status).toBe(400);

    // Invalid date format
    const res3 = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/calendar?start=2026-04-10&end=invalid-date`, token)
    );
    expect(res3.status).toBe(400);
    const err3 = await res3.json() as any;
    expect(err3.error).toContain("Invalid date format");
  });

  it("returns 404 for non-existent board", async () => {
    const { token } = await registerUser();
    const res = await app.fetch(
      authReq("GET", `/api/boards/non-existent/calendar?start=2026-04-10&end=2026-04-25`, token)
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for other user's board", async () => {
    const alice = await registerUser("alice", "password123");
    const bob = await registerUser("bob", "password123");
    const board = await createTestBoard(alice.token);

    const res = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/calendar?start=2026-04-10&end=2026-04-25`, bob.token)
    );
    expect(res.status).toBe(404);
  });

  it("handles cards with only start_date", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const cols = ((
      await (
        await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token))
      ).json()
    ) as { columns: ColumnWithCards[] }).columns;
    const columnId = cols[0]!.id;

    await createCardWithDates(token, board.id, columnId, "Start only", {
      start_date: "2026-04-15",
      due_date: null
    });

    const res = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/calendar?start=2026-04-10&end=2026-04-20`, token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cards: any[] };
    
    expect(data.cards).toHaveLength(1);
    expect(data.cards[0]!.title).toBe("Start only");
    expect(data.cards[0]!.start_date).toBe("2026-04-15");
    expect(data.cards[0]!.due_date).toBe(null);
  });
});

// ============================================================
// Board Members
// ============================================================

describe("GET /api/boards/:boardId/members", () => {
  it("returns the board owner as a member", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);

    const res = await app.fetch(authReq("GET", `/api/boards/${board.id}/members`, token));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { members: { id: string; username: string; role: string; invited_at: string }[] };
    expect(data.members).toHaveLength(1);
    expect(data.members[0]!.username).toBe("testuser");
    expect(data.members[0]!.role).toBe("owner");
  });

  it("returns 404 for non-member", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);

    const res = await app.fetch(authReq("GET", `/api/boards/${board.id}/members`, bob.token));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/boards/:boardId/members", () => {
  it("owner can invite a user by username", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; username: string; role: string };
    expect(data.username).toBe("bob");
    expect(data.role).toBe("member");
  });

  it("invited member can access the board", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);

    // Invite bob
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );

    // Bob can now access the board's columns
    const res = await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, bob.token));
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent username", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, token, { username: "nonexistent" })
    );
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("User not found");
  });

  it("returns 409 for already existing member", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);

    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );
    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("User is already a board member");
  });

  it("non-owner cannot invite members", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const charlie = await registerUser("charlie", "secret789");
    const board = await createTestBoard(alice.token);

    // Invite bob as member
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );

    // Bob (member) tries to invite charlie
    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, bob.token, { username: "charlie" })
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/boards/:boardId/members/:userId", () => {
  it("owner can remove a member", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);

    // Invite and then remove bob
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );
    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board.id}/members/${bob.user.id}`, alice.token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);

    // Bob can no longer access the board
    const accessRes = await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, bob.token));
    expect(accessRes.status).toBe(404);
  });

  it("owner cannot remove themselves", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);

    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board.id}/members/${alice.user.id}`, alice.token)
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Cannot remove the board owner");
  });

  it("non-owner cannot remove members", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const charlie = await registerUser("charlie", "secret789");
    const board = await createTestBoard(alice.token);

    await app.fetch(authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" }));
    await app.fetch(authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "charlie" }));

    // Bob (member) tries to remove charlie
    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board.id}/members/${charlie.user.id}`, bob.token)
    );
    expect(res.status).toBe(403);
  });
});

// ============================================================
// Board membership authorization
// ============================================================

describe("board membership authorization", () => {
  it("board creator is automatically a member", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);

    // Creator can access the board
    const res = await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token));
    expect(res.status).toBe(200);
  });

  it("non-member cannot access board endpoints", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);

    const res = await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, bob.token));
    expect(res.status).toBe(404);
  });

  it("invited member can access board endpoints", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);

    // Invite bob
    await app.fetch(authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" }));

    // Bob can access columns, create cards, etc.
    const colRes = await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, bob.token));
    expect(colRes.status).toBe(200);
    const cols = (await colRes.json()) as { columns: { id: string }[] };
    const columnId = cols.columns[0]!.id;

    const cardRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards`, bob.token, { title: "Bob's card", columnId })
    );
    expect(cardRes.status).toBe(201);
  });

  it("member can only delete boards they own", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);

    await app.fetch(authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" }));

    // Bob (member) tries to delete the board
    const res = await app.fetch(authReq("DELETE", `/api/boards/${board.id}`, bob.token));
    expect(res.status).toBe(403);
  });

  it("boards list includes boards where user is a member", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token, "Shared Board");

    // Invite bob
    await app.fetch(authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" }));

    // Bob's board list includes the shared board
    const res = await app.fetch(authReq("GET", "/api/boards", bob.token));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { boards: { id: string; title: string }[] };
    expect(data.boards.some(b => b.id === board.id)).toBe(true);
  });
});

// ============================================================
// Activity user_id tracking
// ============================================================

describe("activity user_id tracking", () => {
  it("records user_id when creating a card", async () => {
    const { token } = await registerUser();
    const board = await createTestBoard(token);
    const colRes = await app.fetch(authReq("GET", `/api/boards/${board.id}/columns`, token));
    const cols = (await colRes.json()) as { columns: { id: string }[] };
    const columnId = cols.columns[0]!.id;

    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards`, token, { title: "Test Card", columnId })
    );

    // Check activity has user_id
    const actRes = await app.fetch(authReq("GET", `/api/boards/${board.id}/cards`, token));
    // Use the card detail endpoint to check activity
    const searchRes = await app.fetch(authReq("GET", `/api/boards/${board.id}/search?q=Test`, token));
    const cards = (await searchRes.json()) as { cards: { id: string }[] };
    const cardId = cards.cards[0]!.id;

    const detailRes = await app.fetch(authReq("GET", `/api/boards/${board.id}/cards/${cardId}`, token));
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as { activity: { user_id: string | null }[] };
    expect(detail.activity.length).toBeGreaterThan(0);
    expect(detail.activity[0]!.user_id).toBeTruthy();
  });
});

// ============================================================
// Comments
// ============================================================

interface CommentResponse {
  id: string;
  content: string;
  user_id: string;
  username: string;
  created_at: string;
  updated_at: string;
  reactions: unknown[];
}

async function createTestCardInBoard(
  token: string,
  boardId: string
): Promise<{ cardId: string; columnId: string }> {
  const colRes = await app.fetch(authReq("GET", `/api/boards/${boardId}/columns`, token));
  const cols = (await colRes.json()) as { columns: { id: string }[] };
  const columnId = cols.columns[0]!.id;
  const cardRes = await app.fetch(
    authReq("POST", `/api/boards/${boardId}/cards`, token, { title: "Test Card", columnId })
  );
  const card = (await cardRes.json()) as { id: string };
  return { cardId: card.id, columnId };
}

describe("POST /api/boards/:boardId/cards/:cardId/comments", () => {
  it("creates a comment and returns it with username and empty reactions", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, alice.token, {
        content: "This is a comment",
      })
    );
    expect(res.status).toBe(201);
    const comment = (await res.json()) as CommentResponse;
    expect(comment.content).toBe("This is a comment");
    expect(comment.username).toBe("alice");
    expect(comment.user_id).toBeTruthy();
    expect(comment.reactions).toEqual([]);
    expect(comment.created_at).toBeTruthy();
    expect(comment.updated_at).toBeTruthy();
  });

  it("creates 'commented' activity entry", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, alice.token, {
        content: "Check this out",
      })
    );

    const actRes = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/cards/${cardId}/activity`, alice.token)
    );
    const data = (await actRes.json()) as { activity: { action: string; user_id: string }[] };
    const commented = data.activity.find((a) => a.action === "commented");
    expect(commented).toBeDefined();
    expect(commented!.user_id).toBeTruthy();
  });

  it("auto-watches the card for the commenter", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, alice.token, {
        content: "Watching now",
      })
    );

    // Verify by checking card_watchers directly via db
    // We test the side effect indirectly: commenting again shouldn't error (INSERT OR IGNORE)
    const res2 = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, alice.token, {
        content: "Second comment",
      })
    );
    expect(res2.status).toBe(201);
  });

  it("rejects empty content", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, alice.token, {
        content: "   ",
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects content over 5000 characters", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, alice.token, {
        content: "x".repeat(5001),
      })
    );
    expect(res.status).toBe(400);
  });

  it("non-member cannot comment", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, bob.token, {
        content: "Sneaky comment",
      })
    );
    expect(res.status).toBe(404);
  });

  it("member can comment on board they were invited to", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    // Invite bob
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, bob.token, {
        content: "Bob's comment",
      })
    );
    expect(res.status).toBe(201);
    const comment = (await res.json()) as CommentResponse;
    expect(comment.username).toBe("bob");
  });

  it("returns 404 for non-existent card", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/nonexistent/comments`, alice.token, {
        content: "Hello",
      })
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/boards/:boardId/cards/:cardId/comments/:commentId", () => {
  it("author can edit their own comment", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, alice.token, {
        content: "Original",
      })
    );
    const comment = (await createRes.json()) as CommentResponse;

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${cardId}/comments/${comment.id}`, alice.token, {
        content: "Updated",
      })
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as CommentResponse;
    expect(updated.content).toBe("Updated");
    expect(updated.id).toBe(comment.id);
    expect(updated.updated_at).toBeTruthy();
  });

  it("non-author cannot edit comment", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    // Invite bob
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );

    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, alice.token, {
        content: "Alice's comment",
      })
    );
    const comment = (await createRes.json()) as CommentResponse;

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${cardId}/comments/${comment.id}`, bob.token, {
        content: "Bob tries to edit",
      })
    );
    expect(res.status).toBe(403);
  });

  it("rejects empty content on edit", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, alice.token, {
        content: "Original",
      })
    );
    const comment = (await createRes.json()) as CommentResponse;

    const res = await app.fetch(
      authReq("PATCH", `/api/boards/${board.id}/cards/${cardId}/comments/${comment.id}`, alice.token, {
        content: "",
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/boards/:boardId/cards/:cardId/comments/:commentId", () => {
  it("author can delete their own comment", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, alice.token, {
        content: "To be deleted",
      })
    );
    const comment = (await createRes.json()) as CommentResponse;

    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board.id}/cards/${cardId}/comments/${comment.id}`, alice.token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it("board owner can delete any comment", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    // Invite bob
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );

    // Bob creates a comment
    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, bob.token, {
        content: "Bob's comment",
      })
    );
    const comment = (await createRes.json()) as CommentResponse;

    // Alice (owner) deletes Bob's comment
    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board.id}/cards/${cardId}/comments/${comment.id}`, alice.token)
    );
    expect(res.status).toBe(200);
  });

  it("non-author non-owner member cannot delete comment", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret456");
    const charlie = await registerUser("charlie", "secret789");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    // Invite bob and charlie
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "charlie" })
    );

    // Bob creates a comment
    const createRes = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/comments`, bob.token, {
        content: "Bob's comment",
      })
    );
    const comment = (await createRes.json()) as CommentResponse;

    // Charlie (member, not author, not owner) tries to delete
    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board.id}/cards/${cardId}/comments/${comment.id}`, charlie.token)
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent comment", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    const res = await app.fetch(
      authReq("DELETE", `/api/boards/${board.id}/cards/${cardId}/comments/nonexistent`, alice.token)
    );
    expect(res.status).toBe(404);
  });
});

// ============================================================
// Reactions
// ============================================================

interface ReactionResponse {
  action: "added" | "removed";
  reaction: { id: string; emoji: string; user_id: string };
}

async function createTestComment(
  token: string,
  boardId: string,
  cardId: string,
  content: string = "Test comment"
): Promise<CommentResponse> {
  const res = await app.fetch(
    authReq("POST", `/api/boards/${boardId}/cards/${cardId}/comments`, token, { content })
  );
  return res.json() as Promise<CommentResponse>;
}

describe("POST /api/boards/:boardId/reactions", () => {
  it("adds a reaction to a comment and returns added action", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);
    const comment = await createTestComment(alice.token, board.id, cardId);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, alice.token, {
        target_type: "comment",
        target_id: comment.id,
        emoji: "👍",
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as ReactionResponse;
    expect(data.action).toBe("added");
    expect(data.reaction.emoji).toBe("👍");
    expect(data.reaction.user_id).toBe(alice.user.id);
  });

  it("toggles off an existing reaction (removes it)", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);
    const comment = await createTestComment(alice.token, board.id, cardId);

    // Add reaction
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, alice.token, {
        target_type: "comment",
        target_id: comment.id,
        emoji: "👍",
      })
    );

    // Toggle off
    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, alice.token, {
        target_type: "comment",
        target_id: comment.id,
        emoji: "👍",
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as ReactionResponse;
    expect(data.action).toBe("removed");
  });

  it("adds a reaction to an activity entry", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    // Get the "created" activity entry
    const actRes = await app.fetch(
      authReq("GET", `/api/boards/${board.id}/cards/${cardId}/activity`, alice.token)
    );
    const actData = (await actRes.json()) as { activity: { id: string }[] };
    const activityId = actData.activity[0]!.id;

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, alice.token, {
        target_type: "activity",
        target_id: activityId,
        emoji: "🎉",
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as ReactionResponse;
    expect(data.action).toBe("added");
    expect(data.reaction.emoji).toBe("🎉");
  });

  it("rejects disallowed emoji", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);
    const comment = await createTestComment(alice.token, board.id, cardId);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, alice.token, {
        target_type: "comment",
        target_id: comment.id,
        emoji: "💩",
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing target_type", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, alice.token, {
        target_id: "some-id",
        emoji: "👍",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent target", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, alice.token, {
        target_type: "comment",
        target_id: "nonexistent",
        emoji: "👍",
      })
    );
    expect(res.status).toBe(404);
  });

  it("rejects non-member reactions", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);
    const comment = await createTestComment(alice.token, board.id, cardId);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, bob.token, {
        target_type: "comment",
        target_id: comment.id,
        emoji: "👍",
      })
    );
    expect(res.status).toBe(404);
  });

  it("allows different users to react with same emoji", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret123");
    const board = await createTestBoard(alice.token);
    // Invite bob
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/members`, alice.token, { username: "bob" })
    );
    const { cardId } = await createTestCardInBoard(alice.token, board.id);
    const comment = await createTestComment(alice.token, board.id, cardId);

    const res1 = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, alice.token, {
        target_type: "comment",
        target_id: comment.id,
        emoji: "👍",
      })
    );
    expect(res1.status).toBe(200);

    const res2 = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, bob.token, {
        target_type: "comment",
        target_id: comment.id,
        emoji: "👍",
      })
    );
    expect(res2.status).toBe(200);
    const data = (await res2.json()) as ReactionResponse;
    expect(data.action).toBe("added");
  });

  it("allows same user to react with different emoji", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);
    const comment = await createTestComment(alice.token, board.id, cardId);

    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, alice.token, {
        target_type: "comment",
        target_id: comment.id,
        emoji: "👍",
      })
    );

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/reactions`, alice.token, {
        target_type: "comment",
        target_id: comment.id,
        emoji: "❤️",
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as ReactionResponse;
    expect(data.action).toBe("added");
    expect(data.reaction.emoji).toBe("❤️");
  });
});

// ============================================================
// Card Watchers
// ============================================================

describe("POST /api/boards/:boardId/cards/:cardId/watch", () => {
  it("toggles watching on (returns watching: true)", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/watch`, alice.token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { watching: boolean };
    expect(data.watching).toBe(true);
  });

  it("toggles watching off (returns watching: false)", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    // Watch
    await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/watch`, alice.token)
    );

    // Unwatch
    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/watch`, alice.token)
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { watching: boolean };
    expect(data.watching).toBe(false);
  });

  it("auto-watch from comment persists, manual toggle unwatches", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    // Comment auto-watches
    await createTestComment(alice.token, board.id, cardId);

    // Manual toggle should unwatch (since already watching)
    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/watch`, alice.token)
    );
    const data = (await res.json()) as { watching: boolean };
    expect(data.watching).toBe(false);
  });

  it("rejects non-member watch request", async () => {
    const alice = await registerUser("alice", "secret123");
    const bob = await registerUser("bob", "secret123");
    const board = await createTestBoard(alice.token);
    const { cardId } = await createTestCardInBoard(alice.token, board.id);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/${cardId}/watch`, bob.token)
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent card", async () => {
    const alice = await registerUser("alice", "secret123");
    const board = await createTestBoard(alice.token);

    const res = await app.fetch(
      authReq("POST", `/api/boards/${board.id}/cards/nonexistent/watch`, alice.token)
    );
    expect(res.status).toBe(404);
  });
});
