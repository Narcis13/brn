import type { Database } from "bun:sqlite";
import type { TaktConfig } from "./cli-auth";
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationById,
} from "./src/db";
import {
  type FormatOptions,
  formatId,
  formatDateTime,
  printTable,
  printSuccess,
  exitWithError,
} from "./cli-utils";

export async function listNotifications(
  db: Database,
  session: TaktConfig,
  boardId: string | undefined,
  unread: boolean,
  options: FormatOptions
): Promise<void> {
  const notifications = getUserNotifications(db, session.userId, {
    boardId,
    unread,
    limit: 50,
  });

  if (options.json) {
    console.log(JSON.stringify(notifications, null, 2));
    return;
  }

  if (notifications.length === 0) {
    console.log(unread ? "No unread notifications" : "No notifications");
    return;
  }

  printTable(
    ["ID", "Event", "Title", "Read", "Time"],
    notifications.map((n) => [
      formatId(n.id, options),
      n.event_type,
      n.title.length > 40 ? n.title.slice(0, 37) + "..." : n.title,
      n.read ? "yes" : "no",
      formatDateTime(n.created_at),
    ])
  );
}

export async function readNotification(
  db: Database,
  session: TaktConfig,
  notificationId: string | undefined,
  readAll: boolean,
  options: FormatOptions
): Promise<void> {
  if (readAll) {
    markAllNotificationsRead(db, session.userId);
    if (options.json) {
      console.log(JSON.stringify({ ok: true }));
      return;
    }
    printSuccess("All notifications marked as read");
    return;
  }

  if (!notificationId) {
    exitWithError("Usage: takt notification read [<id> | --all]");
  }

  const notification = getNotificationById(db, notificationId);
  if (!notification || notification.user_id !== session.userId) {
    exitWithError("Notification not found");
  }

  markNotificationRead(db, notificationId);

  if (options.json) {
    console.log(JSON.stringify({ ok: true }));
    return;
  }

  printSuccess("Notification marked as read");
}

export async function notificationCount(
  db: Database,
  session: TaktConfig,
  options: FormatOptions
): Promise<void> {
  const count = getUnreadNotificationCount(db, session.userId);

  if (options.json) {
    console.log(JSON.stringify({ unread: count }));
    return;
  }

  console.log(`Unread notifications: ${count}`);
}
