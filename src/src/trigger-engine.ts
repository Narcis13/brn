import type { Database } from "bun:sqlite";
import { eventBus, type TaktEvent } from "./event-bus";
import {
  getEnabledTriggersForBoard,
  createTriggerLog,
  getCardById,
  getCardLabels,
  getColumnById,
  getColumnByTitle,
  getLabelByName,
  getArtifact,
  assignLabelToCard,
  removeLabelFromCard,
  updateCard,
  createNotification,
  getCardWatchers,
  getBoardMemberIds,
  getBoardOwnerId,
  type TriggerRow,
  type NotificationRow,
} from "./db";
import type { SSEManager } from "./sse-manager";

interface TriggerConditions {
  column?: string;
  label?: string;
}

interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
}

interface RunArtifactConfig {
  artifactId: string;
}

interface NotifyConfig {
  target: "watchers" | "members" | "owner";
}

type AutoActionConfig =
  | { action: "move_card"; targetColumn: string }
  | { action: "assign_label"; labelName: string }
  | { action: "remove_label"; labelName: string };

function matchesEventType(triggerPattern: string, eventType: string): boolean {
  if (triggerPattern === eventType) return true;
  if (triggerPattern === "*") return true;
  if (triggerPattern.endsWith(".*")) {
    const prefix = triggerPattern.slice(0, -2);
    return eventType.startsWith(prefix + ".");
  }
  return false;
}

function triggerMatchesEvent(trigger: TriggerRow, event: TaktEvent): boolean {
  const eventTypes: string[] = JSON.parse(trigger.event_types);
  return eventTypes.some((pattern) => matchesEventType(pattern, event.eventType));
}

function evaluateConditions(
  db: Database,
  conditions: TriggerConditions,
  event: TaktEvent
): boolean {
  // Column condition — applies to card events only
  if (conditions.column && event.cardId) {
    const card = getCardById(db, event.cardId);
    if (card) {
      const col = getColumnById(db, card.column_id);
      // Also check payload for target column (card.moved)
      const toColumn = event.payload["toColumn"] as string | undefined;
      if (col?.title !== conditions.column && toColumn !== conditions.column) {
        return false;
      }
    } else {
      return false;
    }
  }

  // Label condition — applies to card events
  if (conditions.label && event.cardId) {
    const labels = getCardLabels(db, event.cardId);
    const hasLabel = labels.some((l) => l.name === conditions.label);
    // Also check payload for label being assigned
    const labelName = event.payload["labelName"] as string | undefined;
    if (!hasLabel && labelName !== conditions.label) {
      return false;
    }
  }

  return true;
}

async function executeWebhook(
  config: WebhookConfig,
  event: TaktEvent,
  trigger: TriggerRow
): Promise<{ success: boolean; error?: string }> {
  const payload = JSON.stringify({
    event,
    trigger: { id: trigger.id, name: trigger.name },
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers ?? {}),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return { success: true };
      }

      if (response.status >= 500 && attempt === 0) {
        continue; // retry on 5xx
      }

      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (err) {
      if (attempt === 0 && err instanceof Error && err.name === "AbortError") {
        continue; // retry on timeout
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  return { success: false, error: "Max retries exceeded" };
}

async function executeRunArtifact(
  db: Database,
  config: RunArtifactConfig,
  event: TaktEvent
): Promise<{ success: boolean; error?: string; output?: string }> {
  const artifact = getArtifact(db, config.artifactId);
  if (!artifact) {
    return { success: false, error: "Artifact not found" };
  }

  if (artifact.card_id !== null) {
    return { success: false, error: "Artifact must be board-level (not card-level)" };
  }

  if (!["sh", "js", "ts"].includes(artifact.filetype)) {
    return {
      success: false,
      error: `Cannot run artifact of type '${artifact.filetype}'. Only sh, js, ts allowed.`,
    };
  }

  const tempFile = `/tmp/takt-trigger-artifact-${artifact.id}.${artifact.filetype}`;
  await Bun.write(tempFile, artifact.content);

  try {
    const cmd =
      artifact.filetype === "sh"
        ? ["/bin/sh", tempFile]
        : ["bun", "run", tempFile];

    if (artifact.filetype === "sh") {
      const chmod = Bun.spawn(["chmod", "+x", tempFile]);
      await chmod.exited;
    }

    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        TAKT_EVENT: JSON.stringify(event),
      },
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;

    let output = stdout + (stderr ? "\n" + stderr : "");
    // Truncate to 5000 chars
    if (output.length > 5000) {
      output = output.slice(0, 5000);
    }

    const exitCode = proc.exitCode ?? 0;
    if (exitCode !== 0) {
      return { success: false, error: output, output };
    }
    return { success: true, output };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Execution failed",
    };
  } finally {
    try {
      await Bun.$`rm ${tempFile}`;
    } catch {
      /* ignore */
    }
  }
}

