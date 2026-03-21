import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  insertBookmark,
  getAllBookmarks,
  deleteBookmark,
  bookmarkExistsByUrl,
} from "./db.ts";
import type { Bookmark, CreateBookmarkInput } from "./types.ts";

function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

async function fetchTitle(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "BookmarkVault/1.0" },
    });
    clearTimeout(timeout);

    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  } catch {
    // Fetch failed — fall back to URL
  }
  return url;
}

export function createApp(database: Database): Hono {
  const app = new Hono();

  app.post("/api/bookmarks", async (c) => {
    const body = await c.req.json<CreateBookmarkInput>();

    if (!body.url || typeof body.url !== "string" || body.url.trim() === "") {
      return c.json({ error: "URL is required" }, 400);
    }

    const url = normalizeUrl(body.url);

    if (!isValidUrl(url)) {
      return c.json({ error: "Invalid URL" }, 400);
    }

    if (bookmarkExistsByUrl(database, url)) {
      return c.json({ error: "Bookmark already exists for this URL" }, 409);
    }

    const title = await fetchTitle(url);
    const tags: string[] = body.tags
      ? body.tags
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];

    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      url,
      title,
      tags,
      created_at: new Date().toISOString(),
    };

    insertBookmark(database, bookmark);
    return c.json(bookmark, 201);
  });

  app.get("/api/bookmarks", (c) => {
    const query = c.req.query("q");
    const tag = c.req.query("tag");
    const bookmarks = getAllBookmarks(database, query, tag);
    return c.json(bookmarks);
  });

  app.delete("/api/bookmarks/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deleteBookmark(database, id);
    if (!deleted) {
      return c.json({ error: "Bookmark not found" }, 404);
    }
    return c.json({ success: true });
  });

  return app;
}
