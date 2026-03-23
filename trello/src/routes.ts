import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  getAllColumns,
  createColumn,
  updateColumn,
  deleteColumn,
  createCard,
  updateCard,
  deleteCard,
} from "./db.ts";

export function createApp(db: Database): Hono {
  const app = new Hono();

  // --- Column routes ---

  app.get("/api/columns", (c) => {
    const columns = getAllColumns(db);
    return c.json({ columns });
  });

  app.post("/api/columns", async (c) => {
    const body = await c.req.json<{ title?: string }>();
    if (!body.title || body.title.trim() === "") {
      return c.json({ error: "title is required" }, 400);
    }
    const col = createColumn(db, body.title.trim());
    return c.json(col, 201);
  });

  app.patch("/api/columns/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ title?: string }>();
    if (!body.title || body.title.trim() === "") {
      return c.json({ error: "title is required" }, 400);
    }
    const col = updateColumn(db, id, body.title.trim());
    if (!col) return c.json({ error: "column not found" }, 404);
    return c.json(col);
  });

  app.delete("/api/columns/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deleteColumn(db, id);
    if (!deleted) return c.json({ error: "column not found" }, 404);
    return c.json({ ok: true });
  });

  // --- Card routes ---

  app.post("/api/cards", async (c) => {
    const body = await c.req.json<{ title?: string; description?: string; columnId?: string }>();
    if (!body.title || body.title.trim() === "") {
      return c.json({ error: "title is required" }, 400);
    }
    if (!body.columnId) {
      return c.json({ error: "columnId is required" }, 400);
    }
    const card = createCard(db, body.title.trim(), body.columnId, body.description?.trim() ?? "");
    if (!card) return c.json({ error: "column not found" }, 404);
    return c.json(card, 201);
  });

  app.patch("/api/cards/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ title?: string; description?: string; columnId?: string; position?: number }>();

    if (body.title !== undefined && body.title.trim() === "") {
      return c.json({ error: "title cannot be empty" }, 400);
    }

    const card = updateCard(db, id, {
      title: body.title?.trim(),
      description: body.description?.trim(),
      columnId: body.columnId,
      position: body.position,
    });
    if (!card) return c.json({ error: "card not found" }, 404);
    return c.json(card);
  });

  app.delete("/api/cards/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deleteCard(db, id);
    if (!deleted) return c.json({ error: "card not found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}
