export interface TaktEvent {
  eventType: string
  boardId: string
  cardId: string | null
  userId: string
  timestamp: string
  payload: Record<string, unknown>
}

type EventHandler = (event: TaktEvent) => void | Promise<void>

class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map()

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventType)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          this.handlers.delete(eventType)
        }
      }
    }
  }

  async emit(event: TaktEvent): Promise<void> {
    const exactHandlers = this.handlers.get(event.eventType)
    const wildcardHandlers = this.getWildcardHandlers(event.eventType)

    const allHandlers = new Set<EventHandler>()
    
    if (exactHandlers) {
      exactHandlers.forEach(h => allHandlers.add(h))
    }
    
    wildcardHandlers.forEach(h => allHandlers.add(h))

    // Execute all handlers asynchronously but wait for completion
    await Promise.all(
      Array.from(allHandlers).map(async handler => {
        try {
          await handler(event)
        } catch (error) {
          console.error(`Event handler error for ${event.eventType}:`, error)
        }
      })
    )
  }

  private getWildcardHandlers(eventType: string): Set<EventHandler> {
    const handlers = new Set<EventHandler>()
    const [entity] = eventType.split('.')

    // Check for entity.* wildcard patterns
    const wildcardPattern = `${entity}.*`
    const wildcardHandlers = this.handlers.get(wildcardPattern)
    if (wildcardHandlers) {
      wildcardHandlers.forEach(h => handlers.add(h))
    }

    // Check for global * wildcard
    const globalHandlers = this.handlers.get('*')
    if (globalHandlers) {
      globalHandlers.forEach(h => handlers.add(h))
    }

    return handlers
  }

  clear(): void {
    this.handlers.clear()
  }
}

// Singleton instance
export const eventBus = new EventBus()