import { eventBus, type TaktEvent } from './event-bus'
import { EventTypes } from './event-types'
import { createActivity } from './db'
import type { Database } from 'bun:sqlite'

export function initializeActivitySubscriber(db: Database): void {
  // Card events
  eventBus.on(EventTypes.CARD_CREATED, async (event: TaktEvent) => {
    createActivity(db, event.cardId, event.boardId, 'created', null, event.userId)
  })

  eventBus.on(EventTypes.CARD_MOVED, async (event: TaktEvent) => {
    const { fromColumn, toColumn } = event.payload as { fromColumn: string; toColumn: string }
    createActivity(db, event.cardId, event.boardId, 'moved', { from: fromColumn, to: toColumn }, event.userId)
  })

  eventBus.on(EventTypes.CARD_UPDATED, async (event: TaktEvent) => {
    const { changes } = event.payload as { changes: string[] }
    if (changes.length > 0) {
      createActivity(db, event.cardId, event.boardId, 'edited', { fields: changes }, event.userId)
    }
  })

  eventBus.on(EventTypes.CARD_DATES_CHANGED, async (event: TaktEvent) => {
    const payload = event.payload as {
      startDate?: string | null
      dueDate?: string | null
      oldStartDate?: string | null
      oldDueDate?: string | null
    }
    createActivity(db, event.cardId, event.boardId, 'dates_changed', {
      start_date: payload.startDate,
      due_date: payload.dueDate,
      prev_start_date: payload.oldStartDate,
      prev_due_date: payload.oldDueDate,
    }, event.userId)
  })

  eventBus.on(EventTypes.CARD_DELETED, async (event: TaktEvent) => {
    // Card deletion doesn't create activity since card is gone
    // But we could log it at board level if needed
  })

  // Label events
  eventBus.on(EventTypes.CARD_LABEL_ASSIGNED, async (event: TaktEvent) => {
    const { labelName, labelColor } = event.payload as { labelName: string; labelColor?: string }
    createActivity(db, event.cardId, event.boardId, 'label_added', { name: labelName, color: labelColor }, event.userId)
  })

  eventBus.on(EventTypes.CARD_LABEL_REMOVED, async (event: TaktEvent) => {
    const { labelName, labelColor } = event.payload as { labelName: string; labelColor?: string }
    createActivity(db, event.cardId, event.boardId, 'label_removed', { name: labelName, color: labelColor }, event.userId)
  })

  // Artifact events
  eventBus.on(EventTypes.ARTIFACT_CREATED, async (event: TaktEvent) => {
    const { name, type, cardId } = event.payload as { name: string; type: string; cardId: string | null }
    createActivity(db, cardId, event.boardId, 'artifact_added', { filename: name, filetype: type }, event.userId)
  })

  eventBus.on(EventTypes.ARTIFACT_UPDATED, async (event: TaktEvent) => {
    const { name, cardId } = event.payload as { name: string; cardId: string | null }
    createActivity(db, cardId, event.boardId, 'artifact_edited', { filename: name }, event.userId)
  })

  eventBus.on(EventTypes.ARTIFACT_DELETED, async (event: TaktEvent) => {
    const { name, type, cardId } = event.payload as { name: string; type: string; cardId: string | null }
    createActivity(db, cardId, event.boardId, 'artifact_deleted', { filename: name, filetype: type }, event.userId)
  })

  eventBus.on(EventTypes.ARTIFACT_EXECUTED, async (event: TaktEvent) => {
    const { name, exitCode, cardId } = event.payload as { name: string; exitCode: number; cardId: string | null }
    createActivity(db, cardId, event.boardId, 'artifact_run', { filename: name, exit_code: exitCode }, event.userId)
  })

  // Comment events don't create activities - they appear in timeline separately
  // Board, column events typically don't create activities in the current system
}