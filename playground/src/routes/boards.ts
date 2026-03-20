import { Hono } from "hono";
import { authMiddleware, getAuthContext } from "../auth/middleware";
import * as boardService from "../boards/board.service";
import * as cardService from "../cards/card.service";
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

    const db = getDb(Bun.env.DB_PATH ?? "./data/app.db");
    const board = await boardService.createBoard(db, {
      name,
      userId: authContext.userId
    });

    return c.json(board, 201);
  } catch (error: any) {
    console.error("Error creating board:", error);
    if (error.message === "Board name is required" || error.message === "Board name must be 100 characters or less") {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/boards/:boardId/cards - Get all cards for a board
boardRoutes.get("/:boardId/cards", async (c: Context) => {
  const authContext = getAuthContext(c);
  if (!authContext) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const boardId = c.req.param("boardId");
    const db = getDb(Bun.env.DB_PATH ?? "./data/app.db");
    const cards = await cardService.getCardsByBoard(db, boardId, authContext.userId);

    return c.json(cards);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "Board not found") {
      return c.json({ error: message }, 404);
    }
    if (message === "Not authorized") {
      return c.json({ error: message }, 403);
    }

    console.error("Error fetching board cards:", error);
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
    const boards = await boardService.getBoardsByUserId(db, authContext.userId);
    return c.json(boards);
  } catch (error) {
    console.error("Error fetching boards:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/boards/:id - Get a specific board
boardRoutes.get("/:id", async (c: Context) => {
  const authContext = getAuthContext(c);
  if (!authContext) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const boardId = c.req.param("id");
    if (!boardId) {
      return c.json({ error: "Board ID is required" }, 400);
    }
    const db = getDb(Bun.env.DB_PATH ?? "./data/app.db");
    const board = await boardService.getBoardById(db, boardId, authContext.userId);

    if (!board) {
      return c.json({ error: "Board not found" }, 404);
    }

    return c.json(board);
  } catch (error) {
    console.error("Error fetching board:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PUT /api/boards/:id - Update a board
boardRoutes.put("/:id", async (c: Context) => {
  const authContext = getAuthContext(c);
  if (!authContext) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const boardId = c.req.param("id");
    if (!boardId) {
      return c.json({ error: "Board ID is required" }, 400);
    }
    
    const body = await c.req.json();
    const { name } = body;

    const db = getDb(Bun.env.DB_PATH ?? "./data/app.db");
    const updatedBoard = await boardService.updateBoard(db, boardId, authContext.userId, {
      name
    });

    return c.json(updatedBoard);
  } catch (error: any) {
    console.error("Error updating board:", error);
    if (error.message === "Board not found") {
      return c.json({ error: error.message }, 404);
    }
    if (error.message === "Board name is required" || error.message === "Board name must be 100 characters or less") {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE /api/boards/:id - Delete a board
boardRoutes.delete("/:id", async (c: Context) => {
  const authContext = getAuthContext(c);
  if (!authContext) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const boardId = c.req.param("id");
    if (!boardId) {
      return c.json({ error: "Board ID is required" }, 400);
    }
    
    const db = getDb(Bun.env.DB_PATH ?? "./data/app.db");
    await boardService.deleteBoard(db, boardId, authContext.userId);

    return c.body(null, 204);
  } catch (error: any) {
    console.error("Error deleting board:", error);
    if (error.message === "Board not found") {
      return c.json({ error: error.message }, 404);
    }
    return c.json({ error: "Internal server error" }, 500);
  }
});