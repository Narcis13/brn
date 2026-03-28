import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { sign, verify } from "hono/jwt";
import { isValidDateFormat } from "./date-utils";
import { eventBus, type TaktEvent } from "./event-bus";
import { EventTypes } from "./event-types";
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
  searchBoardArtifacts,
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
  getBoardFeed,
  createArtifact,
  getArtifact,
  getCardArtifacts,
  getBoardArtifacts,
  updateArtifact,
  deleteArtifact,
  // Trigger & notification imports
  createTrigger,
  getTriggerById,
  getBoardTriggers,
  updateTrigger,
  deleteTrigger,
  getTriggerLogs,
  getBoardTriggerLogs,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteOldReadNotifications,
  getNotificationById,
  type BoardRow,
  type SearchDueFilter,
  type ArtifactRow,
} from "./db.ts";
import type { SSEManager } from "./sse-manager.ts";

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

export function createApp(db: Database, sseManager?: SSEManager): Hono<Env> {
  const app = new Hono<Env>();

  // --- Auth middleware (protects all /api/* except register/login) ---
  app.use("/api/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path === "/api/auth/register" || path === "/api/auth/login") {
      return next();
    }

    // SSE endpoints handle auth via query param — let them through
    if (path.endsWith("/events")) {
      const tokenParam = c.req.query("token");
      if (tokenParam) {
        try {
          const payload = await verify(tokenParam, JWT_SECRET, "HS256");
          c.set("userId", payload["userId"] as string);
          c.set("username", payload["username"] as string);
          return next();
        } catch {
          return c.json({ error: "Unauthorized" }, 401);
        }
      }
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
    
    // Emit event
    await eventBus.emit({
      eventType: EventTypes.BOARD_CREATED,
      boardId: board.id,
      cardId: null,
      userId: userId,
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        name: board.title
      }
    });

    return c.json(
      { id: board.id, title: board.title, userId: board.user_id, createdAt: board.created_at },
      201
    );
  });

  app.delete("/api/boards/:id", async (c) => {
    const boardId = c.req.param("id");
    const userId = c.get("userId");
    const board = getBoardById(db, boardId);
    if (!board || !isBoardMember(db, boardId, userId)) {
      return c.json({ error: "not found" }, 404);
    }
    if (!isBoardOwner(db, boardId, userId)) {
      return c.json({ error: "forbidden" }, 403);
    }
    // Emit event before deletion
    await eventBus.emit({
      eventType: EventTypes.BOARD_DELETED,
      boardId: boardId,
      cardId: null,
      userId: userId,
      timestamp: new Date().toISOString(),
      payload: {
        boardId: boardId,
        name: board.title
      }
    });

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
    
    // Emit event
    await eventBus.emit({
      eventType: EventTypes.BOARD_MEMBER_INVITED,
      boardId: boardId,
      cardId: null,
      userId: userId,
      timestamp: new Date().toISOString(),
      payload: {
        boardId: boardId,
        invitedUserId: targetUser.id,
        invitedUserEmail: targetUser.username // username acts as email in this system
      }
    });

    return c.json(
      { id: member.user_id, username: member.username, role: member.role, invited_at: member.invited_at },
      201
    );
  });

  app.delete("/api/boards/:boardId/members/:userId", async (c) => {
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

    // Get user info before removal for the event
    const targetUser = db.query("SELECT username FROM users WHERE id = ?").get(targetUserId) as { username: string } | null;
    
    const removed = removeBoardMember(db, boardId, targetUserId);
    if (!removed) {
      return c.json({ error: "member not found" }, 404);
    }

    // Emit event
    await eventBus.emit({
      eventType: EventTypes.BOARD_MEMBER_REMOVED,
      boardId: boardId,
      cardId: null,
      userId: currentUserId,
      timestamp: new Date().toISOString(),
      payload: {
        boardId: boardId,
        removedUserId: targetUserId,
        removedUserEmail: targetUser?.username || "" // username acts as email in this system
      }
    });

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
    
    // Emit event
    await eventBus.emit({
      eventType: EventTypes.COLUMN_CREATED,
      boardId: board.id,
      cardId: null,
      userId: c.get("userId") || "",
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        columnId: col.id,
        name: col.title,
        position: col.position
      }
    });

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

    // Get all columns with their new positions for the event
    const columns = getAllColumns(db, board.id);
    
    // Emit event
    await eventBus.emit({
      eventType: EventTypes.COLUMN_REORDERED,
      boardId: board.id,
      cardId: null,
      userId: c.get("userId") || "",
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        columns: columns.map((col, idx) => ({ id: col.id, name: col.title, position: idx }))
      }
    });

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
    const oldName = existing.title;
    const col = updateColumn(db, colId, body.title.trim());
    if (!col) {
      return c.json({ error: "Failed to update column" }, 500);
    }
    
    // Emit event
    await eventBus.emit({
      eventType: EventTypes.COLUMN_UPDATED,
      boardId: board.id,
      cardId: null,
      userId: c.get("userId") || "",
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        columnId: colId,
        name: col.title,
        oldName: oldName
      }
    });

    return c.json(col);
  });

  app.delete("/api/boards/:boardId/columns/:id", async (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    const colId = c.req.param("id");
    const existing = getColumnById(db, colId);
    if (!existing || existing.board_id !== board.id) {
      return c.json({ error: "column not found" }, 404);
    }
    // Emit event before deletion
    await eventBus.emit({
      eventType: EventTypes.COLUMN_DELETED,
      boardId: board.id,
      cardId: null,
      userId: c.get("userId") || "",
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        columnId: colId,
        name: existing.title
      }
    });

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
    
    // Emit event
    await eventBus.emit({
      eventType: EventTypes.CARD_CREATED,
      boardId: board.id,
      cardId: card.id,
      userId: c.get("userId") || "",
      timestamp: new Date().toISOString(),
      payload: {
        cardId: card.id,
        boardId: board.id,
        columnId: card.column_id,
        title: card.title,
        position: card.position
      }
    });

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

    // Get the existing card first
    const existing = getCardById(db, cardId);
    if (!existing) return c.json({ error: "card not found" }, 404);

    // Track what changed for event emission
    const changes: string[] = [];
    const columnChanged = body.columnId && body.columnId !== existing.column_id;

    if (body.title !== undefined && body.title?.trim() !== existing.title) {
      changes.push("title");
    }
    if (body.description !== undefined && body.description?.trim() !== existing.description) {
      changes.push("description");
    }
    if ((body.due_date !== undefined && body.due_date !== existing.due_date) ||
        (body.start_date !== undefined && body.start_date !== existing.start_date)) {
      changes.push("dates");
    }
    if (body.checklist !== undefined && body.checklist !== existing.checklist) {
      changes.push("checklist");
    }

    // Perform the update
    const card = updateCard(db, cardId, {
      title: body.title?.trim(),
      description: body.description?.trim(),
      columnId: body.columnId,
      position: body.position,
      dueDate: body.due_date,
      startDate: body.start_date,
      checklist: body.checklist,
    });
    if (!card) return c.json({ error: "card not found or invalid date range" }, 404);

    // Emit appropriate events
    const userId = c.get("userId") || "";
    
    // Handle checklist changes first to emit granular events
    if (changes.includes("checklist")) {
      try {
        const oldChecklist = existing.checklist ? JSON.parse(existing.checklist) : [];
        const newChecklist = body.checklist ? JSON.parse(body.checklist) : [];
        
        // Create maps for easier comparison
        const oldItems = new Map(oldChecklist.map((item: any) => [item.id, item]));
        const newItems = new Map(newChecklist.map((item: any) => [item.id, item]));
        
        // Find added items
        for (const [id, newItem] of newItems) {
          if (!oldItems.has(id)) {
            await eventBus.emit({
              eventType: EventTypes.CHECKLIST_ITEM_ADDED,
              boardId: board.id,
              cardId: cardId,
              userId: userId,
              timestamp: new Date().toISOString(),
              payload: {
                boardId: board.id,
                cardId: cardId,
                itemIndex: newChecklist.findIndex((item: any) => item.id === id),
                text: (newItem as any).text
              }
            });
          }
        }
        
        // Find removed items
        for (const [id, oldItem] of oldItems) {
          if (!newItems.has(id)) {
            await eventBus.emit({
              eventType: EventTypes.CHECKLIST_ITEM_REMOVED,
              boardId: board.id,
              cardId: cardId,
              userId: userId,
              timestamp: new Date().toISOString(),
              payload: {
                boardId: board.id,
                cardId: cardId,
                itemIndex: oldChecklist.findIndex((item: any) => item.id === id),
                text: (oldItem as any).text
              }
            });
          }
        }
        
        // Find checked/unchecked changes
        for (const [id, newItem] of newItems) {
          const oldItem = oldItems.get(id);
          if (oldItem && (oldItem as any).checked !== (newItem as any).checked) {
            await eventBus.emit({
              eventType: (newItem as any).checked ? EventTypes.CHECKLIST_ITEM_CHECKED : EventTypes.CHECKLIST_ITEM_UNCHECKED,
              boardId: board.id,
              cardId: cardId,
              userId: userId,
              timestamp: new Date().toISOString(),
              payload: {
                boardId: board.id,
                cardId: cardId,
                itemIndex: newChecklist.findIndex((item: any) => item.id === id),
                text: (newItem as any).text
              }
            });
          }
        }
      } catch (err) {
        // If parsing fails, just emit a generic card update
        console.error("Failed to parse checklist for event emission:", err);
      }
    }
    
    if (columnChanged) {
      // Get column names for the event
      const oldCol = getColumnById(db, existing.column_id);
      const newCol = getColumnById(db, body.columnId!);
      if (oldCol && newCol) {
        await eventBus.emit({
          eventType: EventTypes.CARD_MOVED,
          boardId: board.id,
          cardId: cardId,
          userId: userId,
          timestamp: new Date().toISOString(),
          payload: {
            cardId: cardId,
            cardTitle: card.title,
            boardId: board.id,
            fromColumn: oldCol.title,
            toColumn: newCol.title,
            fromPosition: existing.position,
            toPosition: card.position
          }
        });
      }
    } else if (changes.length > 0) {
      // Emit appropriate event based on changes (excluding checklist which was already handled)
      if (changes.includes("dates")) {
        await eventBus.emit({
          eventType: EventTypes.CARD_DATES_CHANGED,
          boardId: board.id,
          cardId: cardId,
          userId: userId,
          timestamp: new Date().toISOString(),
          payload: {
            cardId: cardId,
            boardId: board.id,
            startDate: card.start_date,
            dueDate: card.due_date,
            oldStartDate: existing.start_date,
            oldDueDate: existing.due_date
          }
        });
      } else if (!changes.every(c => c === "checklist")) {
        // Only emit general update if there are non-checklist changes
        await eventBus.emit({
          eventType: EventTypes.CARD_UPDATED,
          boardId: board.id,
          cardId: cardId,
          userId: userId,
          timestamp: new Date().toISOString(),
          payload: {
            cardId: cardId,
            boardId: board.id,
            columnId: card.column_id,
            title: card.title,
            description: card.description,
            changes: changes.filter(c => c !== "checklist") // Exclude checklist as it's handled separately
          }
        });
      }
    }
    return c.json(card);
  });

  app.delete("/api/boards/:boardId/cards/:id", async (c) => {
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

    // Emit event before deletion
    await eventBus.emit({
      eventType: EventTypes.CARD_DELETED,
      boardId: board.id,
      cardId: cardId,
      userId: c.get("userId") || "",
      timestamp: new Date().toISOString(),
      payload: {
        cardId: cardId,
        boardId: board.id,
        columnId: existingCard.column_id,
        title: existingCard.title
      }
    });

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
      
      // Emit event
      await eventBus.emit({
        eventType: EventTypes.LABEL_CREATED,
        boardId: board.id,
        cardId: null,
        userId: c.get("userId") || "",
        timestamp: new Date().toISOString(),
        payload: {
          boardId: board.id,
          labelId: label.id,
          name: label.name,
          color: label.color
        }
      });

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

      if (!label) {
        return c.json({ error: "Failed to update label" }, 500);
      }

      // Emit event
      await eventBus.emit({
        eventType: EventTypes.LABEL_UPDATED,
        boardId: board.id,
        cardId: null,
        userId: c.get("userId") || "",
        timestamp: new Date().toISOString(),
        payload: {
          boardId: board.id,
          labelId: labelId,
          name: label.name,
          color: label.color,
          oldName: existing.name,
          oldColor: existing.color
        }
      });

      return c.json(label);
    } catch (err) {
      // UNIQUE constraint violation
      return c.json({ error: "A label with this name already exists on this board" }, 400);
    }
  });

  app.delete("/api/boards/:boardId/labels/:labelId", async (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);
    
    const labelId = c.req.param("labelId");
    const existing = getLabelById(db, labelId);
    if (!existing || existing.board_id !== board.id) {
      return c.json({ error: "label not found" }, 404);
    }
    
    // Emit event before deletion
    await eventBus.emit({
      eventType: EventTypes.LABEL_DELETED,
      boardId: board.id,
      cardId: null,
      userId: c.get("userId") || "",
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        labelId: labelId,
        name: existing.name
      }
    });

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
    
    // Emit event
    await eventBus.emit({
      eventType: EventTypes.CARD_LABEL_ASSIGNED,
      boardId: board.id,
      cardId: cardId,
      userId: c.get("userId") || "",
      timestamp: new Date().toISOString(),
      payload: {
        cardId: cardId,
        boardId: board.id,
        labelId: body.labelId,
        labelName: label?.name || "unknown"
      }
    });

    return c.json({ ok: true }, 201);
  });

  app.delete("/api/boards/:boardId/cards/:cardId/labels/:labelId", async (c) => {
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

    // Emit event
    await eventBus.emit({
      eventType: EventTypes.CARD_LABEL_REMOVED,
      boardId: board.id,
      cardId: cardId,
      userId: c.get("userId") || "",
      timestamp: new Date().toISOString(),
      payload: {
        cardId: cardId,
        boardId: board.id,
        labelId: labelId,
        labelName: label?.name ?? "unknown"
      }
    });
    
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
    
    // Emit event
    await eventBus.emit({
      eventType: EventTypes.COMMENT_CREATED,
      boardId: board.id,
      cardId: cardId,
      userId: userId,
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        cardId: cardId,
        commentId: comment.id,
        content: comment.content
      }
    });

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

    const oldContent = existing.content;
    const updated = updateComment(db, commentId, body.content.trim());
    if (!updated) return c.json({ error: "comment not found" }, 404);

    // Emit event
    await eventBus.emit({
      eventType: EventTypes.COMMENT_UPDATED,
      boardId: board.id,
      cardId: c.req.param("cardId"),
      userId: userId,
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        cardId: c.req.param("cardId"),
        commentId: commentId,
        content: updated.content,
        oldContent: oldContent
      }
    });

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

  app.delete("/api/boards/:boardId/cards/:cardId/comments/:commentId", async (c) => {
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

    // Emit event before deletion
    await eventBus.emit({
      eventType: EventTypes.COMMENT_DELETED,
      boardId: board.id,
      cardId: c.req.param("cardId"),
      userId: userId,
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        cardId: c.req.param("cardId"),
        commentId: commentId
      }
    });

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
    
    // Emit event
    await eventBus.emit({
      eventType: EventTypes.REACTION_TOGGLED,
      boardId: boardId,
      cardId: null, // reactions can be on comments or activities, not directly on cards
      userId: userId,
      timestamp: new Date().toISOString(),
      payload: {
        boardId: boardId,
        commentId: body.target_id, // assuming it's a comment for now
        emoji: body.emoji,
        added: (result as any).added
      }
    });

    return c.json(result);
  });

  // --- Watchers route ---

  app.post("/api/boards/:boardId/cards/:cardId/watch", async (c) => {
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
    
    // Emit event
    await eventBus.emit({
      eventType: watching ? EventTypes.CARD_WATCHED : EventTypes.CARD_UNWATCHED,
      boardId: board.id,
      cardId: cardId,
      userId: userId,
      timestamp: new Date().toISOString(),
      payload: {
        cardId: cardId,
        boardId: board.id,
        watcherId: userId,
        unwatcherId: userId
      }
    });
    
    return c.json({ watching });
  });

  // --- New Card Detail routes ---

  app.get("/api/boards/:boardId/cards/:cardId", (c) => {
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, c.req.param("boardId"), userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const cardId = c.req.param("cardId");
    const cardDetail = getCardDetail(db, cardId, userId);
    if (!cardDetail) return c.json({ error: "card not found" }, 404);

    // Verify card belongs to this board
    const cardCol = getColumnById(db, cardDetail.column_id);
    if (!cardCol || cardCol.board_id !== board.id) {
      return c.json({ error: "card not found" }, 404);
    }

    // Get artifacts for this card (without content to keep response light)
    const artifacts = getCardArtifacts(db, cardId).map(({ content, ...artifact }) => artifact);

    return c.json({ ...cardDetail, artifacts });
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

  // --- Board activity feed ---

  app.get("/api/boards/:boardId/activity", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);

    const url = new URL(c.req.url);
    const limitParam = parseInt(url.searchParams.get("limit") || "30", 10);
    const before = url.searchParams.get("before") ?? undefined;

    const feed = getBoardFeed(db, board.id, limitParam, before);
    return c.json(feed);
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
    
    // Also search board artifacts if there's a query
    const boardArtifacts = q ? searchBoardArtifacts(db, board.id, q) : [];
    
    return c.json({ cards, board_artifacts: boardArtifacts });
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

  // --- Artifact routes ---

  app.get("/api/boards/:boardId/cards/:cardId/artifacts", (c) => {
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

    const artifacts = getCardArtifacts(db, cardId);
    return c.json({ artifacts });
  });

  app.post("/api/boards/:boardId/cards/:cardId/artifacts", async (c) => {
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

    const body = await c.req.json<{ filename?: string; filetype?: string; content?: string }>();
    if (!body.filename || !body.filetype || !body.content) {
      return c.json({ error: "filename, filetype, and content are required" }, 400);
    }

    // Validate filetype
    const validFiletypes: ArtifactRow["filetype"][] = ["md", "html", "js", "ts", "sh"];
    if (!validFiletypes.includes(body.filetype as ArtifactRow["filetype"])) {
      return c.json({ error: "filetype must be one of: md, html, js, ts, sh" }, 400);
    }

    // Validate content size (100KB limit)
    if (body.content.length > 100 * 1024) {
      return c.json({ error: `Content exceeds 100KB limit (got ${Math.round(body.content.length / 1024)}KB)` }, 413);
    }

    try {
      const artifact = createArtifact(
        db,
        board.id,
        cardId,
        body.filename,
        body.filetype as ArtifactRow["filetype"],
        body.content,
        userId
      );

      // Emit event
      await eventBus.emit({
        eventType: EventTypes.ARTIFACT_CREATED,
        boardId: board.id,
        cardId: cardId,
        userId: userId || "",
        timestamp: new Date().toISOString(),
        payload: {
          boardId: board.id,
          artifactId: artifact.id,
          cardId: cardId,
          name: body.filename,
          type: body.filetype
        }
      });

      return c.json(artifact, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("UNIQUE constraint failed")) {
        return c.json({ error: `Artifact '${body.filename}' already exists on this card` }, 400);
      }
      return c.json({ error: message }, 400);
    }
  });

  app.get("/api/boards/:boardId/artifacts", (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const url = new URL(c.req.url);
    const scope = url.searchParams.get("scope");

    if (scope === "board") {
      // Board-level artifacts
      const artifacts = getBoardArtifacts(db, board.id);
      return c.json({ artifacts });
    } else {
      return c.json({ error: "scope=board is required for board-level artifacts" }, 400);
    }
  });

  app.post("/api/boards/:boardId/artifacts", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const body = await c.req.json<{ filename?: string; filetype?: string; content?: string }>();
    if (!body.filename || !body.filetype || !body.content) {
      return c.json({ error: "filename, filetype, and content are required" }, 400);
    }

    // Validate filetype
    const validFiletypes: ArtifactRow["filetype"][] = ["md", "html", "js", "ts", "sh"];
    if (!validFiletypes.includes(body.filetype as ArtifactRow["filetype"])) {
      return c.json({ error: "filetype must be one of: md, html, js, ts, sh" }, 400);
    }

    // Validate content size (100KB limit)
    if (body.content.length > 100 * 1024) {
      return c.json({ error: `Content exceeds 100KB limit (got ${Math.round(body.content.length / 1024)}KB)` }, 413);
    }

    try {
      const artifact = createArtifact(
        db,
        board.id,
        null, // board-level artifact
        body.filename,
        body.filetype as ArtifactRow["filetype"],
        body.content,
        userId
      );

      // Emit event
      await eventBus.emit({
        eventType: EventTypes.ARTIFACT_CREATED,
        boardId: board.id,
        cardId: null,
        userId: userId || "",
        timestamp: new Date().toISOString(),
        payload: {
          boardId: board.id,
          artifactId: artifact.id,
          cardId: null,
          name: body.filename,
          type: body.filetype
        }
      });

      return c.json(artifact, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("UNIQUE constraint failed")) {
        return c.json({ error: `Artifact '${body.filename}' already exists on this board` }, 400);
      }
      return c.json({ error: message }, 400);
    }
  });

  app.get("/api/boards/:boardId/artifacts/:id", (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const artifactId = c.req.param("id");
    const artifact = getArtifact(db, artifactId);
    if (!artifact || artifact.board_id !== board.id) {
      return c.json({ error: "artifact not found" }, 404);
    }

    return c.json(artifact);
  });

  app.patch("/api/boards/:boardId/artifacts/:id", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const artifactId = c.req.param("id");
    const artifact = getArtifact(db, artifactId);
    if (!artifact || artifact.board_id !== board.id) {
      return c.json({ error: "artifact not found" }, 404);
    }

    const body = await c.req.json<{ content?: string; filename?: string }>();
    if (!body.content && !body.filename) {
      return c.json({ error: "content or filename is required" }, 400);
    }

    // Validate content size if provided
    if (body.content && body.content.length > 100 * 1024) {
      return c.json({ error: `Content exceeds 100KB limit (got ${Math.round(body.content.length / 1024)}KB)` }, 413);
    }

    try {
      const updated = updateArtifact(db, artifactId, {
        content: body.content,
        filename: body.filename,
      });

      if (!updated) {
        return c.json({ error: "Failed to update artifact" }, 500);
      }

      // Emit event
      await eventBus.emit({
        eventType: EventTypes.ARTIFACT_UPDATED,
        boardId: board.id,
        cardId: artifact.card_id,
        userId: userId || "",
        timestamp: new Date().toISOString(),
        payload: {
          boardId: board.id,
          artifactId: artifactId,
          cardId: artifact.card_id,
          name: updated.filename,
          content: body.content
        }
      });

      return c.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("UNIQUE constraint failed")) {
        return c.json({ error: `Artifact with filename '${body.filename}' already exists` }, 400);
      }
      return c.json({ error: message }, 400);
    }
  });

  app.delete("/api/boards/:boardId/artifacts/:id", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const artifactId = c.req.param("id");
    const artifact = getArtifact(db, artifactId);
    if (!artifact || artifact.board_id !== board.id) {
      return c.json({ error: "artifact not found" }, 404);
    }

    // Emit event before deletion
    await eventBus.emit({
      eventType: EventTypes.ARTIFACT_DELETED,
      boardId: board.id,
      cardId: artifact.card_id,
      userId: userId || "",
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        artifactId: artifactId,
        cardId: artifact.card_id,
        name: artifact.filename
      }
    });

    deleteArtifact(db, artifactId);
    return c.json({ ok: true });
  });

  // Run an executable artifact (sh/js/ts only)
  app.post("/api/boards/:boardId/artifacts/:id/run", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const artifactId = c.req.param("id");
    const artifact = getArtifact(db, artifactId);
    if (!artifact || artifact.board_id !== board.id) {
      return c.json({ error: "artifact not found" }, 404);
    }

    if (!["sh", "js", "ts"].includes(artifact.filetype)) {
      return c.json({ error: `Cannot run artifact of type '${artifact.filetype}'. Only sh, js, and ts artifacts can be executed.` }, 400);
    }

    const tempFile = `/tmp/takt-artifact-run-${artifactId}.${artifact.filetype}`;
    await Bun.write(tempFile, artifact.content);

    let exitCode = 0;
    let output = "";

    try {
      const cmd = artifact.filetype === "sh"
        ? ["/bin/sh", tempFile]
        : ["bun", "run", tempFile];

      if (artifact.filetype === "sh") {
        const proc = Bun.spawn(["chmod", "+x", tempFile]);
        await proc.exited;
      }

      const proc = Bun.spawn(cmd, {
        stdout: "pipe",
        stderr: "pipe",
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      await proc.exited;
      exitCode = proc.exitCode || 0;
      output = stdout + (stderr ? "\n" + stderr : "");
    } catch (err) {
      output = err instanceof Error ? err.message : "Execution failed";
      exitCode = 1;
    } finally {
      try { await Bun.$`rm ${tempFile}`; } catch { /* ignore */ }
    }

    // Emit event
    await eventBus.emit({
      eventType: EventTypes.ARTIFACT_EXECUTED,
      boardId: board.id,
      cardId: artifact.card_id,
      userId: userId || "",
      timestamp: new Date().toISOString(),
      payload: {
        boardId: board.id,
        artifactId: artifactId,
        cardId: artifact.card_id,
        exitCode: exitCode,
        duration: 0 // TODO: track actual duration if needed
      }
    });

    return c.json({ output, exitCode });
  });

  // --- Trigger routes ---

  app.get("/api/boards/:boardId/triggers", (c) => {
    const board = getVerifiedBoard(db, c.req.param("boardId"), c.get("userId"));
    if (!board) return c.json({ error: "not found" }, 404);

    const triggers = getBoardTriggers(db, board.id);
    return c.json({ triggers });
  });

  app.post("/api/boards/:boardId/triggers", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const body = await c.req.json<{
      name?: string;
      event_types?: string[];
      conditions?: { column?: string; label?: string } | null;
      action_type?: string;
      action_config?: Record<string, unknown>;
      enabled?: boolean;
    }>();

    if (!body.name || body.name.trim() === "") {
      return c.json({ error: "name is required" }, 400);
    }
    if (body.name.length > 100) {
      return c.json({ error: "name must be 100 characters or less" }, 400);
    }
    if (!body.event_types || !Array.isArray(body.event_types) || body.event_types.length === 0) {
      return c.json({ error: "event_types must be a non-empty array" }, 400);
    }
    if (!body.action_type) {
      return c.json({ error: "action_type is required" }, 400);
    }
    const validActionTypes = ["webhook", "run_artifact", "notify", "auto_action"];
    if (!validActionTypes.includes(body.action_type)) {
      return c.json({ error: `action_type must be one of: ${validActionTypes.join(", ")}` }, 400);
    }
    if (!body.action_config || typeof body.action_config !== "object") {
      return c.json({ error: "action_config is required" }, 400);
    }

    const trigger = createTrigger(
      db,
      board.id,
      body.name.trim(),
      body.event_types,
      body.conditions ?? null,
      body.action_type as "webhook" | "run_artifact" | "notify" | "auto_action",
      body.action_config,
      userId,
      body.enabled ?? true
    );

    return c.json(trigger, 201);
  });

  app.patch("/api/boards/:boardId/triggers/:id", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const triggerId = c.req.param("id");
    const existing = getTriggerById(db, triggerId);
    if (!existing || existing.board_id !== board.id) {
      return c.json({ error: "trigger not found" }, 404);
    }

    const body = await c.req.json<{
      name?: string;
      event_types?: string[];
      conditions?: { column?: string; label?: string } | null;
      action_type?: string;
      action_config?: Record<string, unknown>;
      enabled?: boolean;
    }>();

    if (body.name !== undefined && body.name.length > 100) {
      return c.json({ error: "name must be 100 characters or less" }, 400);
    }

    const updated = updateTrigger(db, triggerId, {
      name: body.name,
      event_types: body.event_types,
      conditions: body.conditions,
      action_type: body.action_type as "webhook" | "run_artifact" | "notify" | "auto_action" | undefined,
      action_config: body.action_config,
      enabled: body.enabled,
    });

    if (!updated) return c.json({ error: "trigger not found" }, 404);
    return c.json(updated);
  });

  app.delete("/api/boards/:boardId/triggers/:id", (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const triggerId = c.req.param("id");
    const existing = getTriggerById(db, triggerId);
    if (!existing || existing.board_id !== board.id) {
      return c.json({ error: "trigger not found" }, 404);
    }

    deleteTrigger(db, triggerId);
    return c.json({ ok: true });
  });

  app.post("/api/boards/:boardId/triggers/:id/test", async (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const triggerId = c.req.param("id");
    const trigger = getTriggerById(db, triggerId);
    if (!trigger || trigger.board_id !== board.id) {
      return c.json({ error: "trigger not found" }, 404);
    }

    const eventTypes: string[] = JSON.parse(trigger.event_types);
    const firstEvent = eventTypes[0] ?? "board.created";

    // Fire a synthetic event
    const syntheticEvent = {
      eventType: firstEvent,
      boardId: board.id,
      cardId: null,
      userId: userId,
      timestamp: new Date().toISOString(),
      payload: {
        _test: true,
        boardId: board.id,
      },
    };

    await eventBus.emit(syntheticEvent);

    return c.json({ ok: true, event: syntheticEvent });
  });

  app.get("/api/boards/:boardId/triggers/:id/log", (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const triggerId = c.req.param("id");
    const trigger = getTriggerById(db, triggerId);
    if (!trigger || trigger.board_id !== board.id) {
      return c.json({ error: "trigger not found" }, 404);
    }

    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    const logs = getTriggerLogs(db, triggerId, limit, offset);
    return c.json({ logs });
  });

  app.get("/api/boards/:boardId/triggers/log", (c) => {
    const boardId = c.req.param("boardId");
    const userId = c.get("userId");
    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    const logs = getBoardTriggerLogs(db, board.id, limit, offset);
    return c.json({ logs });
  });

  // --- Notification routes ---

  app.get("/api/notifications", (c) => {
    const userId = c.get("userId");
    const boardId = c.req.query("board_id");
    const unread = c.req.query("unread") === "true";
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);

    const notifications = getUserNotifications(db, userId, {
      boardId,
      unread,
      limit,
      offset,
    });

    return c.json({ notifications });
  });

  app.get("/api/notifications/count", (c) => {
    const userId = c.get("userId");
    const unread = getUnreadNotificationCount(db, userId);
    return c.json({ unread });
  });

  app.patch("/api/notifications/:id/read", (c) => {
    const userId = c.get("userId");
    const notificationId = c.req.param("id");

    const notification = getNotificationById(db, notificationId);
    if (!notification || notification.user_id !== userId) {
      return c.json({ error: "not found" }, 404);
    }

    markNotificationRead(db, notificationId);
    return c.json({ ok: true });
  });

  app.post("/api/notifications/read-all", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json<{ boardId?: string }>().catch((): { boardId?: string } => ({}));
    markAllNotificationsRead(db, userId, body.boardId);
    return c.json({ ok: true });
  });

  app.delete("/api/notifications", (c) => {
    const userId = c.get("userId");
    const deleted = deleteOldReadNotifications(db, userId);
    return c.json({ deleted });
  });

  // --- SSE route ---
  // Note: EventSource doesn't support Authorization header, so also accept token via query param

  app.get("/api/boards/:boardId/events", async (c) => {
    const boardId = c.req.param("boardId");
    let userId = c.get("userId");

    // Fallback: check token query param (EventSource can't set headers)
    if (!userId) {
      const tokenParam = c.req.query("token");
      if (tokenParam) {
        try {
          const payload = await verify(tokenParam, JWT_SECRET, "HS256");
          userId = payload["userId"] as string;
        } catch {
          return c.json({ error: "Unauthorized" }, 401);
        }
      }
    }

    if (!userId) return c.json({ error: "Unauthorized" }, 401);

    const board = getVerifiedBoard(db, boardId, userId);
    if (!board) return c.json({ error: "not found" }, 404);

    if (!sseManager) {
      return c.json({ error: "SSE not available" }, 503);
    }

    let streamController: ReadableStreamDefaultController | null = null;

    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
        const added = sseManager.addConnection(boardId, userId, controller);
        if (!added) {
          controller.enqueue(
            new TextEncoder().encode(
              `event: error\ndata: ${JSON.stringify({ error: "Too many connections" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Send initial connection event
        controller.enqueue(
          new TextEncoder().encode(
            `event: connected\ndata: ${JSON.stringify({ boardId, userId })}\n\n`
          )
        );
      },
      cancel() {
        if (streamController) {
          sseManager.removeConnection(boardId, streamController);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  return app;
}