function executeNotify(
  db: Database,
  config: NotifyConfig,
  event: TaktEvent,
  sseManager?: SSEManager
): { success: boolean; error?: string; notifications: NotificationRow[] } {
  const notifications: NotificationRow[] = [];
  let targetUserIds: string[] = [];

  switch (config.target) {
    case "watchers":
      if (event.cardId) {
        targetUserIds = getCardWatchers(db, event.cardId);
      }
      break;
    case "members":
      targetUserIds = getBoardMemberIds(db, event.boardId);
      break;
    case "owner": {
      const ownerId = getBoardOwnerId(db, event.boardId);
      if (ownerId) targetUserIds = [ownerId];
      break;
    }
  }

  // Exclude the actor
  targetUserIds = targetUserIds.filter((id) => id !== event.userId);

  if (targetUserIds.length === 0) {
    return { success: true, notifications };
  }

  const title = formatNotificationTitle(event);
  const body = formatNotificationBody(event);

  for (const userId of targetUserIds) {
    const notification = createNotification(
      db,
      event.boardId,
      userId,
      event.eventType,
      event.cardId,
      title,
      body
    );
    notifications.push(notification);

    // Push via SSE if available
    if (sseManager) {
      sseManager.sendToUser(event.boardId, userId, "notification.created", notification);
    }
  }

  return { success: true, notifications };
}

function executeAutoAction(
  db: Database,
  config: AutoActionConfig,
  event: TaktEvent
): { success: boolean; error?: string } {
  if (!event.cardId) {
    return { success: true }; // Silently skip for non-card events
  }

  const card = getCardById(db, event.cardId);
  if (!card) {
    return { success: false, error: "Card not found" };
  }

  // Get board_id from card's column
  const col = getColumnById(db, card.column_id);
  if (!col) {
    return { success: false, error: "Column not found" };
  }

  switch (config.action) {
    case "move_card": {
      const targetCol = getColumnByTitle(db, col.board_id, config.targetColumn);
      if (!targetCol) {
        return {
          success: false,
          error: `Target column '${config.targetColumn}' not found`,
        };
      }

      // Get max position in target column
      const maxPos = db
        .query(
          "SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE column_id = ?"
        )
        .get(targetCol.id) as { m: number };

      updateCard(db, event.cardId, {
        columnId: targetCol.id,
        position: maxPos.m + 1,
      });

      // Emit automated event (will NOT trigger other triggers)
      eventBus.emit({
        eventType: "card.moved",
        boardId: event.boardId,
        cardId: event.cardId,
        userId: event.userId,
        timestamp: new Date().toISOString(),
        payload: {
          cardId: event.cardId,
          cardTitle: card.title,
          fromColumn: col.title,
          toColumn: targetCol.title,
          fromPosition: card.position,
          toPosition: maxPos.m + 1,
          _automated: true,
        },
      });

      return { success: true };
    }

    case "assign_label": {
      const label = getLabelByName(db, col.board_id, config.labelName);
      if (!label) {
        return {
          success: false,
          error: `Label '${config.labelName}' not found`,
        };
      }
      assignLabelToCard(db, event.cardId, label.id);

      eventBus.emit({
        eventType: "card.label_assigned",
        boardId: event.boardId,
        cardId: event.cardId,
        userId: event.userId,
        timestamp: new Date().toISOString(),
        payload: {
          cardId: event.cardId,
          labelId: label.id,
          labelName: label.name,
          _automated: true,
        },
      });

      return { success: true };
    }

    case "remove_label": {
      const label = getLabelByName(db, col.board_id, config.labelName);
      if (!label) {
        return {
          success: false,
          error: `Label '${config.labelName}' not found`,
        };
      }
      removeLabelFromCard(db, event.cardId, label.id);

      eventBus.emit({
        eventType: "card.label_removed",
        boardId: event.boardId,
        cardId: event.cardId,
        userId: event.userId,
        timestamp: new Date().toISOString(),
        payload: {
          cardId: event.cardId,
          labelId: label.id,
          labelName: label.name,
          _automated: true,
        },
      });

      return { success: true };
    }

    default:
      return { success: false, error: "Unknown auto_action" };
  }
}

export function formatNotificationTitle(event: TaktEvent): string {
  const cardTitle = (event.payload["cardTitle"] ?? event.payload["title"] ?? "") as string;
  const shortTitle = cardTitle.length > 50 ? cardTitle.slice(0, 47) + "..." : cardTitle;

  switch (event.eventType) {
    case "card.moved":
      return `Card moved: ${shortTitle}`;
    case "card.updated":
      return `Card updated: ${shortTitle}`;
    case "card.dates_changed":
      return `Dates changed: ${shortTitle}`;
    case "comment.created":
      return `New comment on: ${shortTitle}`;
    case "artifact.created":
      return `Artifact added: ${(event.payload["name"] as string) ?? ""}`;
    case "artifact.updated":
      return `Artifact updated: ${(event.payload["name"] as string) ?? ""}`;
    default:
      return `${event.eventType}`;
  }
}

