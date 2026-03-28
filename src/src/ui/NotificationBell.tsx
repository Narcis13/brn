import { useState, useEffect, useCallback, useRef } from "react";
import type { Notification } from "./api.ts";
import * as api from "./api.ts";

interface NotificationBellProps {
  boardId: string;
  onNavigateToCard?: (cardId: string) => void;
  externalNotification?: Notification | null;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function eventIcon(eventType: string): string {
  if (eventType.startsWith("card.moved")) return "\u2192";
  if (eventType.startsWith("card.")) return "\u25A1";
  if (eventType.startsWith("comment.")) return "\u{1F4AC}";
  if (eventType.startsWith("artifact.")) return "\u{1F4CE}";
  return "\u{1F514}";
}

export function NotificationBell({
  boardId,
  onNavigateToCard,
  externalNotification,
}: NotificationBellProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const [notifResult, countResult] = await Promise.all([
        api.fetchNotifications({ boardId, limit: 20 }),
        api.fetchUnreadCount(),
      ]);
      setNotifications(notifResult.notifications);
      setUnreadCount(countResult.unread);
    } catch {
      // ignore
    }
  }, [boardId]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Handle external SSE notifications
  useEffect(() => {
    if (externalNotification) {
      setNotifications((prev) => [externalNotification, ...prev].slice(0, 20));
      setUnreadCount((prev) => prev + 1);
    }
  }, [externalNotification]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleClickNotification = async (n: Notification) => {
    if (!n.read) {
      await api.markNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, read: 1 } : item
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    if (n.card_id && onNavigateToCard) {
      onNavigateToCard(n.card_id);
      setOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead(boardId);
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, read: 1 }))
    );
    setUnreadCount(0);
  };

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button
        className="notification-bell-btn"
        onClick={() => {
          setOpen(!open);
          if (!open) loadNotifications();
        }}
        title="Notifications"
      >
        {"\u{1F514}"}
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span className="notification-dropdown-title">Notifications</span>
            {unreadCount > 0 && (
              <button
                className="notification-mark-all-btn"
                onClick={handleMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-dropdown-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notification-item ${n.read ? "" : "notification-unread"}`}
                  onClick={() => handleClickNotification(n)}
                >
                  <span className="notification-icon">
                    {eventIcon(n.event_type)}
                  </span>
                  <div className="notification-content">
                    <div className="notification-title">{n.title}</div>
                    <div className="notification-body">{n.body}</div>
                    <div className="notification-time">
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
