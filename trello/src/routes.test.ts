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

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  db = createTestDb(`${TEST_DIR}/test-${Date.now()}.db`);
  app = createApp(db);
});

afterEach(() => {
  db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// --- Column tests ---

describe("GET /api/columns", () => {
  it("returns empty columns array on fresh db", async () => {
    const res = await app.fetch(req("GET", "/api/columns"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { columns: ColumnWithCards[] };
    expect(data.columns).toEqual([]);
  });

  it("returns columns with nested cards ordered by position", async () => {
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c1", "To Do", 0);
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c2", "Done", 1);
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k1", "Card A", "", 0, "c1");
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k2", "Card B", "desc", 1, "c1");

    const res = await app.fetch(req("GET", "/api/columns"));
    const data = (await res.json()) as { columns: ColumnWithCards[] };
    expect(data.columns).toHaveLength(2);
    expect(data.columns[0]!.id).toBe("c1");
    expect(data.columns[0]!.cards).toHaveLength(2);
    expect(data.columns[0]!.cards[0]!.title).toBe("Card A");
    expect(data.columns[0]!.cards[1]!.title).toBe("Card B");
    expect(data.columns[1]!.cards).toHaveLength(0);
  });
});

describe("POST /api/columns", () => {
  it("creates a column with auto-assigned position", async () => {
    const res = await app.fetch(req("POST", "/api/columns", { title: "Backlog" }));
    expect(res.status).toBe(201);
    const col = (await res.json()) as ColumnRow;
    expect(col.title).toBe("Backlog");
    expect(col.position).toBe(0);

    const res2 = await app.fetch(req("POST", "/api/columns", { title: "Archive" }));
    const col2 = (await res2.json()) as ColumnRow;
    expect(col2.position).toBe(1);
  });

  it("rejects empty title", async () => {
    const res = await app.fetch(req("POST", "/api/columns", { title: "" }));
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/columns/:id", () => {
  it("updates column title", async () => {
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c1", "Old", 0);
    const res = await app.fetch(req("PATCH", "/api/columns/c1", { title: "New" }));
    expect(res.status).toBe(200);
    const col = (await res.json()) as ColumnRow;
    expect(col.title).toBe("New");
  });

  it("returns 404 for missing column", async () => {
    const res = await app.fetch(req("PATCH", "/api/columns/nope", { title: "X" }));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/columns/:id", () => {
  it("deletes column and cascades cards", async () => {
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c1", "Col", 0);
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k1", "Card", "", 0, "c1");

    const res = await app.fetch(req("DELETE", "/api/columns/c1"));
    expect(res.status).toBe(200);

    const cards = db.query("SELECT * FROM cards WHERE column_id = ?").all("c1");
    expect(cards).toHaveLength(0);
  });

  it("returns 404 for missing column", async () => {
    const res = await app.fetch(req("DELETE", "/api/columns/nope"));
    expect(res.status).toBe(404);
  });
});

// --- Card tests ---

describe("POST /api/cards", () => {
  it("creates a card with auto-assigned position", async () => {
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c1", "Col", 0);

    const res = await app.fetch(req("POST", "/api/cards", { title: "Task 1", columnId: "c1" }));
    expect(res.status).toBe(201);
    const card = (await res.json()) as CardRow;
    expect(card.title).toBe("Task 1");
    expect(card.description).toBe("");
    expect(card.position).toBe(0);
    expect(card.column_id).toBe("c1");

    const res2 = await app.fetch(req("POST", "/api/cards", { title: "Task 2", columnId: "c1", description: "Details" }));
    const card2 = (await res2.json()) as CardRow;
    expect(card2.position).toBe(1);
    expect(card2.description).toBe("Details");
  });

  it("rejects empty title", async () => {
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c1", "Col", 0);
    const res = await app.fetch(req("POST", "/api/cards", { title: "", columnId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("rejects missing columnId", async () => {
    const res = await app.fetch(req("POST", "/api/cards", { title: "Task" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 for invalid column", async () => {
    const res = await app.fetch(req("POST", "/api/cards", { title: "Task", columnId: "bad" }));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/cards/:id", () => {
  it("updates card title and description", async () => {
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c1", "Col", 0);
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k1", "Old", "old desc", 0, "c1");

    const res = await app.fetch(req("PATCH", "/api/cards/k1", { title: "New", description: "new desc" }));
    expect(res.status).toBe(200);
    const card = (await res.json()) as CardRow;
    expect(card.title).toBe("New");
    expect(card.description).toBe("new desc");
  });

  it("moves card between columns and reorders", async () => {
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c1", "A", 0);
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c2", "B", 1);
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k1", "Card1", "", 0, "c1");
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k2", "Card2", "", 1, "c1");
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k3", "Card3", "", 0, "c2");

    // Move k1 from c1 to c2 at position 0
    const res = await app.fetch(req("PATCH", "/api/cards/k1", { columnId: "c2", position: 0 }));
    expect(res.status).toBe(200);
    const card = (await res.json()) as CardRow;
    expect(card.column_id).toBe("c2");
    expect(card.position).toBe(0);

    // k2 should now be at position 0 in c1
    const k2 = db.query("SELECT position FROM cards WHERE id = ?").get("k2") as { position: number };
    expect(k2.position).toBe(0);

    // k3 should have shifted to position 1 in c2
    const k3 = db.query("SELECT position FROM cards WHERE id = ?").get("k3") as { position: number };
    expect(k3.position).toBe(1);
  });

  it("rejects empty title", async () => {
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c1", "Col", 0);
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k1", "Task", "", 0, "c1");

    const res = await app.fetch(req("PATCH", "/api/cards/k1", { title: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 for missing card", async () => {
    const res = await app.fetch(req("PATCH", "/api/cards/nope", { title: "X" }));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/cards/:id", () => {
  it("deletes card and reorders remaining", async () => {
    db.query("INSERT INTO columns (id, title, position) VALUES (?, ?, ?)").run("c1", "Col", 0);
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k1", "A", "", 0, "c1");
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k2", "B", "", 1, "c1");
    db.query("INSERT INTO cards (id, title, description, position, column_id) VALUES (?, ?, ?, ?, ?)").run("k3", "C", "", 2, "c1");

    const res = await app.fetch(req("DELETE", "/api/cards/k1"));
    expect(res.status).toBe(200);

    // k2 and k3 should shift down
    const k2 = db.query("SELECT position FROM cards WHERE id = ?").get("k2") as { position: number };
    const k3 = db.query("SELECT position FROM cards WHERE id = ?").get("k3") as { position: number };
    expect(k2.position).toBe(0);
    expect(k3.position).toBe(1);
  });

  it("returns 404 for missing card", async () => {
    const res = await app.fetch(req("DELETE", "/api/cards/nope"));
    expect(res.status).toBe(404);
  });
});

// --- Seeding test ---

describe("database seeding", () => {
  it("getDb seeds 3 default columns on fresh database", async () => {
    // Import getDb and use a unique path
    const { getDb, resetDb } = await import("./db.ts");
    const testPath = `${TEST_DIR}/seed-test-${Date.now()}.db`;

    // Reset singleton so getDb creates a fresh one
    resetDb();
    const seedDb = getDb(testPath);

    const cols = seedDb.query("SELECT title FROM columns ORDER BY position").all() as { title: string }[];
    expect(cols.map((c) => c.title)).toEqual(["To Do", "In Progress", "Done"]);

    seedDb.close();
    resetDb();
  });
});