export function formatNotificationBody(event: TaktEvent): string {
  switch (event.eventType) {
    case "card.moved": {
      const from = event.payload["fromColumn"] as string;
      const to = event.payload["toColumn"] as string;
      return `Moved from "${from}" to "${to}"`;
    }
    case "card.updated": {
      const changes = event.payload["changes"] as string[] | undefined;
      return changes ? `Fields changed: ${changes.join(", ")}` : "Card was updated";
    }
    case "card.dates_changed": {
      const due = event.payload["dueDate"] as string | null;
      const start = event.payload["startDate"] as string | null;
      const parts: string[] = [];
      if (start) parts.push(`start: ${start}`);
      if (due) parts.push(`due: ${due}`);
      return parts.length > 0 ? parts.join(", ") : "Dates were changed";
    }
    case "comment.created":
      return ((event.payload["content"] as string) ?? "").slice(0, 200);
    case "artifact.created":
    case "artifact.updated":
      return `File: ${(event.payload["name"] as string) ?? ""}`;
    default:
      return event.eventType;
  }
}

export function initializeTriggerEngine(db: Database, sseManager?: SSEManager): void {
  // Subscribe to all events
  eventBus.on("*", async (event: TaktEvent) => {
    // Infinite loop prevention: skip automated events
    if (event.payload["_automated"] === true) {
      // Still send to SSE for UI updates
      if (sseManager) {
        sseManager.broadcast(event.boardId, event.eventType, event);
      }
      return;
    }

    // Broadcast event to SSE clients
    if (sseManager) {
      sseManager.broadcast(event.boardId, event.eventType, event);
    }

    // Get all enabled triggers for this board
    const triggers = getEnabledTriggersForBoard(db, event.boardId);

    for (const trigger of triggers) {
      // Check if trigger matches event type
      if (!triggerMatchesEvent(trigger, event)) continue;

      // Check conditions
      if (trigger.conditions) {
        const conditions: TriggerConditions = JSON.parse(trigger.conditions);
        if (!evaluateConditions(db, conditions, event)) continue;
      }

      // Execute action asynchronously
      executeTriggerAction(db, trigger, event, sseManager).catch((err) => {
        console.error(`Trigger ${trigger.id} execution error:`, err);
      });
    }
  });
}

async function executeTriggerAction(
  db: Database,
  trigger: TriggerRow,
  event: TaktEvent,
  sseManager?: SSEManager
): Promise<void> {
  const startTime = Date.now();
  let result: "success" | "error" = "success";
  let errorMessage: string | null = null;

  try {
    switch (trigger.action_type) {
      case "webhook": {
        const config: WebhookConfig = JSON.parse(trigger.action_config);
        const res = await executeWebhook(config, event, trigger);
        if (!res.success) {
          result = "error";
          errorMessage = res.error ?? "Unknown webhook error";
        }
        break;
      }

      case "run_artifact": {
        const config: RunArtifactConfig = JSON.parse(trigger.action_config);
        const res = await executeRunArtifact(db, config, event);
        if (!res.success) {
          result = "error";
          errorMessage = res.error ?? "Unknown artifact error";
        } else if (res.output) {
          errorMessage = res.output; // Store output in error_message field
        }
        break;
      }

      case "notify": {
        const config: NotifyConfig = JSON.parse(trigger.action_config);
        const res = executeNotify(db, config, event, sseManager);
        if (!res.success) {
          result = "error";
          errorMessage = res.error ?? "Unknown notify error";
        }
        break;
      }

      case "auto_action": {
        const config: AutoActionConfig = JSON.parse(trigger.action_config);
        const res = executeAutoAction(db, config, event);
        if (!res.success) {
          result = "error";
          errorMessage = res.error ?? "Unknown auto_action error";
        }
        break;
      }
    }
  } catch (err) {
    result = "error";
    errorMessage = err instanceof Error ? err.message : "Unexpected error";
  }

  const durationMs = Date.now() - startTime;
  const eventPayload = JSON.stringify(event);

  const logEntry = createTriggerLog(
    db,
    trigger.id,
    trigger.board_id,
    event.eventType,
    eventPayload,
    result,
    errorMessage,
    durationMs
  );

  // Send trigger.executed event via SSE
  if (sseManager) {
    sseManager.broadcast(event.boardId, "trigger.executed", {
      triggerId: trigger.id,
      triggerName: trigger.name,
      eventType: event.eventType,
      result,
      errorMessage,
      durationMs,
      executedAt: logEntry.executed_at,
    });
  }
}
