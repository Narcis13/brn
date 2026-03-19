import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { app, startServer } from "./index.ts";
import type { Server } from "bun";

const TEST_ROOT = "/tmp/superclaude-test-index";
const TEST_DB_PATH = `${TEST_ROOT}/test.db`;

describe("index.ts", () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
    // Set environment variables for testing
    Bun.env.DB_PATH = TEST_DB_PATH;
    Bun.env.PORT = "0"; // Use random available port
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
    // Restore environment variables
    delete Bun.env.DB_PATH;
    delete Bun.env.PORT;
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
    test("handles missing environment variables gracefully", () => {
      delete Bun.env.PORT;
      delete Bun.env.DB_PATH;
      
      // Should not throw when starting server
      expect(async () => {
        const server = startServer();
        // Cleanup - startServer returns void but starts a server
        await new Promise(resolve => setTimeout(resolve, 100));
      }).not.toThrow();
    });

    test("handles invalid PORT value", () => {
      Bun.env.PORT = "invalid";
      
      // Force re-import to test NaN handling
      import(`./index.ts?t=${Date.now()}`).then(module => {
        // Should convert to NaN and then default to 0 or handle gracefully
        expect(module.default.port).toBeDefined();
      });
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
      // Start server and verify database file is created
      await startServer();
      
      // Give it time to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that database file exists
      const dbFile = Bun.file(TEST_DB_PATH);
      expect(await dbFile.exists()).toBe(true);
    });
  });
});