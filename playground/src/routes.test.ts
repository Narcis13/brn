import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { createApp } from "./routes.ts";

function mockFetch(
  impl: () => Promise<Response>
): typeof globalThis.fetch {
  const fn = Object.assign(mock(impl), {
    preconnect: (_url: string | URL) => {},
  });
  return fn as unknown as typeof globalThis.fetch;
}

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE bookmarks (
      id TEXT PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )
  `);
  return db;
}

describe("routes", () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  function req(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Request {
    const init: RequestInit = { method };
    if (body) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    return new Request(`http://localhost${path}`, init);
  }

  describe("POST /api/bookmarks", () => {
    test("saves a bookmark with title fetched from URL", async () => {
      // Mock global fetch for title extraction
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch(() =>
        Promise.resolve(
          new Response("<html><title>Test Page</title></html>", {
            status: 200,
          })
        )
      );

      const res = await app.fetch(
        req("POST", "/api/bookmarks", { url: "https://example.com" })
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        url: string;
        title: string;
        tags: string[];
      };
      expect(body.url).toBe("https://example.com");
      expect(body.title).toBe("Test Page");
      expect(body.tags).toEqual([]);
      expect(body.id).toBeDefined();

      globalThis.fetch = originalFetch;
    });

    test("auto-prepends https:// for URLs without protocol", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch(() =>
        Promise.resolve(
          new Response("<html><title>Test</title></html>", { status: 200 })
        )
      );

      const res = await app.fetch(
        req("POST", "/api/bookmarks", { url: "example.com" })
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { url: string };
      expect(body.url).toBe("https://example.com");

      globalThis.fetch = originalFetch;
    });

    test("parses comma-separated tags", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch(() =>
        Promise.resolve(
          new Response("<html><title>T</title></html>", { status: 200 })
        )
      );

      const res = await app.fetch(
        req("POST", "/api/bookmarks", {
          url: "https://example.com",
          tags: "dev, tools, bun",
        })
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { tags: string[] };
      expect(body.tags).toEqual(["dev", "tools", "bun"]);

      globalThis.fetch = originalFetch;
    });

    test("rejects duplicate URLs with 409", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch(() =>
        Promise.resolve(
          new Response("<html><title>T</title></html>", { status: 200 })
        )
      );

      await app.fetch(
        req("POST", "/api/bookmarks", { url: "https://example.com" })
      );
      const res = await app.fetch(
        req("POST", "/api/bookmarks", { url: "https://example.com" })
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("already exists");

      globalThis.fetch = originalFetch;
    });

    test("rejects empty URL with 400", async () => {
      const res = await app.fetch(
        req("POST", "/api/bookmarks", { url: "" })
      );
      expect(res.status).toBe(400);
    });

    test("falls back to URL as title when fetch fails", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch(() => Promise.reject(new Error("Network error")));

      const res = await app.fetch(
        req("POST", "/api/bookmarks", { url: "https://example.com" })
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { title: string };
      expect(body.title).toBe("https://example.com");

      globalThis.fetch = originalFetch;
    });
  });

  describe("GET /api/bookmarks", () => {
    async function seedBookmark(
      url: string,
      title: string,
      tags: string[] = []
    ): Promise<void> {
      db.prepare(
        "INSERT INTO bookmarks (id, url, title, tags, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(
        crypto.randomUUID(),
        url,
        title,
        JSON.stringify(tags),
        new Date().toISOString()
      );
    }

    test("returns all bookmarks", async () => {
      await seedBookmark("https://a.com", "A");
      await seedBookmark("https://b.com", "B");
      const res = await app.fetch(req("GET", "/api/bookmarks"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as unknown[];
      expect(body).toHaveLength(2);
    });

    test("search by query", async () => {
      await seedBookmark("https://a.com", "Alpha");
      await seedBookmark("https://b.com", "Beta");
      const res = await app.fetch(req("GET", "/api/bookmarks?q=alpha"));
      const body = (await res.json()) as Array<{ title: string }>;
      expect(body).toHaveLength(1);
      expect(body[0]!.title).toBe("Alpha");
    });

    test("filter by tag", async () => {
      await seedBookmark("https://a.com", "A", ["dev"]);
      await seedBookmark("https://b.com", "B", ["design"]);
      const res = await app.fetch(req("GET", "/api/bookmarks?tag=dev"));
      const body = (await res.json()) as Array<{ url: string }>;
      expect(body).toHaveLength(1);
      expect(body[0]!.url).toBe("https://a.com");
    });

    test("returns empty array when no bookmarks", async () => {
      const res = await app.fetch(req("GET", "/api/bookmarks"));
      const body = (await res.json()) as unknown[];
      expect(body).toEqual([]);
    });
  });

  describe("DELETE /api/bookmarks/:id", () => {
    test("deletes existing bookmark", async () => {
      const id = crypto.randomUUID();
      db.prepare(
        "INSERT INTO bookmarks (id, url, title, tags, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(id, "https://a.com", "A", "[]", new Date().toISOString());

      const res = await app.fetch(req("DELETE", `/api/bookmarks/${id}`));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(true);

      const check = await app.fetch(req("GET", "/api/bookmarks"));
      const all = (await check.json()) as unknown[];
      expect(all).toHaveLength(0);
    });

    test("returns 404 for non-existent bookmark", async () => {
      const res = await app.fetch(
        req("DELETE", "/api/bookmarks/nonexistent")
      );
      expect(res.status).toBe(404);
    });
  });
});
