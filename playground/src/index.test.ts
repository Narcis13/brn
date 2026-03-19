import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { app, startServer } from "./index.ts";

const TEST_ROOT = "/tmp/superclaude-test-index";
const TEST_DB_PATH = `${TEST_ROOT}/test.db`;

describe("index.ts", () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
    // Set environment variables for testing
    Bun.env.DB_PATH = TEST_DB_PATH;
    Bun.env.PORT = "0"; // Use random available port
    // Set test environment to prevent actual server start
    process.env.BUN_TEST = "true";
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
    // Restore environment variables
    delete Bun.env.DB_PATH;
    delete Bun.env.PORT;
    delete process.env.BUN_TEST;
  });

  describe("app", () => {
    test("exports Hono application", () => {
      expect(app).toBeDefined();
      expect(app.fetch).toBeDefined();
    });

    test("has health check endpoint", async () => {
      const response = await app.request("/health");
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ status: "ok" });
    });
  });

  describe("default export", () => {
    test("exports configuration object with port and fetch", async () => {
      const { default: config } = await import("./index.ts");
      
      expect(config).toBeDefined();
      expect(config.port).toBeDefined();
      expect(typeof config.port).toBe("number");
      expect(config.fetch).toBeDefined();
      expect(config.fetch).toBe(app.fetch);
    });

    test("port configuration is a number", async () => {
      const { default: config } = await import("./index.ts");
      
      expect(config.port).toBeDefined();
      expect(typeof config.port).toBe("number");
      expect(config.port).toBeGreaterThanOrEqual(0);
    });
  });

  describe("environment variables", () => {
    test("handles missing environment variables gracefully", async () => {
      delete Bun.env.PORT;
      delete Bun.env.DB_PATH;
      
      // Create data directory for default path
      mkdirSync("./data", { recursive: true });
      
      try {
        // Should not throw when starting server
        await expect(startServer()).resolves.toBeUndefined();
      } finally {
        // Clean up
        rmSync("./data", { recursive: true, force: true });
      }
    });

    test("handles invalid PORT value", async () => {
      Bun.env.PORT = "invalid";
      
      // Should not throw when starting server
      await expect(startServer()).resolves.toBeUndefined();
    });

    test("handles empty PORT value", async () => {
      Bun.env.PORT = "";
      
      await expect(startServer()).resolves.toBeUndefined();
    });

    test("handles negative PORT value", async () => {
      Bun.env.PORT = "-1000";
      
      await expect(startServer()).resolves.toBeUndefined();
    });

    test("handles extremely large PORT value", async () => {
      Bun.env.PORT = "999999";
      
      await expect(startServer()).resolves.toBeUndefined();
    });
  });

  describe("startServer", () => {
    test("function is exported", () => {
      expect(startServer).toBeDefined();
      expect(typeof startServer).toBe("function");
    });

    test("returns a promise", () => {
      const result = startServer();
      expect(result).toBeInstanceOf(Promise);
    });

    test("initializes database and runs migrations", async () => {
      const customPath = `${TEST_ROOT}/custom.db`;
      Bun.env.DB_PATH = customPath;
      
      await startServer();
      
      // Check that database file exists
      const dbFile = Bun.file(customPath);
      expect(await dbFile.exists()).toBe(true);
    });

    test("does not actually start server in test environment", async () => {
      const serveMock = mock(() => {});
      // @ts-expect-error - mocking Bun.serve
      global.Bun.serve = serveMock;
      
      await startServer();
      
      // Should not call Bun.serve in test environment
      expect(serveMock).not.toHaveBeenCalled();
    });
  });
});