import { Hono } from "hono";
import { authMiddleware, getAuthContext } from "../auth/middleware";
import * as boardRepo from "../boards/board.repo";
import { getDb } from "../db";
import type { Context } from "hono";

export const boardRoutes = new Hono();

// Apply auth middleware to all board routes
boardRoutes.use("*", authMiddleware);

// POST /api/boards - Create a new board
boardRoutes.post("/", async (c: Context) => {
  const authContext = getAuthContext(c);
  if (!authContext) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { name } = body;

    // Validate board name
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return c.json({ error: "Board name is required" }, 400);
    }

    if (name.length > 100) {
      return c.json({ error: "Board name must be 100 characters or less" }, 400);
    }

    // Create the board
    const db = getDb(Bun.env.DB_PATH ?? "./data/app.db");
    const board = await boardRepo.createBoard(db, {
      name: name.trim(),
      userId: authContext.userId
    });

    return c.json(board, 201);
  } catch (error) {
    console.error("Error creating board:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/boards - Get all boards for the authenticated user
boardRoutes.get("/", async (c: Context) => {
  const authContext = getAuthContext(c);
  if (!authContext) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const db = getDb(Bun.env.DB_PATH ?? "./data/app.db");
    const boards = await boardRepo.findBoardsByUserId(db, authContext.userId);
    return c.json(boards);
  } catch (error) {
    console.error("Error fetching boards:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});