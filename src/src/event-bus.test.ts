import { describe, test, expect, beforeEach } from 'bun:test'
import { eventBus, type TaktEvent } from './event-bus'

describe('EventBus', () => {
  beforeEach(() => {
    eventBus.clear()
  })

  test('should emit and receive exact event type', async () => {
    const events: TaktEvent[] = []
    
    eventBus.on('card.created', (event) => {
      events.push(event)
    })

    const testEvent: TaktEvent = {
      eventType: 'card.created',
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { title: 'Test Card' }
    }

    await eventBus.emit(testEvent)

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual(testEvent)
  })

  test('should support wildcard subscriptions', async () => {
    const cardEvents: TaktEvent[] = []
    const allEvents: TaktEvent[] = []
    
    eventBus.on('card.*', (event) => {
      cardEvents.push(event)
    })
    
    eventBus.on('*', (event) => {
      allEvents.push(event)
    })

    const cardCreated: TaktEvent = {
      eventType: 'card.created',
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { title: 'Card 1' }
    }

    const cardMoved: TaktEvent = {
      eventType: 'card.moved',
      boardId: 'board-123',
      cardId: 'card-457',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { fromColumn: 'todo', toColumn: 'doing' }
    }

    const columnCreated: TaktEvent = {
      eventType: 'column.created',
      boardId: 'board-123',
      cardId: null,
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: { name: 'Done' }
    }

    await eventBus.emit(cardCreated)
    await eventBus.emit(cardMoved)
    await eventBus.emit(columnCreated)

    expect(cardEvents).toHaveLength(2)
    expect(cardEvents[0]?.eventType).toBe('card.created')
    expect(cardEvents[1]?.eventType).toBe('card.moved')
    
    expect(allEvents).toHaveLength(3)
  })

  test('should handle multiple handlers for same event', async () => {
    let count = 0
    
    eventBus.on('card.created', () => {
      count += 1
    })
    
    eventBus.on('card.created', () => {
      count += 10
    })

    await eventBus.emit({
      eventType: 'card.created',
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: {}
    })

    expect(count).toBe(11)
  })

  test('should not receive events for both exact and wildcard handlers', async () => {
    let exactCount = 0
    let wildcardCount = 0
    
    eventBus.on('card.created', () => {
      exactCount++
    })
    
    eventBus.on('card.*', () => {
      wildcardCount++
    })

    await eventBus.emit({
      eventType: 'card.created',
      boardId: 'board-123',
      cardId: 'card-456',
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: {}
    })

    expect(exactCount).toBe(1)
    expect(wildcardCount).toBe(1)
  })

  test('should handle async handlers', async () => {
    const results: number[] = []
    
    eventBus.on('test.event', async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      results.push(1)
    })
    
    eventBus.on('test.event', async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      results.push(2)
    })

    await eventBus.emit({
      eventType: 'test.event',
      boardId: 'board-123',
      cardId: null,
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: {}
    })

    // Both handlers should have completed
    expect(results).toContain(1)
    expect(results).toContain(2)
    expect(results).toHaveLength(2)
  })

  test('should handle handler errors gracefully', async () => {
    const results: string[] = []
    
    eventBus.on('test.event', () => {
      results.push('before-error')
      throw new Error('Handler error')
    })
    
    eventBus.on('test.event', () => {
      results.push('after-error')
    })

    await eventBus.emit({
      eventType: 'test.event',
      boardId: 'board-123',
      cardId: null,
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: {}
    })

    // Both handlers should have been called
    expect(results).toContain('before-error')
    expect(results).toContain('after-error')
  })

  test('unsubscribe should remove handler', async () => {
    let count = 0
    
    const unsubscribe = eventBus.on('test.event', () => {
      count++
    })

    await eventBus.emit({
      eventType: 'test.event',
      boardId: 'board-123',
      cardId: null,
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: {}
    })

    expect(count).toBe(1)

    unsubscribe()

    await eventBus.emit({
      eventType: 'test.event',
      boardId: 'board-123',
      cardId: null,
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: {}
    })

    expect(count).toBe(1) // Should still be 1
  })

  test('clear should remove all handlers', async () => {
    let count = 0
    
    eventBus.on('test.event', () => {
      count++
    })
    
    eventBus.on('another.event', () => {
      count++
    })
    
    eventBus.on('*', () => {
      count++
    })

    eventBus.clear()

    await eventBus.emit({
      eventType: 'test.event',
      boardId: 'board-123',
      cardId: null,
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: {}
    })

    await eventBus.emit({
      eventType: 'another.event',
      boardId: 'board-123',
      cardId: null,
      userId: 'user-789',
      timestamp: new Date().toISOString(),
      payload: {}
    })

    expect(count).toBe(0)
  })
})