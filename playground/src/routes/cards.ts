import { Hono } from "hono";
import { authMiddleware, getAuthContext } from "../auth/middleware";
import * as cardService from "../cards/card.service";
import { getDb } from "../db";
import type { Context } from "hono";
import type { CardColumn } from "../types";

/** Valid column values for request validation */
const VALID_COLUMNS: ReadonlySet<string> = new Set(["todo", "doing", "done"]);

/**
 * Card routes — all routes require authentication.
 *
 * POST /  — Create a new card on a board
 *   Body: { title: string, boardId: string, column?: CardColumn }
 *   Returns 201 with created card
 *   Returns 400 if title is missing
 *   Returns 404 if board doesn't exist
 *   Returns 403 if user doesn't own the board
 */
export const cardRoutes = new Hono();

// All card routes require authentication
cardRoutes.use("*", authMiddleware);

// POST /api/cards — Create a new card
cardRoutes.post("/", async (c: Context) => {
  const authContext = getAuthContext(c);
  if (!authContext) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { title, boardId } = body;
    const column: CardColumn = body.column ?? "todo";

    // Validate column value
    if (!VALID_COLUMNS.has(column)) {
      return c.json({ error: "Invalid column. Must be todo, doing, or done" }, 400);
    }

    const db = getDb(Bun.env.DB_PATH ?? "./data/app.db");
    const card = await cardService.createCard(db, {
      title,
      boardId,
      column,
      userId: authContext.userId,
    });

    return c.json(card, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "Board not found") {
      return c.json({ error: message }, 404);
    }
    if (message === "Not authorized") {
      return c.json({ error: message }, 403);
    }
    if (message === "Card title is required") {
      return c.json({ error: message }, 400);
    }

    console.error("Error creating card:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
