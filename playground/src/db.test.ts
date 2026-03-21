import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertBookmark,
  getAllBookmarks,
  deleteBookmark,
  bookmarkExistsByUrl,
} from "./db.ts";
import type { Bookmark } from "./types.ts";

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

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: crypto.randomUUID(),
    url: "https://example.com",
    title: "Example",
    tags: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("db", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  test("insertBookmark and getAllBookmarks", () => {
    const bm = makeBookmark();
    insertBookmark(db, bm);
    const all = getAllBookmarks(db);
    expect(all).toHaveLength(1);
    expect(all[0]!.url).toBe("https://example.com");
    expect(all[0]!.title).toBe("Example");
    expect(all[0]!.tags).toEqual([]);
  });

  test("bookmarks returned newest first", () => {
    const bm1 = makeBookmark({
      url: "https://a.com",
      created_at: "2024-01-01T00:00:00Z",
    });
    const bm2 = makeBookmark({
      url: "https://b.com",
      created_at: "2024-06-01T00:00:00Z",
    });
    insertBookmark(db, bm1);
    insertBookmark(db, bm2);
    const all = getAllBookmarks(db);
    expect(all[0]!.url).toBe("https://b.com");
    expect(all[1]!.url).toBe("https://a.com");
  });

  test("search by title", () => {
    insertBookmark(db, makeBookmark({ url: "https://a.com", title: "Alpha" }));
    insertBookmark(db, makeBookmark({ url: "https://b.com", title: "Beta" }));
    const results = getAllBookmarks(db, "alpha");
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Alpha");
  });

  test("search by URL", () => {
    insertBookmark(
      db,
      makeBookmark({ url: "https://example.com/foo", title: "Foo" })
    );
    insertBookmark(
      db,
      makeBookmark({ url: "https://other.com/bar", title: "Bar" })
    );
    const results = getAllBookmarks(db, "example");
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Foo");
  });

  test("filter by tag", () => {
    insertBookmark(
      db,
      makeBookmark({ url: "https://a.com", tags: ["dev", "js"] })
    );
    insertBookmark(
      db,
      makeBookmark({ url: "https://b.com", tags: ["design"] })
    );
    const results = getAllBookmarks(db, undefined, "dev");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://a.com");
  });

  test("search and filter combined", () => {
    insertBookmark(
      db,
      makeBookmark({
        url: "https://a.com",
        title: "React Guide",
        tags: ["dev"],
      })
    );
    insertBookmark(
      db,
      makeBookmark({
        url: "https://b.com",
        title: "React Design",
        tags: ["design"],
      })
    );
    const results = getAllBookmarks(db, "React", "dev");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://a.com");
  });

  test("deleteBookmark removes it", () => {
    const bm = makeBookmark();
    insertBookmark(db, bm);
    expect(getAllBookmarks(db)).toHaveLength(1);
    const deleted = deleteBookmark(db, bm.id);
    expect(deleted).toBe(true);
    expect(getAllBookmarks(db)).toHaveLength(0);
  });

  test("deleteBookmark returns false for non-existent id", () => {
    const deleted = deleteBookmark(db, "nonexistent");
    expect(deleted).toBe(false);
  });

  test("bookmarkExistsByUrl", () => {
    const bm = makeBookmark();
    insertBookmark(db, bm);
    expect(bookmarkExistsByUrl(db, "https://example.com")).toBe(true);
    expect(bookmarkExistsByUrl(db, "https://other.com")).toBe(false);
  });

  test("duplicate URL throws", () => {
    const bm1 = makeBookmark();
    const bm2 = makeBookmark({ id: crypto.randomUUID() });
    insertBookmark(db, bm1);
    expect(() => insertBookmark(db, bm2)).toThrow();
  });

  test("tags stored and retrieved as arrays", () => {
    const bm = makeBookmark({ tags: ["dev", "tools", "bun"] });
    insertBookmark(db, bm);
    const all = getAllBookmarks(db);
    expect(all[0]!.tags).toEqual(["dev", "tools", "bun"]);
  });
});
