import { describe, it, expect, beforeEach } from "bun:test";
import { SSEManager } from "./sse-manager.ts";

describe("SSEManager", () => {
  let manager: SSEManager;

  beforeEach(() => {
    manager = new SSEManager();
  });

  it("adds and removes connections", () => {
    const controller = createMockController();
    const added = manager.addConnection("board-1", "user-1", controller);
    expect(added).toBe(true);
    expect(manager.getConnectionCount("board-1")).toBe(1);

    manager.removeConnection("board-1", controller);
    expect(manager.getConnectionCount("board-1")).toBe(0);
  });

  it("enforces max connections per board", () => {
    for (let i = 0; i < 10; i++) {
      const controller = createMockController();
      const added = manager.addConnection("board-1", `user-${i}`, controller);
      expect(added).toBe(true);
    }

    // 11th should fail
    const controller = createMockController();
    const added = manager.addConnection("board-1", "user-extra", controller);
    expect(added).toBe(false);
  });

  it("broadcasts to all connections on a board", () => {
    const messages1: string[] = [];
    const messages2: string[] = [];

    const ctrl1 = createMockController((chunk) => {
      messages1.push(new TextDecoder().decode(chunk));
    });
    const ctrl2 = createMockController((chunk) => {
      messages2.push(new TextDecoder().decode(chunk));
    });

    manager.addConnection("board-1", "user-1", ctrl1);
    manager.addConnection("board-1", "user-2", ctrl2);

    manager.broadcast("board-1", "card.moved", { test: true });

    expect(messages1).toHaveLength(1);
    expect(messages2).toHaveLength(1);
    expect(messages1[0]).toContain("event: card.moved");
    expect(messages1[0]).toContain('"test":true');
  });

  it("sends to specific user only", () => {
    const messages1: string[] = [];
    const messages2: string[] = [];

    const ctrl1 = createMockController((chunk) => {
      messages1.push(new TextDecoder().decode(chunk));
    });
    const ctrl2 = createMockController((chunk) => {
      messages2.push(new TextDecoder().decode(chunk));
    });

    manager.addConnection("board-1", "user-1", ctrl1);
    manager.addConnection("board-1", "user-2", ctrl2);

    manager.sendToUser("board-1", "user-1", "notification.created", { id: "n1" });

    expect(messages1).toHaveLength(1);
    expect(messages2).toHaveLength(0);
  });

  it("does not broadcast to other boards", () => {
    const messages: string[] = [];
    const ctrl = createMockController((chunk) => {
      messages.push(new TextDecoder().decode(chunk));
    });

    manager.addConnection("board-1", "user-1", ctrl);

    manager.broadcast("board-2", "card.moved", { test: true });

    expect(messages).toHaveLength(0);
  });

  it("cleans up dead connections on broadcast", () => {
    const deadCtrl = createMockController(() => {
      throw new Error("Connection closed");
    });

    manager.addConnection("board-1", "user-1", deadCtrl);
    expect(manager.getConnectionCount("board-1")).toBe(1);

    manager.broadcast("board-1", "test", {});
    expect(manager.getConnectionCount("board-1")).toBe(0);
  });
});

function createMockController(
  onEnqueue?: (chunk: Uint8Array) => void
): ReadableStreamDefaultController {
  return {
    enqueue(chunk: Uint8Array) {
      if (onEnqueue) onEnqueue(chunk);
    },
    close() {},
    error() {},
    desiredSize: 1,
  } as unknown as ReadableStreamDefaultController;
}
