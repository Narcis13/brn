import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb, createUser, createBoard, createColumn, createCard } from "./src/db";
import { searchCardsCommand } from "./cli-search";
import type { TaktConfig } from "./cli-auth";
import { mkdirSync, rmSync } from "node:fs";

describe("artifact search integration", () => {
  let db: Database;
  let session: TaktConfig;
  let testDir: string;
  let boardId: string;
  let columnId: string;

  beforeEach(() => {
    testDir = `/tmp/brn-test-search-artifact-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
    db = createTestDb(`${testDir}/test.db`);
    
    // Create test user and board using helper functions
    const user = createUser(db, "testuser", "hash");
    const board = createBoard(db, "Test Board", user.id);
    const column = createColumn(db, board.id, "Todo");
    
    boardId = board.id;
    columnId = column.id;
    
    session = {
      username: user.username,
      userId: user.id,
      authHeader: "Bearer test",
    };
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true });
  });

  test("search finds cards by artifact content", async () => {
    // Create a card with an artifact
    const card = createCard(db, "Test Card", columnId, "Card description");
    
    // Add an artifact with searchable content
    db.run(`
      INSERT INTO artifacts (id, board_id, card_id, filename, filetype, content, position, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ["art1", boardId, card.id, "deploy.sh", "sh", "#!/bin/bash\necho 'Deploying application'\ndocker build -t myapp .", 0, session.userId]);
    
    // Mock console.log to capture output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));
    
    try {
      // Search for "docker" which is in the artifact content
      await searchCardsCommand(db, session, boardId, "docker", { json: false, quiet: false, fullIds: false });
      
      // Verify the output includes the card and artifact info
      const output = logs.join("\n");
      expect(output).toContain("Card Matches:");
      expect(output).toContain("Test Card");
      expect(output).toContain("deploy.sh");
      expect(output).toContain("docker build -t myapp");
    } finally {
      console.log = originalLog;
    }
  });

  test("search finds board-level artifacts", async () => {
    // Add a board-level artifact
    db.run(`
      INSERT INTO artifacts (id, board_id, card_id, filename, filetype, content, position, user_id)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
    `, ["art2", boardId, "README.md", "md", "# Project Setup\n\nThis is a guide for setting up the development environment.", 0, session.userId]);
    
    // Mock console.log to capture output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));
    
    try {
      // Search for "development" which is in the board artifact
      await searchCardsCommand(db, session, boardId, "development", { json: false, quiet: false, fullIds: false });
      
      // Verify the output includes the board artifact
      const output = logs.join("\n");
      expect(output).toContain("Board Artifact Matches:");
      expect(output).toContain("README.md");
      expect(output).toContain("development environment");
    } finally {
      console.log = originalLog;
    }
  });

  test("search returns JSON with artifact matches", async () => {
    // Create a card with artifact
    const card = createCard(db, "API Endpoint", columnId, "REST API endpoint");
    
    db.run(`
      INSERT INTO artifacts (id, board_id, card_id, filename, filetype, content, position, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ["art3", boardId, card.id, "api.js", "js", "app.post('/api/users', (req, res) => { /* create user */ });", 0, session.userId]);
    
    // Mock console.log to capture output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));
    
    try {
      // Search in JSON mode
      await searchCardsCommand(db, session, boardId, "users", { json: true, quiet: false, fullIds: false });
      
      // Parse and verify JSON output
      const jsonOutput = JSON.parse(logs.join(""));
      expect(jsonOutput.cards).toHaveLength(1);
      expect(jsonOutput.cards[0].title).toBe("API Endpoint");
      expect(jsonOutput.cards[0].artifact_match).toBeDefined();
      expect(jsonOutput.cards[0].artifact_match.filename).toBe("api.js");
      expect(jsonOutput.cards[0].artifact_match.match_context).toContain("users");
    } finally {
      console.log = originalLog;
    }
  });

  test("search finds artifacts by filename", async () => {
    // Create a card with artifact
    const card = createCard(db, "Config Card", columnId, "Configuration");
    
    db.run(`
      INSERT INTO artifacts (id, board_id, card_id, filename, filetype, content, position, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ["art4", boardId, card.id, "production.config.js", "js", "module.exports = { env: 'production' };", 0, session.userId]);
    
    // Mock console.log to capture output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));
    
    try {
      // Search for "production" which is in the filename
      await searchCardsCommand(db, session, boardId, "production", { json: false, quiet: false, fullIds: false });
      
      // Verify the output
      const output = logs.join("\n");
      expect(output).toContain("Config Card");
      expect(output).toContain("production.config.js");
      // The match will show content since "production" appears in the content
      expect(output).toContain("module.exports = { env: 'production' };");
    } finally {
      console.log = originalLog;
    }
  });
});