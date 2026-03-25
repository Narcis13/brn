import { test, expect } from "bun:test";
import { rmSync } from "node:fs";
import { createTestDb } from "./db.ts";

test("database migration creates all new tables and columns", () => {
  const dbPath = `/tmp/brn-test-${Date.now()}.db`;
  const db = createTestDb(dbPath);

  try {
    // Check labels table exists with correct columns
    const labelsInfo = db.prepare("PRAGMA table_info(labels)").all() as { name: string }[];
    const labelColumns = labelsInfo.map(c => c.name);
    expect(labelColumns).toContain("id");
    expect(labelColumns).toContain("board_id");
    expect(labelColumns).toContain("name");
    expect(labelColumns).toContain("color");
    expect(labelColumns).toContain("position");

    // Check card_labels junction table exists
    const cardLabelsInfo = db.prepare("PRAGMA table_info(card_labels)").all() as { name: string }[];
    const cardLabelColumns = cardLabelsInfo.map(c => c.name);
    expect(cardLabelColumns).toContain("card_id");
    expect(cardLabelColumns).toContain("label_id");

    // Check activity table exists with user_id column
    const activityInfo = db.prepare("PRAGMA table_info(activity)").all() as { name: string }[];
    const activityColumns = activityInfo.map(c => c.name);
    expect(activityColumns).toContain("id");
    expect(activityColumns).toContain("card_id");
    expect(activityColumns).toContain("board_id");
    expect(activityColumns).toContain("action");
    expect(activityColumns).toContain("detail");
    expect(activityColumns).toContain("timestamp");
    expect(activityColumns).toContain("user_id");

    // Check board_members table exists
    const bmInfo = db.prepare("PRAGMA table_info(board_members)").all() as { name: string }[];
    const bmColumns = bmInfo.map(c => c.name);
    expect(bmColumns).toContain("board_id");
    expect(bmColumns).toContain("user_id");
    expect(bmColumns).toContain("role");
    expect(bmColumns).toContain("invited_at");

    // Check comments table exists
    const commentsInfo = db.prepare("PRAGMA table_info(comments)").all() as { name: string }[];
    const commentColumns = commentsInfo.map(c => c.name);
    expect(commentColumns).toContain("id");
    expect(commentColumns).toContain("card_id");
    expect(commentColumns).toContain("user_id");
    expect(commentColumns).toContain("content");

    // Check reactions table exists
    const reactionsInfo = db.prepare("PRAGMA table_info(reactions)").all() as { name: string }[];
    const reactionColumns = reactionsInfo.map(c => c.name);
    expect(reactionColumns).toContain("id");
    expect(reactionColumns).toContain("target_type");
    expect(reactionColumns).toContain("target_id");
    expect(reactionColumns).toContain("emoji");

    // Check card_watchers table exists
    const watchersInfo = db.prepare("PRAGMA table_info(card_watchers)").all() as { name: string }[];
    const watcherColumns = watchersInfo.map(c => c.name);
    expect(watcherColumns).toContain("card_id");
    expect(watcherColumns).toContain("user_id");

    // Check cards table has new columns
    const cardsInfo = db.prepare("PRAGMA table_info(cards)").all() as { name: string }[];
    const cardColumns = cardsInfo.map(c => c.name);
    expect(cardColumns).toContain("due_date");
    expect(cardColumns).toContain("start_date");
    expect(cardColumns).toContain("checklist");
    expect(cardColumns).toContain("updated_at");

    // Test foreign key constraints on labels
    db.exec("INSERT INTO users (id, username, password_hash) VALUES ('u1', 'test', 'hash')");
    db.exec("INSERT INTO boards (id, title, user_id) VALUES ('b1', 'Board 1', 'u1')");
    db.exec("INSERT INTO labels (id, board_id, name, color, position) VALUES ('l1', 'b1', 'Bug', '#ff0000', 0)");
    
    // Verify unique constraint on board_id + name
    expect(() => {
      db.exec("INSERT INTO labels (id, board_id, name, color, position) VALUES ('l2', 'b1', 'Bug', '#0000ff', 1)");
    }).toThrow();

    // Test foreign key constraints on card_labels
    db.exec("INSERT INTO columns (id, title, position, board_id) VALUES ('col1', 'Todo', 0, 'b1')");
    db.exec("INSERT INTO cards (id, title, position, column_id) VALUES ('c1', 'Card 1', 0, 'col1')");
    db.exec("INSERT INTO card_labels (card_id, label_id) VALUES ('c1', 'l1')");

    // Verify primary key constraint on card_labels
    expect(() => {
      db.exec("INSERT INTO card_labels (card_id, label_id) VALUES ('c1', 'l1')");
    }).toThrow();

    // Test cascade delete on labels
    db.exec("DELETE FROM boards WHERE id = 'b1'");
    const labelsAfterDelete = db.query("SELECT * FROM labels").all();
    expect(labelsAfterDelete).toHaveLength(0);

    // Test activity table
    db.exec("INSERT INTO users (id, username, password_hash) VALUES ('u2', 'test2', 'hash')");
    db.exec("INSERT INTO boards (id, title, user_id) VALUES ('b2', 'Board 2', 'u2')");
    db.exec("INSERT INTO columns (id, title, position, board_id) VALUES ('col2', 'Todo', 0, 'b2')");
    db.exec("INSERT INTO cards (id, title, position, column_id, updated_at) VALUES ('c2', 'Card 2', 0, 'col2', datetime('now'))");
    db.exec("INSERT INTO activity (id, card_id, board_id, action, detail) VALUES ('a1', 'c2', 'b2', 'created', null)");
    
    const activity = db.query("SELECT * FROM activity WHERE id = 'a1'").get() as any;
    expect(activity.action).toBe("created");
    expect(activity.card_id).toBe("c2");
    expect(activity.board_id).toBe("b2");

    // Test new card columns
    const card = db.query("SELECT * FROM cards WHERE id = 'c2'").get() as any;
    expect(card.due_date).toBeNull();
    expect(card.start_date).toBeNull();
    expect(card.checklist).toBe("[]");
    expect(card.updated_at).toBeTruthy();

  } finally {
    db.close();
    rmSync(dbPath, { force: true });
  }
});

test("migration is idempotent - can run multiple times safely", () => {
  const dbPath = `/tmp/brn-test-${Date.now()}.db`;
  const db1 = createTestDb(dbPath);
  db1.close();
  
  // Run migration again on same database
  const db2 = createTestDb(dbPath);

  try {
    // Verify tables still exist and work correctly
    const tables = db2.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain("labels");
    expect(tableNames).toContain("card_labels");
    expect(tableNames).toContain("activity");
    expect(tableNames).toContain("cards");
    expect(tableNames).toContain("boards");
    expect(tableNames).toContain("columns");
    expect(tableNames).toContain("users");
    expect(tableNames).toContain("board_members");
    expect(tableNames).toContain("comments");
    expect(tableNames).toContain("reactions");
    expect(tableNames).toContain("card_watchers");

  } finally {
    db2.close();
    rmSync(dbPath, { force: true });
  }
});