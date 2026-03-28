import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "./db.ts";
import {
  createUser,
  createBoard,
  createTrigger,
  getTriggerById,
  getBoardTriggers,
  updateTrigger,
  deleteTrigger,
  createTriggerLog,
  getTriggerLogs,
  getBoardTriggerLogs,
  createNotification,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteOldReadNotifications,
  getNotificationById,
  getCardWatchers,
  getBoardMemberIds,
  getBoardOwnerId,
  createCard,
  createColumn,
  getColumnByTitle,
  getLabelByName,
  createLabel,
  cardHasLabel,
  assignLabelToCard,
  type TriggerRow,
} from "./db.ts";
import { eventBus } from "./event-bus.ts";
import { mkdirSync, rmSync } from "node:fs";

const TEST_DIR = "/tmp/brn-test-triggers-" + Date.now();
let db: Database;

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  db = createTestDb(`${TEST_DIR}/test-${Date.now()}.db`);
  eventBus.clear();
});

afterEach(() => {
  db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function setupBoard(): { userId: string; boardId: string } {
  const hash = Bun.password.hashSync("test123");
  const user = createUser(db, "testuser", hash);
  const board = createBoard(db, "Test Board", user.id);
  return { userId: user.id, boardId: board.id };
}

// ============================================================
// Trigger CRUD
// ============================================================

describe("Trigger CRUD", () => {
  it("creates a trigger with all fields", () => {
    const { userId, boardId } = setupBoard();
    const trigger = createTrigger(
      db, boardId, "My Trigger",
      ["card.moved", "card.created"],
      { column: "Done" },
      "webhook",
      { url: "https://example.com/hook" },
      userId
    );

    expect(trigger.id).toBeDefined();
    expect(trigger.board_id).toBe(boardId);
    expect(trigger.name).toBe("My Trigger");
    expect(JSON.parse(trigger.event_types)).toEqual(["card.moved", "card.created"]);
    expect(JSON.parse(trigger.conditions!)).toEqual({ column: "Done" });
    expect(trigger.action_type).toBe("webhook");
    expect(JSON.parse(trigger.action_config)).toEqual({ url: "https://example.com/hook" });
    expect(trigger.enabled).toBe(1);
    expect(trigger.user_id).toBe(userId);
  });

  it("gets trigger by ID", () => {
    const { userId, boardId } = setupBoard();
    const created = createTrigger(db, boardId, "Test", ["card.*"], null, "notify", { target: "watchers" }, userId);
    const fetched = getTriggerById(db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Test");
  });

  it("lists board triggers", () => {
    const { userId, boardId } = setupBoard();
    createTrigger(db, boardId, "T1", ["card.moved"], null, "notify", { target: "watchers" }, userId);
    createTrigger(db, boardId, "T2", ["card.created"], null, "webhook", { url: "https://x.com" }, userId);

    const triggers = getBoardTriggers(db, boardId);
    expect(triggers).toHaveLength(2);
  });

  it("updates trigger fields", () => {
    const { userId, boardId } = setupBoard();
    const trigger = createTrigger(db, boardId, "Original", ["card.moved"], null, "notify", { target: "watchers" }, userId);

    const updated = updateTrigger(db, trigger.id, {
      name: "Updated Name",
      enabled: false,
      event_types: ["card.moved", "card.updated"],
    });

    expect(updated!.name).toBe("Updated Name");
    expect(updated!.enabled).toBe(0);
    expect(JSON.parse(updated!.event_types)).toEqual(["card.moved", "card.updated"]);
  });

  it("deletes a trigger", () => {
    const { userId, boardId } = setupBoard();
    const trigger = createTrigger(db, boardId, "ToDelete", ["card.*"], null, "notify", { target: "watchers" }, userId);

    const result = deleteTrigger(db, trigger.id);
    expect(result).toBe(true);
    expect(getTriggerById(db, trigger.id)).toBeNull();
  });

  it("creates trigger with disabled state", () => {
    const { userId, boardId } = setupBoard();
    const trigger = createTrigger(db, boardId, "Disabled", ["card.*"], null, "notify", { target: "watchers" }, userId, false);
    expect(trigger.enabled).toBe(0);
  });
});

// ============================================================
// Trigger Log
// ============================================================

describe("Trigger Log", () => {
  it("creates a trigger log entry", () => {
    const { userId, boardId } = setupBoard();
    const trigger = createTrigger(db, boardId, "T1", ["card.moved"], null, "notify", { target: "watchers" }, userId);

    const log = createTriggerLog(db, trigger.id, boardId, "card.moved", '{"test":true}', "success", null, 42);
    expect(log.trigger_id).toBe(trigger.id);
    expect(log.result).toBe("success");
    expect(log.duration_ms).toBe(42);
    expect(log.error_message).toBeNull();
  });

  it("logs errors with error message", () => {
    const { userId, boardId } = setupBoard();
    const trigger = createTrigger(db, boardId, "T1", ["card.moved"], null, "webhook", { url: "https://x.com" }, userId);

    const log = createTriggerLog(db, trigger.id, boardId, "card.moved", '{}', "error", "Connection refused", 150);
    expect(log.result).toBe("error");
    expect(log.error_message).toBe("Connection refused");
  });

  it("retrieves logs per trigger", () => {
    const { userId, boardId } = setupBoard();
    const trigger = createTrigger(db, boardId, "T1", ["card.*"], null, "notify", { target: "watchers" }, userId);

    createTriggerLog(db, trigger.id, boardId, "card.moved", '{}', "success", null, 10);
    createTriggerLog(db, trigger.id, boardId, "card.created", '{}', "error", "fail", 20);

    const logs = getTriggerLogs(db, trigger.id);
    expect(logs).toHaveLength(2);
  });

  it("retrieves logs per board", () => {
    const { userId, boardId } = setupBoard();
    const t1 = createTrigger(db, boardId, "T1", ["card.*"], null, "notify", { target: "watchers" }, userId);
    const t2 = createTrigger(db, boardId, "T2", ["card.*"], null, "webhook", { url: "https://x.com" }, userId);

    createTriggerLog(db, t1.id, boardId, "card.moved", '{}', "success", null, 10);
    createTriggerLog(db, t2.id, boardId, "card.created", '{}', "success", null, 20);

    const logs = getBoardTriggerLogs(db, boardId);
    expect(logs).toHaveLength(2);
  });

  it("caps event payload at 10KB", () => {
    const { userId, boardId } = setupBoard();
    const trigger = createTrigger(db, boardId, "T1", ["card.*"], null, "notify", { target: "watchers" }, userId);

    const largePayload = "x".repeat(20000);
    const log = createTriggerLog(db, trigger.id, boardId, "card.moved", largePayload, "success", null, 5);
    expect(log.event_payload.length).toBeLessThanOrEqual(10240);
  });
});

// ============================================================
// Notifications
// ============================================================

describe("Notification CRUD", () => {
  it("creates a notification", () => {
    const { userId, boardId } = setupBoard();
    const notif = createNotification(db, boardId, userId, "card.moved", "card-123", "Card moved", "From Todo to Done");
    expect(notif.board_id).toBe(boardId);
    expect(notif.user_id).toBe(userId);
    expect(notif.event_type).toBe("card.moved");
    expect(notif.card_id).toBe("card-123");
    expect(notif.title).toBe("Card moved");
    expect(notif.body).toBe("From Todo to Done");
    expect(notif.read).toBe(0);
  });

  it("lists user notifications with filters", () => {
    const { userId, boardId } = setupBoard();
    createNotification(db, boardId, userId, "card.moved", null, "N1", "Body 1");
    createNotification(db, boardId, userId, "card.updated", null, "N2", "Body 2");

    const all = getUserNotifications(db, userId);
    expect(all).toHaveLength(2);

    const byBoard = getUserNotifications(db, userId, { boardId });
    expect(byBoard).toHaveLength(2);

    const unread = getUserNotifications(db, userId, { unread: true });
    expect(unread).toHaveLength(2);
  });

  it("counts unread notifications", () => {
    const { userId, boardId } = setupBoard();
    createNotification(db, boardId, userId, "card.moved", null, "N1", "Body");
    createNotification(db, boardId, userId, "card.updated", null, "N2", "Body");

    expect(getUnreadNotificationCount(db, userId)).toBe(2);

    const notif = getUserNotifications(db, userId)[0]!;
    markNotificationRead(db, notif.id);
    expect(getUnreadNotificationCount(db, userId)).toBe(1);
  });

  it("marks all notifications read", () => {
    const { userId, boardId } = setupBoard();
    createNotification(db, boardId, userId, "card.moved", null, "N1", "Body");
    createNotification(db, boardId, userId, "card.updated", null, "N2", "Body");

    markAllNotificationsRead(db, userId);
    expect(getUnreadNotificationCount(db, userId)).toBe(0);
  });

  it("marks all read scoped by board", () => {
    const { userId, boardId } = setupBoard();
    const board2 = createBoard(db, "Board 2", userId);

    createNotification(db, boardId, userId, "card.moved", null, "N1", "Body");
    createNotification(db, board2.id, userId, "card.moved", null, "N2", "Body");

    markAllNotificationsRead(db, userId, boardId);
    expect(getUnreadNotificationCount(db, userId)).toBe(1); // Only board2 notification remains unread
  });

  it("truncates long title and body", () => {
    const { userId, boardId } = setupBoard();
    const longTitle = "x".repeat(300);
    const longBody = "y".repeat(600);
    const notif = createNotification(db, boardId, userId, "card.moved", null, longTitle, longBody);
    expect(notif.title.length).toBeLessThanOrEqual(200);
    expect(notif.body.length).toBeLessThanOrEqual(500);
  });

  it("deletes old read notifications", () => {
    const { userId, boardId } = setupBoard();
    const notif = createNotification(db, boardId, userId, "card.moved", null, "Old", "Body");
    markNotificationRead(db, notif.id);

    // Manually backdate the notification
    db.query("UPDATE notifications SET created_at = datetime('now', '-31 days') WHERE id = ?").run(notif.id);

    const deleted = deleteOldReadNotifications(db, userId);
    expect(deleted).toBe(1);
  });
});

// ============================================================
// DB Helper Functions
// ============================================================

describe("DB helpers for triggers", () => {
  it("getColumnByTitle finds column", () => {
    const { boardId } = setupBoard();
    const col = getColumnByTitle(db, boardId, "To Do");
    expect(col).not.toBeNull();
    expect(col!.title).toBe("To Do");
  });

  it("getLabelByName finds label", () => {
    const { userId, boardId } = setupBoard();
    createLabel(db, boardId, "Bug", "#ff0000");
    const label = getLabelByName(db, boardId, "Bug");
    expect(label).not.toBeNull();
    expect(label!.name).toBe("Bug");
  });

  it("getBoardMemberIds returns member list", () => {
    const { userId, boardId } = setupBoard();
    const members = getBoardMemberIds(db, boardId);
    expect(members).toContain(userId);
  });

  it("getBoardOwnerId returns owner", () => {
    const { userId, boardId } = setupBoard();
    const ownerId = getBoardOwnerId(db, boardId);
    expect(ownerId).toBe(userId);
  });

  it("cardHasLabel checks correctly", () => {
    const { userId, boardId } = setupBoard();
    const col = getColumnByTitle(db, boardId, "To Do")!;
    const card = createCard(db, "Test Card", col.id, "", null, userId)!;
    const label = createLabel(db, boardId, "Bug", "#ff0000");

    expect(cardHasLabel(db, card.id, label.id)).toBe(false);
    assignLabelToCard(db, card.id, label.id);
    expect(cardHasLabel(db, card.id, label.id)).toBe(true);
  });
});
