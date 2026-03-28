import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { eventBus } from './event-bus'
import { EventTypes } from './event-types'
import Database from 'bun:sqlite'

// Mock the db module
const mockActivities: any[] = []
const mockCreateActivity = mock((db: any, cardId: string | null, boardId: string, action: string, detail: any, userId: string | null) => {
  mockActivities.push({ cardId, boardId, action, detail, userId })
  return { id: 'mock-id', card_id: cardId, board_id: boardId, action, detail: JSON.stringify(detail), timestamp: new Date().toISOString(), user_id: userId }
})

// Mock the entire db module
mock.module('./db', () => ({
  createActivity: mockCreateActivity
}))

// Import after mocking
import { initializeActivitySubscriber } from './activity-subscriber'

describe('ActivitySubscriber', () => {
  let db: Database

  beforeEach(() => {
    eventBus.clear()
    mockActivities.length = 0
    db = new Database(':memory:')
    initializeActivitySubscriber(db)
  })

  test('should create activity on card created event', async () => {
    await eventBus.emit({
      eventType: EventTypes.CARD_CREATED,
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { title: 'New Card', columnId: 'col-123' }
    })

    expect(mockActivities).toHaveLength(1)
    expect(mockActivities[0]).toEqual({
      cardId: 'card-456',
      boardId: 'board-123',
      action: 'created',
      detail: null,
      userId: 'user-789'
    })
  })

  test('should create activity on card moved event', async () => {
    await eventBus.emit({
      eventType: EventTypes.CARD_MOVED,
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { fromColumn: 'Todo', toColumn: 'In Progress' }
    })

    expect(mockActivities).toHaveLength(1)
    expect(mockActivities[0]).toEqual({
      cardId: 'card-456',
      boardId: 'board-123',
      action: 'moved',
      detail: { from: 'Todo', to: 'In Progress' },
      userId: 'user-789'
    })
  })

  test('should create activity on card updated event', async () => {
    await eventBus.emit({
      eventType: EventTypes.CARD_UPDATED,
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { changes: ['title', 'description'] }
    })

    expect(mockActivities).toHaveLength(1)
    expect(mockActivities[0]).toEqual({
      cardId: 'card-456',
      boardId: 'board-123',
      action: 'edited',
      detail: { fields: ['title', 'description'] },
      userId: 'user-789'
    })
  })

  test('should not create activity on card updated with no changes', async () => {
    await eventBus.emit({
      eventType: EventTypes.CARD_UPDATED,
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { changes: [] }
    })

    expect(mockActivities).toHaveLength(0)
  })

  test('should create activity on dates changed event', async () => {
    await eventBus.emit({
      eventType: EventTypes.CARD_DATES_CHANGED,
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: {
        startDate: '2024-01-15',
        dueDate: '2024-01-20',
        oldStartDate: null,
        oldDueDate: '2024-01-18'
      }
    })

    expect(mockActivities).toHaveLength(1)
    expect(mockActivities[0]).toEqual({
      cardId: 'card-456',
      boardId: 'board-123',
      action: 'dates_changed',
      detail: {
        start_date: '2024-01-15',
        due_date: '2024-01-20',
        prev_start_date: null,
        prev_due_date: '2024-01-18'
      },
      userId: 'user-789'
    })
  })

  test('should create activity on label assigned event', async () => {
    await eventBus.emit({
      eventType: EventTypes.CARD_LABEL_ASSIGNED,
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { labelName: 'High Priority', labelColor: '#ff0000' }
    })

    expect(mockActivities).toHaveLength(1)
    expect(mockActivities[0]).toEqual({
      cardId: 'card-456',
      boardId: 'board-123',
      action: 'label_added',
      detail: { name: 'High Priority', color: '#ff0000' },
      userId: 'user-789'
    })
  })

  test('should create activity on label removed event', async () => {
    await eventBus.emit({
      eventType: EventTypes.CARD_LABEL_REMOVED,
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { labelName: 'Bug', labelColor: '#00ff00' }
    })

    expect(mockActivities).toHaveLength(1)
    expect(mockActivities[0]).toEqual({
      cardId: 'card-456',
      boardId: 'board-123',
      action: 'label_removed',
      detail: { name: 'Bug', color: '#00ff00' },
      userId: 'user-789'
    })
  })

  test('should create activity on artifact created event', async () => {
    await eventBus.emit({
      eventType: EventTypes.ARTIFACT_CREATED,
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { name: 'deploy.sh', type: 'sh', cardId: 'card-456' }
    })

    expect(mockActivities).toHaveLength(1)
    expect(mockActivities[0]).toEqual({
      cardId: 'card-456',
      boardId: 'board-123',
      action: 'artifact_added',
      detail: { filename: 'deploy.sh', filetype: 'sh' },
      userId: 'user-789'
    })
  })

  test('should create board-level activity on board artifact created', async () => {
    await eventBus.emit({
      eventType: EventTypes.ARTIFACT_CREATED,
      boardId: 'board-123',
      cardId: null,
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { name: 'global-setup.js', type: 'js', cardId: null }
    })

    expect(mockActivities).toHaveLength(1)
    expect(mockActivities[0]).toEqual({
      cardId: null,
      boardId: 'board-123',
      action: 'artifact_added',
      detail: { filename: 'global-setup.js', filetype: 'js' },
      userId: 'user-789'
    })
  })

  test('should create activity on artifact executed event', async () => {
    await eventBus.emit({
      eventType: EventTypes.ARTIFACT_EXECUTED,
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { name: 'test.sh', exitCode: 0, cardId: 'card-456' }
    })

    expect(mockActivities).toHaveLength(1)
    expect(mockActivities[0]).toEqual({
      cardId: 'card-456',
      boardId: 'board-123',
      action: 'artifact_run',
      detail: { filename: 'test.sh', exit_code: 0 },
      userId: 'user-789'
    })
  })

  test('should not create activity on card deleted event', async () => {
    await eventBus.emit({
      eventType: EventTypes.CARD_DELETED,
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { title: 'Deleted Card' }
    })

    expect(mockActivities).toHaveLength(0)
  })
})