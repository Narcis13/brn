import type { Database } from "bun:sqlite";
import type { TaktConfig } from "./cli-auth";
import {
  isBoardMember,
  getBoardTriggers,
  getTriggerById,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  getTriggerLogs,
  getBoardTriggerLogs,
  type TriggerRow,
} from "./src/db";
import { eventBus } from "./src/event-bus";
import {
  type FormatOptions,
  formatId,
  formatDateTime,
  printTable,
  printSuccess,
  printError,
  exitWithError,
  confirmOrExit,
} from "./cli-utils";

export async function listTriggers(
  db: Database,
  session: TaktConfig,
  boardId: string,
  options: FormatOptions
): Promise<void> {
  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("Board not found or not a member");
  }

  const triggers = getBoardTriggers(db, boardId);

  if (options.json) {
    console.log(JSON.stringify(triggers, null, 2));
    return;
  }

  if (triggers.length === 0) {
    console.log("No triggers configured");
    return;
  }

  printTable(
    ["ID", "Name", "Events", "Action", "Enabled", "Created"],
    triggers.map((t) => [
      formatId(t.id, options),
      t.name,
      formatEventTypes(t.event_types),
      t.action_type,
      t.enabled ? "yes" : "no",
      formatDateTime(t.created_at),
    ])
  );
}

export async function createTriggerCommand(
  db: Database,
  session: TaktConfig,
  boardId: string,
  name: string,
  eventTypesStr: string,
  actionType: string,
  actionConfigStr: string,
  conditionsStr: string | undefined,
  enabled: boolean,
  options: FormatOptions
): Promise<void> {
  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("Board not found or not a member");
  }

  if (!name || name.trim() === "") {
    exitWithError("name is required");
  }
  if (name.length > 100) {
    exitWithError("name must be 100 characters or less");
  }

  const eventTypes = eventTypesStr.split(",").map((s) => s.trim()).filter(Boolean);
  if (eventTypes.length === 0) {
    exitWithError("at least one event type is required");
  }

  const validActionTypes = ["webhook", "run_artifact", "notify", "auto_action"];
  if (!validActionTypes.includes(actionType)) {
    exitWithError(`action_type must be one of: ${validActionTypes.join(", ")}`);
  }

  let actionConfig: Record<string, unknown>;
  try {
    actionConfig = JSON.parse(actionConfigStr);
  } catch {
    exitWithError("action_config must be valid JSON");
  }

  let conditions: { column?: string; label?: string } | null = null;
  if (conditionsStr) {
    try {
      conditions = JSON.parse(conditionsStr);
    } catch {
      exitWithError("conditions must be valid JSON");
    }
  }

  const trigger = createTrigger(
    db,
    boardId,
    name.trim(),
    eventTypes,
    conditions,
    actionType as TriggerRow["action_type"],
    actionConfig,
    session.userId,
    enabled
  );

  if (options.json) {
    console.log(JSON.stringify(trigger, null, 2));
    return;
  }

  printSuccess(`Trigger created: ${formatId(trigger.id, options)} — ${trigger.name}`);
}

export async function showTrigger(
  db: Database,
  session: TaktConfig,
  triggerId: string,
  options: FormatOptions
): Promise<void> {
  const trigger = getTriggerById(db, triggerId);
  if (!trigger) {
    exitWithError("Trigger not found");
  }

  if (!isBoardMember(db, trigger.board_id, session.userId)) {
    exitWithError("Board not found or not a member");
  }

  if (options.json) {
    const logs = getTriggerLogs(db, triggerId, 10);
    console.log(JSON.stringify({ ...trigger, recent_logs: logs }, null, 2));
    return;
  }

  console.log(`Trigger: ${trigger.name}`);
  console.log(`ID: ${formatId(trigger.id, options)}`);
  console.log(`Enabled: ${trigger.enabled ? "yes" : "no"}`);
  console.log(`Events: ${formatEventTypes(trigger.event_types)}`);
  console.log(`Action: ${trigger.action_type}`);
  console.log(`Config: ${trigger.action_config}`);
  if (trigger.conditions) {
    console.log(`Conditions: ${trigger.conditions}`);
  }
  console.log(`Created: ${formatDateTime(trigger.created_at)}`);

  // Show recent logs
  const logs = getTriggerLogs(db, triggerId, 5);
  if (logs.length > 0) {
    console.log("\nRecent Executions:");
    printTable(
      ["Time", "Event", "Result", "Duration"],
      logs.map((l) => [
        formatDateTime(l.executed_at),
        l.event_type,
        l.result,
        `${l.duration_ms}ms`,
      ])
    );
  }
}

