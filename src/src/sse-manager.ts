interface SSEConnection {
  userId: string;
  controller: ReadableStreamDefaultController;
}

export class SSEManager {
  // boardId -> Set of connections
  private connections: Map<string, Set<SSEConnection>> = new Map();
  private static MAX_CONNECTIONS_PER_BOARD = 10;

  addConnection(
    boardId: string,
    userId: string,
    controller: ReadableStreamDefaultController
  ): boolean {
    if (!this.connections.has(boardId)) {
      this.connections.set(boardId, new Set());
    }

    const boardConnections = this.connections.get(boardId)!;

    if (boardConnections.size >= SSEManager.MAX_CONNECTIONS_PER_BOARD) {
      return false;
    }

    boardConnections.add({ userId, controller });
    return true;
  }

  removeConnection(
    boardId: string,
    controller: ReadableStreamDefaultController
  ): void {
    const boardConnections = this.connections.get(boardId);
    if (!boardConnections) return;

    for (const conn of boardConnections) {
      if (conn.controller === controller) {
        boardConnections.delete(conn);
        break;
      }
    }

    if (boardConnections.size === 0) {
      this.connections.delete(boardId);
    }
  }

  broadcast(boardId: string, eventType: string, data: unknown): void {
    const boardConnections = this.connections.get(boardId);
    if (!boardConnections) return;

    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    const deadConnections: SSEConnection[] = [];

    for (const conn of boardConnections) {
      try {
        conn.controller.enqueue(new TextEncoder().encode(message));
      } catch {
        deadConnections.push(conn);
      }
    }

    // Clean up dead connections
    for (const conn of deadConnections) {
      boardConnections.delete(conn);
    }

    if (boardConnections.size === 0) {
      this.connections.delete(boardId);
    }
  }

  sendToUser(
    boardId: string,
    userId: string,
    eventType: string,
    data: unknown
  ): void {
    const boardConnections = this.connections.get(boardId);
    if (!boardConnections) return;

    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    const deadConnections: SSEConnection[] = [];

    for (const conn of boardConnections) {
      if (conn.userId === userId) {
        try {
          conn.controller.enqueue(new TextEncoder().encode(message));
        } catch {
          deadConnections.push(conn);
        }
      }
    }

    for (const conn of deadConnections) {
      boardConnections.delete(conn);
    }
  }

  getConnectionCount(boardId: string): number {
    return this.connections.get(boardId)?.size ?? 0;
  }
}
