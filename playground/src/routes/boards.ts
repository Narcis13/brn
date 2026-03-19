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
    const board = await boardRepo.findBoardById(db, boardId);

    // Board not found or user doesn't own it
    if (!board || board.userId !== authContext.userId) {
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
    const db = getDb(Bun.env.DB_PATH ?? "./data/app.db");
    
    // Check if board exists and user owns it
    const existingBoard = await boardRepo.findBoardById(db, boardId);
    if (!existingBoard || existingBoard.userId !== authContext.userId) {
      return c.json({ error: "Board not found" }, 404);
    }

    const body = await c.req.json();
    const { name } = body;

    // Validate board name
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return c.json({ error: "Board name is required" }, 400);
    }

    if (name.length > 100) {
      return c.json({ error: "Board name must be 100 characters or less" }, 400);
    }

    // Update the board
    const updatedBoard = await boardRepo.updateBoard(db, boardId, {
      name: name.trim()
    });

    return c.json(updatedBoard);
  } catch (error) {
    console.error("Error updating board:", error);
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
    
    // Check if board exists and user owns it
    const existingBoard = await boardRepo.findBoardById(db, boardId);
    if (!existingBoard || existingBoard.userId !== authContext.userId) {
      return c.json({ error: "Board not found" }, 404);
    }

    // Delete the board
    await boardRepo.deleteBoard(db, boardId);

    return c.body(null, 204);
  } catch (error) {
    console.error("Error deleting board:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});