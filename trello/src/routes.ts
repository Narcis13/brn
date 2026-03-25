import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { sign, verify } from "hono/jwt";
import { isValidDateFormat } from "./date-utils";
import {
  createUser,
  getUserByUsername,
  getUserBoards,
  createBoard,
  getBoardById,
  deleteBoard,
  getAllColumns,
  getColumnById,
  createColumn,
  updateColumn,
  deleteColumn,
  getCardById,
  createCard,
  updateCard,
  updateCardWithActivity,
  deleteCard,
  getBoardLabels,
  getLabelById,
  createLabel,
  updateLabel,
  deleteLabel,
  getCardLabels,
  assignLabelToCard,
  removeLabelFromCard,
  createActivity,
  getCardActivity,
  getCardDetail,
  searchCards,
  getCalendarCards,
  reorderColumns,
  isBoardMember,
  isBoardOwner,
  getBoardMembers,
  addBoardMember,
  removeBoardMember,
  createComment,
  getCommentById,
  updateComment,
  deleteComment,
  isAllowedEmoji,
  toggleReaction,
  targetExists,
  getTargetBoardId,
  toggleCardWatcher,
  isWatching,
  getWatcherCount,
  type BoardRow,
  type SearchDueFilter,
} from "./db.ts";

type Env = { Variables: { userId: string; username: string } };

const JWT_SECRET = process.env["JWT_SECRET"] ?? "brn-dev-jwt-secret";
const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
const MIN_PASSWORD_LENGTH = 6;

function getVerifiedBoard(db: Database, boardId: string, userId: string): BoardRow | null {
  const board = getBoardById(db, boardId);
  if (!board) return null;
  if (!isBoardMember(db, boardId, userId)) return null;
  return board;
}

function isSearchDueFilter(value: string): value is SearchDueFilter {
  return value === "overdue" || value === "today" || value === "week" || value === "none";
}

