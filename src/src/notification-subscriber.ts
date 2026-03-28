import type { Database } from "bun:sqlite";
import { eventBus, type TaktEvent } from "./event-bus";
import { EventTypes } from "./event-types";
import {
  getCardWatchers,
  createNotification,
} from "./db";
import { formatNotificationTitle, formatNotificationBody } from "./trigger-engine";
import type { SSEManager } from "./sse-manager";

// Events that auto-notify card watchers
const AUTO_NOTIFY_EVENTS = new Set([
  EventTypes.CARD_MOVED,
  EventTypes.CARD_UPDATED,
  EventTypes.CARD_DATES_CHANGED,
  EventTypes.COMMENT_CREATED,
  EventTypes.ARTIFACT_CREATED,
  EventTypes.ARTIFACT_UPDATED,
]);

export function initializeNotificationSubscriber(
  db: Database,
  sseManager?: SSEManager
): void {
  for (const eventType of AUTO_NOTIFY_EVENTS) {
    eventBus.on(eventType, async (event: TaktEvent) => {
      if (!event.cardId) return;

      // Skip automated events
      if (event.payload["_automated"] === true) return;

      const watchers = getCardWatchers(db, event.cardId);
      // Exclude the actor
      const recipients = watchers.filter((id) => id !== event.userId);
      if (recipients.length === 0) return;

      const title = formatNotificationTitle(event);
      const body = formatNotificationBody(event);

      for (const userId of recipients) {
        const notification = createNotification(
          db,
          event.boardId,
          userId,
          event.eventType,
          event.cardId,
          title,
          body
        );

        if (sseManager) {
          sseManager.sendToUser(
            event.boardId,
            userId,
            "notification.created",
            notification
          );
        }
      }
    });
  }
}