export async function updateTriggerCommand(
  db: Database,
  session: TaktConfig,
  triggerId: string,
  updates: {
    name?: string;
    enabled?: string;
    eventTypes?: string;
  },
  options: FormatOptions
): Promise<void> {
  const trigger = getTriggerById(db, triggerId);
  if (!trigger) {
    exitWithError("Trigger not found");
  }

  if (!isBoardMember(db, trigger.board_id, session.userId)) {
    exitWithError("Board not found or not a member");
  }

  const updatePayload: Parameters<typeof updateTrigger>[2] = {};

  if (updates.name) {
    updatePayload.name = updates.name;
  }
  if (updates.enabled !== undefined) {
    updatePayload.enabled = updates.enabled === "true" || updates.enabled === "1";
  }
  if (updates.eventTypes) {
    updatePayload.event_types = updates.eventTypes.split(",").map((s) => s.trim()).filter(Boolean);
  }

  const updated = updateTrigger(db, triggerId, updatePayload);
  if (!updated) {
    exitWithError("Failed to update trigger");
  }

  if (options.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  printSuccess(`Trigger updated: ${updated.name}`);
}

export async function deleteTriggerCommand(
  db: Database,
  session: TaktConfig,
  triggerId: string,
  options: FormatOptions
): Promise<void> {
  const trigger = getTriggerById(db, triggerId);
  if (!trigger) {
    exitWithError("Trigger not found");
  }

  if (!isBoardMember(db, trigger.board_id, session.userId)) {
    exitWithError("Board not found or not a member");
  }

  await confirmOrExit(options, `Delete trigger '${trigger.name}'?`);

  deleteTrigger(db, triggerId);

  if (options.json) {
    console.log(JSON.stringify({ ok: true }));
    return;
  }

  printSuccess("Trigger deleted");
}

export async function showTriggerLog(
  db: Database,
  session: TaktConfig,
  boardId: string,
  triggerId: string | undefined,
  limit: number,
  options: FormatOptions
): Promise<void> {
  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("Board not found or not a member");
  }

  const logs = triggerId
    ? getTriggerLogs(db, triggerId, limit)
    : getBoardTriggerLogs(db, boardId, limit);

  if (options.json) {
    console.log(JSON.stringify(logs, null, 2));
    return;
  }

  if (logs.length === 0) {
    console.log("No trigger executions found");
    return;
  }

  printTable(
    ["Time", "Trigger", "Event", "Result", "Duration", "Error"],
    logs.map((l) => [
      formatDateTime(l.executed_at),
      formatId(l.trigger_id, options),
      l.event_type,
      l.result,
      `${l.duration_ms}ms`,
      l.error_message ? l.error_message.slice(0, 50) : "",
    ])
  );
}

export async function testTrigger(
  db: Database,
  session: TaktConfig,
  triggerId: string,
  options: FormatOptions
): Promise<void> {
  const trigger = getTriggerById(db, triggerId);
  if (!trigger) {
    exitWithError("Trigger not found");
  }

  if (!isBoardMember(db, trigger.board_id, session.userId)) {
    exitWithError("Board not found or not a member");
  }

  const eventTypes: string[] = JSON.parse(trigger.event_types);
  const firstEvent = eventTypes[0] ?? "board.created";

  const syntheticEvent = {
    eventType: firstEvent,
    boardId: trigger.board_id,
    cardId: null,
    userId: session.userId,
    timestamp: new Date().toISOString(),
    payload: {
      _test: true,
      boardId: trigger.board_id,
    },
  };

  await eventBus.emit(syntheticEvent);

  if (options.json) {
    console.log(JSON.stringify({ ok: true, event: syntheticEvent }));
    return;
  }

  printSuccess(`Test event '${firstEvent}' fired for trigger '${trigger.name}'`);
}

function formatEventTypes(eventTypesJson: string): string {
  try {
    const types: string[] = JSON.parse(eventTypesJson);
    if (types.length <= 2) return types.join(", ");
    return `${types[0]}, ${types[1]} +${types.length - 2} more`;
  } catch {
    return eventTypesJson;
  }
}