export function createApp(db: Database): Hono<Env> {
  const app = new Hono<Env>();

  // --- Auth middleware (protects all /api/* except register/login) ---
  app.use("/api/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path === "/api/auth/register" || path === "/api/auth/login") {
      return next();
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.slice(7);
    try {
      const payload = await verify(token, JWT_SECRET, "HS256");
      c.set("userId", payload["userId"] as string);
      c.set("username", payload["username"] as string);
      return next();
    } catch {
      return c.json({ error: "Unauthorized" }, 401);
    }
  });

  // --- Auth routes ---

  app.post("/api/auth/register", async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>();

    if (!body.username || !USERNAME_REGEX.test(body.username)) {
      return c.json(
        { error: "Username must be 3-30 characters, alphanumeric and underscore only" },
        400
      );
    }
    if (!body.password || body.password.length < MIN_PASSWORD_LENGTH) {
      return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
    }

    const existing = getUserByUsername(db, body.username);
    if (existing) {
      return c.json({ error: "Username already taken" }, 409);
    }

    const passwordHash = await Bun.password.hash(body.password);
    const user = createUser(db, body.username, passwordHash);

    const token = await sign(
      {
        userId: user.id,
        username: user.username,
        exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS,
      },
      JWT_SECRET
    );

    return c.json({ token, user: { id: user.id, username: user.username } }, 201);
  });

  app.post("/api/auth/login", async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>();

    if (!body.username || !body.password) {
      return c.json({ error: "Username and password required" }, 400);
    }

    const user = getUserByUsername(db, body.username);
    if (!user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const valid = await Bun.password.verify(body.password, user.password_hash);
    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const token = await sign(
      {
        userId: user.id,
        username: user.username,
        exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS,
      },
      JWT_SECRET
    );

    return c.json({ token, user: { id: user.id, username: user.username } });
  });

  app.get("/api/auth/me", (c) => {
    return c.json({ id: c.get("userId"), username: c.get("username") });
  });

  // --- Board routes ---

  app.get("/api/boards", (c) => {
    const userId = c.get("userId");
    const boards = getUserBoards(db, userId);
    return c.json({
      boards: boards.map((b) => ({ id: b.id, title: b.title, createdAt: b.created_at })),
    });
  });

  app.post("/api/boards", async (c) => {
    const body = await c.req.json<{ title?: string }>();
    if (!body.title || body.title.trim() === "") {
      return c.json({ error: "title is required" }, 400);
    }
    const userId = c.get("userId");
    const board = createBoard(db, body.title.trim(), userId);
    return c.json(
      { id: board.id, title: board.title, userId: board.user_id, createdAt: board.created_at },
      201
    );
  });

  app.delete("/api/boards/:id", (c) => {
    const boardId = c.req.param("id");
    const userId = c.get("userId");
    const board = getBoardById(db, boardId);
    if (!board || !isBoardMember(db, boardId, userId)) {
      return c.json({ error: "not found" }, 404);
    }
    if (!isBoardOwner(db, boardId, userId)) {
      return c.json({ error: "forbidden" }, 403);
    }
    deleteBoard(db, boardId);
    return c.json({ ok: true });
  });

  // --- Board Member routes ---

  app.get("/api/boards/:boardId/members", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    const members = getBoardMembers(db, board.id);
    return c.json({
      members: members.map((m) => ({
        id: m.user_id,
        username: m.username,
        role: m.role,
        invited_at: m.invited_at,
      })),
    });
  });

  app.post("/api/boards/:boardId/members", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getBoardById(db, boardId);
    if (!board) return c.json({ error: "not found" }, 404);
    if (!isBoardOwner(db, boardId, userId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = await c.req.json<{ username?: string }>();
    if (!body.username || body.username.trim() === "") {
      return c.json({ error: "username is required" }, 400);
    }

    const targetUser = getUserByUsername(db, body.username.trim());
    if (!targetUser) {
      return c.json({ error: "User not found" }, 404);
    }

    if (isBoardMember(db, boardId, targetUser.id)) {
      return c.json({ error: "User is already a board member" }, 409);
    }

    const member = addBoardMember(db, boardId, targetUser.id);
    return c.json(
      { id: member.user_id, username: member.username, role: member.role, invited_at: member.invited_at },
      201
    );
  });

  app.delete("/api/boards/:boardId/members/:userId", (c) => {
    const boardId = c.req.param("boardId");
    const currentUserId = c.get("userId");
    const targetUserId = c.req.param("userId");
    const board = getBoardById(db, boardId);
    if (!board) return c.json({ error: "not found" }, 404);
    if (!isBoardOwner(db, boardId, currentUserId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    // Cannot remove the board owner
    if (isBoardOwner(db, boardId, targetUserId)) {
      return c.json({ error: "Cannot remove the board owner" }, 400);
    }

    const removed = removeBoardMember(db, boardId, targetUserId);
    if (!removed) {
      return c.json({ error: "member not found" }, 404);
    }

    return c.json({ ok: true });
  });

  // --- Scoped Column routes ---

  app.get("/api/boards/:boardId/columns", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    const columns = getAllColumns(db, board.id);
    return c.json({ columns });
  });

  app.post("/api/boards/:boardId/columns", async (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    const body = await c.req.json<{ title?: string }>();
    if (!body.title || body.title.trim() === "") {
      return c.json({ error: "title is required" }, 400);
    }
    const col = createColumn(db, board.id, body.title.trim());
    return c.json(col, 201);
  });

  app.patch("/api/boards/:boardId/columns/reorder", async (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);

    const body = await c.req.json<{ column_ids?: unknown }>();
    if (!body.column_ids || !Array.isArray(body.column_ids)) {
      return c.json({ error: "column_ids array is required" }, 400);
    }

    if (!body.column_ids.every((id) => typeof id === "string")) {
      return c.json({ error: "column_ids must be an array of strings" }, 400);
    }

    const success = reorderColumns(db, board.id, body.column_ids);
    if (!success) {
      return c.json({ error: "column_ids must match all existing columns for this board" }, 400);
    }

    return c.json({ ok: true });
  });

  app.patch("/api/boards/:boardId/columns/:id", async (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    const colId = c.req.param("id");
    const existing = getColumnById(db, colId);
    if (!existing || existing.board_id !== board.id) {
      return c.json({ error: "column not found" }, 404);
    }
    const body = await c.req.json<{ title?: string }>();
    if (!body.title || body.title.trim() === "") {
      return c.json({ error: "title is required" }, 400);
    }
    const col = updateColumn(db, colId, body.title.trim());
    return c.json(col);
  });

  app.delete("/api/boards/:boardId/columns/:id", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    const colId = c.req.param("id");
    const existing = getColumnById(db, colId);
    if (!existing || existing.board_id !== board.id) {
      return c.json({ error: "column not found" }, 404);
    }
    deleteColumn(db, colId);
    return c.json({ ok: true });
  });

  // --- Scoped Card routes ---

  app.post("/api/boards/:boardId/cards", async (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    const body = await c.req.json<{ title?: string; description?: string; columnId?: string; due_date?: string | null }>();
    if (!body.title || body.title.trim() === "") {
      return c.json({ error: "title is required" }, 400);
    }
    if (!body.columnId) {
      return c.json({ error: "columnId is required" }, 400);
    }
    // Verify column belongs to this board
    const col = getColumnById(db, body.columnId);
    if (!col || col.board_id !== board.id) {
      return c.json({ error: "column not found" }, 404);
    }
    
    // Validate due_date if provided
    if (body.due_date !== undefined && body.due_date !== null && !isValidDateFormat(body.due_date)) {
      return c.json({ error: "due_date must be in format YYYY-MM-DD or YYYY-MM-DDTHH:MM" }, 400);
    }
    
    const card = createCard(db, body.title.trim(), body.columnId, body.description?.trim() ?? "", body.due_date || null, c.get("userId"));
    if (!card) return c.json({ error: "column not found" }, 404);
    return c.json(card, 201);
  });

  app.patch("/api/boards/:boardId/cards/:id", async (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    const cardId = c.req.param("id");

    // Verify card belongs to this board
    const existingCard = getCardById(db, cardId);
    if (!existingCard) return c.json({ error: "card not found" }, 404);
    const cardCol = getColumnById(db, existingCard.column_id);
    if (!cardCol || cardCol.board_id !== board.id) {
      return c.json({ error: "card not found" }, 404);
    }

    const body = await c.req.json<{
      title?: string;
      description?: string;
      columnId?: string;
      position?: number;
      due_date?: string | null;
      start_date?: string | null;
      checklist?: string;
    }>();
    if (body.title !== undefined && body.title.trim() === "") {
      return c.json({ error: "title cannot be empty" }, 400);
    }

    // Validate dates if provided
    if (body.start_date !== undefined && body.start_date !== null && !isValidDateFormat(body.start_date)) {
      return c.json({ error: "start_date must be in format YYYY-MM-DD or YYYY-MM-DDTHH:MM" }, 400);
    }
    if (body.due_date !== undefined && body.due_date !== null && !isValidDateFormat(body.due_date)) {
      return c.json({ error: "due_date must be in format YYYY-MM-DD or YYYY-MM-DDTHH:MM" }, 400);
    }
    if (body.start_date && body.due_date && body.start_date > body.due_date) {
      return c.json({ error: "start_date must be before or equal to due_date" }, 400);
    }

    // Validate checklist if provided
    if (body.checklist !== undefined) {
      try {
        const parsed = JSON.parse(body.checklist);
        if (!Array.isArray(parsed)) {
          return c.json({ error: "checklist must be a JSON array" }, 400);
        }
        // Validate each item has required fields
        for (const item of parsed) {
          if (typeof item !== 'object' || !item.id || !item.text || typeof item.checked !== 'boolean') {
            return c.json({ error: "checklist items must have id, text, and checked fields" }, 400);
          }
        }
      } catch {
        return c.json({ error: "checklist must be valid JSON" }, 400);
      }
    }

    // If moving to a different column, verify target column belongs to this board
    if (body.columnId) {
      const targetCol = getColumnById(db, body.columnId);
      if (!targetCol || targetCol.board_id !== board.id) {
        return c.json({ error: "column not found" }, 404);
      }
    }

    const card = updateCardWithActivity(db, cardId, board.id, {
      title: body.title?.trim(),
      description: body.description?.trim(),
      columnId: body.columnId,
      position: body.position,
      dueDate: body.due_date,
      startDate: body.start_date,
      checklist: body.checklist,
    }, c.get("userId"));
    if (!card) return c.json({ error: "card not found or invalid date range" }, 404);
    return c.json(card);
  });

  app.delete("/api/boards/:boardId/cards/:id", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    const cardId = c.req.param("id");

    // Verify card belongs to this board
    const existingCard = getCardById(db, cardId);
    if (!existingCard) return c.json({ error: "card not found" }, 404);
    const cardCol = getColumnById(db, existingCard.column_id);
    if (!cardCol || cardCol.board_id !== board.id) {
      return c.json({ error: "card not found" }, 404);
    }

    deleteCard(db, cardId);
    return c.json({ ok: true });
  });

  // --- Label routes ---

  app.get("/api/boards/:boardId/labels", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    const labels = getBoardLabels(db, board.id);
    return c.json({ labels });
  });

  app.post("/api/boards/:boardId/labels", async (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    
    const body = await c.req.json<{ name?: string; color?: string }>();
    if (!body.name || body.name.trim() === "" || body.name.length > 30) {
      return c.json({ error: "name is required and must be 30 characters or less" }, 400);
    }
    if (!body.color || !/^#[0-9a-fA-F]{6}$/.test(body.color)) {
      return c.json({ error: "color must be a valid hex color (e.g., #e74c3c)" }, 400);
    }
    
    try {
      const label = createLabel(db, board.id, body.name.trim(), body.color);
      return c.json(label, 201);
    } catch (err) {
      // UNIQUE constraint violation
      return c.json({ error: "A label with this name already exists on this board" }, 400);
    }
  });

  app.patch("/api/boards/:boardId/labels/:labelId", async (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    
    const labelId = c.req.param("labelId");
    const existing = getLabelById(db, labelId);
    if (!existing || existing.board_id !== board.id) {
      return c.json({ error: "label not found" }, 404);
    }
    
    const body = await c.req.json<{ name?: string; color?: string; position?: number }>();
    
    if (body.name !== undefined && (body.name.trim() === "" || body.name.length > 30)) {
      return c.json({ error: "name must be 30 characters or less and not empty" }, 400);
    }
    if (body.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(body.color)) {
      return c.json({ error: "color must be a valid hex color (e.g., #e74c3c)" }, 400);
    }
    
    try {
      const label = updateLabel(db, labelId, {
        name: body.name?.trim(),
        color: body.color,
        position: body.position,
      });
      return c.json(label);
    } catch (err) {
      // UNIQUE constraint violation
      return c.json({ error: "A label with this name already exists on this board" }, 400);
    }
  });

  app.delete("/api/boards/:boardId/labels/:labelId", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    
    const labelId = c.req.param("labelId");
    const existing = getLabelById(db, labelId);
    if (!existing || existing.board_id !== board.id) {
      return c.json({ error: "label not found" }, 404);
    }
    
    deleteLabel(db, labelId);
    return c.json({ ok: true });
  });

  // --- Card-Label assignment routes ---

  app.post("/api/boards/:boardId/cards/:cardId/labels", async (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    
    const cardId = c.req.param("cardId");
    const card = getCardById(db, cardId);
    if (!card) return c.json({ error: "card not found" }, 404);
    
    // Verify card belongs to this board
    const cardCol = getColumnById(db, card.column_id);
    if (!cardCol || cardCol.board_id !== board.id) {
      return c.json({ error: "card not found" }, 404);
    }
    
    const body = await c.req.json<{ labelId?: string }>();
    if (!body.labelId) {
      return c.json({ error: "labelId is required" }, 400);
    }
    
    // Verify label belongs to this board
    const label = getLabelById(db, body.labelId);
    if (!label || label.board_id !== board.id) {
      return c.json({ error: "label not found on this board" }, 404);
    }
    
    const success = assignLabelToCard(db, cardId, body.labelId);
    if (!success) {
      return c.json({ error: "label already assigned to card" }, 409);
    }
    
    // Create activity entry
    createActivity(db, cardId, board.id, "label_added", { name: label.name, color: label.color }, c.get("userId"));

    return c.json({ ok: true }, 201);
  });

  app.delete("/api/boards/:boardId/cards/:cardId/labels/:labelId", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    
    const cardId = c.req.param("cardId");
    const card = getCardById(db, cardId);
    if (!card) return c.json({ error: "card not found" }, 404);
    
    // Verify card belongs to this board
    const cardCol = getColumnById(db, card.column_id);
    if (!cardCol || cardCol.board_id !== board.id) {
      return c.json({ error: "card not found" }, 404);
    }
    
    const labelId = c.req.param("labelId");
    const label = getLabelById(db, labelId);
    const removed = removeLabelFromCard(db, cardId, labelId);
    if (!removed) {
      return c.json({ error: "label not assigned to card" }, 404);
    }

    // Create activity entry
    createActivity(db, cardId, board.id, "label_removed", { name: label?.name ?? "unknown", color: label?.color ?? "" }, c.get("userId"));
    
    return c.json({ ok: true });
  });

  // --- Comment routes ---

  app.post("/api/boards/:boardId/cards/:cardId/comments", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const cardId = c.req.param("cardId");
    const card = getCardById(db, cardId);
    if (!card) return c.json({ error: "card not found" }, 404);

    // Verify card belongs to this board
    const cardCol = getColumnById(db, card.column_id);
    if (!cardCol || cardCol.board_id !== board.id) {
      return c.json({ error: "card not found" }, 404);
    }

    const body = await c.req.json<{ content?: string }>();
    if (!body.content || body.content.trim() === "") {
      return c.json({ error: "content is required" }, 400);
    }
    if (body.content.length > 5000) {
      return c.json({ error: "content must be 5000 characters or less" }, 400);
    }

    const comment = createComment(db, cardId, board.id, userId, body.content.trim());
    return c.json({
      id: comment.id,
      content: comment.content,
      user_id: comment.user_id,
      username: comment.username,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      reactions: [],
    }, 201);
  });

  app.patch("/api/boards/:boardId/cards/:cardId/comments/:commentId", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const commentId = c.req.param("commentId");
    const existing = getCommentById(db, commentId);
    if (!existing || existing.board_id !== board.id) {
      return c.json({ error: "comment not found" }, 404);
    }

    // Author-only edit
    if (existing.user_id !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = await c.req.json<{ content?: string }>();
    if (!body.content || body.content.trim() === "") {
      return c.json({ error: "content is required" }, 400);
    }
    if (body.content.length > 5000) {
      return c.json({ error: "content must be 5000 characters or less" }, 400);
    }

    const updated = updateComment(db, commentId, body.content.trim());
    if (!updated) return c.json({ error: "comment not found" }, 404);

    return c.json({
      id: updated.id,
      content: updated.content,
      user_id: updated.user_id,
      username: updated.username,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      reactions: [],
    });
  });

  app.delete("/api/boards/:boardId/cards/:cardId/comments/:commentId", (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const commentId = c.req.param("commentId");
    const existing = getCommentById(db, commentId);
    if (!existing || existing.board_id !== board.id) {
      return c.json({ error: "comment not found" }, 404);
    }

    // Author or board owner can delete
    if (existing.user_id !== userId && !isBoardOwner(db, boardId, userId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    deleteComment(db, commentId);
    return c.json({ ok: true });
  });

  // --- Reactions route ---

  app.post("/api/boards/:boardId/reactions", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const body = await c.req.json<{ target_type?: string; target_id?: string; emoji?: string }>();

    if (!body.target_type || (body.target_type !== "comment" && body.target_type !== "activity")) {
      return c.json({ error: "target_type must be 'comment' or 'activity'" }, 400);
    }
    if (!body.target_id) {
      return c.json({ error: "target_id is required" }, 400);
    }
    if (!body.emoji || !isAllowedEmoji(body.emoji)) {
      return c.json({ error: "emoji must be one of: 👍 👎 ❤️ 🎉 😄 😕 🚀 👀" }, 400);
    }

    // Verify target exists and belongs to this board
    if (!targetExists(db, body.target_type, body.target_id)) {
      return c.json({ error: "target not found" }, 404);
    }
    const targetBoardId = getTargetBoardId(db, body.target_type, body.target_id);
    if (targetBoardId !== boardId) {
      return c.json({ error: "target not found" }, 404);
    }

    const result = toggleReaction(db, body.target_type, body.target_id, userId, body.emoji);
    return c.json(result);
  });

  // --- Watchers route ---

  app.post("/api/boards/:boardId/cards/:cardId/watch", (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const cardId = c.req.param("cardId");
    const card = getCardById(db, cardId);
    if (!card) return c.json({ error: "card not found" }, 404);

    // Verify card belongs to this board
    const cardCol = getColumnById(db, card.column_id);
    if (!cardCol || cardCol.board_id !== board.id) {
      return c.json({ error: "card not found" }, 404);
    }

    const watching = toggleCardWatcher(db, cardId, userId);
    return c.json({ watching });
  });

  // --- New Card Detail routes ---

  app.get("/api/boards/:boardId/cards/:cardId", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    
    const cardId = c.req.param("cardId");
    const cardDetail = getCardDetail(db, cardId);
    if (!cardDetail) return c.json({ error: "card not found" }, 404);
    
    // Verify card belongs to this board
    const cardCol = getColumnById(db, cardDetail.column_id);
    if (!cardCol || cardCol.board_id !== board.id) {
      return c.json({ error: "card not found" }, 404);
    }
    
    return c.json(cardDetail);
  });

  app.get("/api/boards/:boardId/cards/:cardId/activity", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    
    const cardId = c.req.param("cardId");
    const card = getCardById(db, cardId);
    if (!card) return c.json({ error: "card not found" }, 404);
    
    // Verify card belongs to this board
    const cardCol = getColumnById(db, card.column_id);
    if (!cardCol || cardCol.board_id !== board.id) {
      return c.json({ error: "card not found" }, 404);
    }
    
    // Get offset from query param
    const url = new URL(c.req.url);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    
    const activity = getCardActivity(db, cardId, 50, offset);
    return c.json({ activity });
  });

  // --- Search route ---

  app.get("/api/boards/:boardId/search", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    
    const url = new URL(c.req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const labelId = url.searchParams.get("label") || undefined;
    const dueParam = url.searchParams.get("due") || undefined;
    
    // Validate due parameter
    let due: SearchDueFilter | undefined;
    if (dueParam && isSearchDueFilter(dueParam)) {
      due = dueParam;
    } else if (dueParam) {
      return c.json({ error: "invalid due parameter, must be one of: overdue, today, week, none" }, 400);
    }
    
    // Validate label exists and belongs to board
    if (labelId) {
      const label = getLabelById(db, labelId);
      if (!label || label.board_id !== board.id) {
        return c.json({ error: "label not found" }, 404);
      }
    }
    
    const cards = searchCards(db, board.id, { q, labelId, due });
    return c.json({ cards });
  });

  // --- Calendar route ---

  app.get("/api/boards/:boardId/calendar", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    
    const url = new URL(c.req.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    
    // Validate parameters
    if (!start || !end) {
      return c.json({ error: "start and end parameters are required" }, 400);
    }
    
    // Validate date formats (accept both YYYY-MM-DD and YYYY-MM-DDTHH:MM)
    const isValidStart = isValidDateFormat(start);
    const isValidEnd = isValidDateFormat(end);
    
    if (!isValidStart || !isValidEnd) {
      return c.json({ error: "Invalid date format. Use YYYY-MM-DD or YYYY-MM-DDTHH:MM" }, 400);
    }
    
    // Get calendar cards
    const cards = getCalendarCards(db, board.id, start, end);
    
    return c.json({ cards });
  });

  return app;
}
