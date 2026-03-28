import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import {
  createActivity,
  createArtifact,
  deleteArtifact,
  getArtifact,
  getArtifactByBoardAndFilename,
  getArtifactByCardAndFilename,
  getBoardArtifacts,
  getBoardById,
  getCardArtifacts,
  getCardById,
  isBoardMember,
  updateArtifact,
  type ArtifactRow,
} from "./src/db";
import type { TaktConfig } from "./cli-auth";
import {
  confirmOrExit,
  exitWithError,
  formatDateTime,
  formatId,
  printSuccess,
  printTable,
  type FormatOptions,
} from "./cli-utils";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function deriveFiletypeFromFilename(filename: string): ArtifactRow["filetype"] | null {
  const ext = extname(filename).toLowerCase().slice(1);
  const validTypes: ArtifactRow["filetype"][] = ["md", "html", "js", "ts", "sh"];
  return validTypes.includes(ext as ArtifactRow["filetype"]) ? (ext as ArtifactRow["filetype"]) : null;
}

export async function listArtifacts(
  db: Database,
  session: TaktConfig,
  targetId: string,
  options: FormatOptions & { board?: boolean }
): Promise<void> {
  // First try as card ID unless --board flag is set
  let artifacts: ArtifactRow[] = [];
  let boardId: string;
  let isBoard = false;

  if (!options.board) {
    const card = getCardById(db, targetId);
    if (card) {
      // Get board ID from card's column
      const column = db.query<{ board_id: string }, [string]>(
        "SELECT board_id FROM columns WHERE id = (SELECT column_id FROM cards WHERE id = ?)"
      ).get(targetId);
      
      if (!column) {
        exitWithError("Card's column not found");
      }
      
      boardId = column.board_id;
      
      if (!isBoardMember(db, boardId, session.userId)) {
        exitWithError("You are not a member of this board");
      }
      
      artifacts = getCardArtifacts(db, targetId);
    }
  }

  // If not found as card or --board flag is set, try as board
  if (artifacts.length === 0 && (!options.board || options.board)) {
    const board = getBoardById(db, targetId);
    if (!board) {
      exitWithError(options.board ? "Board not found" : "Card or board not found");
    }
    
    boardId = targetId;
    isBoard = true;
    
    if (!isBoardMember(db, boardId, session.userId)) {
      exitWithError("You are not a member of this board");
    }
    
    artifacts = getBoardArtifacts(db, targetId);
  }

  if (options.json) {
    console.log(JSON.stringify(artifacts));
    return;
  }

  if (artifacts.length === 0) {
    if (!options.quiet) {
      console.log(isBoard ? "No board-level artifacts" : "No artifacts on this card");
    }
    return;
  }

  const rows = artifacts.map((artifact) => ({
    ID: formatId(artifact.id, options),
    Filename: artifact.filename,
    Type: artifact.filetype.toUpperCase(),
    Size: formatFileSize(artifact.content.length),
    Created: formatDateTime(artifact.created_at),
  }));

  printTable(rows, ["ID", "Filename", "Type", "Size", "Created"]);
}

export async function addArtifact(
  db: Database,
  session: TaktConfig,
  targetId: string,
  options: FormatOptions & {
    file?: string;
    filename?: string;
    content?: string;
    board?: boolean;
  }
): Promise<void> {
  // Validate inputs
  if (options.file && (options.filename || options.content)) {
    exitWithError("Cannot use --file with --filename or --content");
  }
  
  if (!options.file && (!options.filename || !options.content)) {
    exitWithError("Must provide either --file or both --filename and --content");
  }

  let filename: string;
  let content: string;
  let filetype: ArtifactRow["filetype"];

  if (options.file) {
    // Read from file
    const file = Bun.file(options.file);
    if (!(await file.exists())) {
      exitWithError(`File not found: ${options.file}`);
    }
    
    content = await file.text();
    filename = options.file.split("/").pop()!;
    
    const derivedType = deriveFiletypeFromFilename(filename);
    if (!derivedType) {
      exitWithError(`Unsupported file type. Must be one of: md, html, js, ts, sh`);
    }
    filetype = derivedType;
  } else {
    // Use inline content
    filename = options.filename!;
    content = options.content!;
    
    const derivedType = deriveFiletypeFromFilename(filename);
    if (!derivedType) {
      exitWithError(`Filename must have a supported extension: .md, .html, .js, .ts, .sh`);
    }
    filetype = derivedType;
  }

  // Validate content
  if (content.length === 0) {
    exitWithError("Artifact content cannot be empty");
  }
  
  if (content.length > 100 * 1024) {
    exitWithError(`Content exceeds 100KB limit (got ${Math.round(content.length / 1024)}KB)`);
  }

  // Determine if target is card or board
  let boardId: string;
  let cardId: string | null = null;
  
  if (!options.board) {
    const card = getCardById(db, targetId);
    if (card) {
      cardId = targetId;
      // Get board ID from card's column
      const column = db.query<{ board_id: string }, [string]>(
        "SELECT board_id FROM columns WHERE id = (SELECT column_id FROM cards WHERE id = ?)"
      ).get(targetId);
      
      if (!column) {
        exitWithError("Card's column not found");
      }
      
      boardId = column.board_id;
    } else {
      // Not a card, must be a board
      const board = getBoardById(db, targetId);
      if (!board) {
        exitWithError("Card or board not found");
      }
      boardId = targetId;
    }
  } else {
    // Force board interpretation
    const board = getBoardById(db, targetId);
    if (!board) {
      exitWithError("Board not found");
    }
    boardId = targetId;
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  // Check for duplicate filename
  if (cardId) {
    const existing = getArtifactByCardAndFilename(db, cardId, filename);
    if (existing) {
      exitWithError(`Artifact '${filename}' already exists on this card`);
    }
  } else {
    const existing = getArtifactByBoardAndFilename(db, boardId, filename);
    if (existing) {
      exitWithError(`Artifact '${filename}' already exists on this board`);
    }
  }

  // Create artifact
  const artifact = createArtifact(db, boardId, cardId, filename, filetype, content, session.userId);

  // Create activity entry
  createActivity(
    db,
    cardId || boardId,
    boardId,
    "artifact_added",
    JSON.stringify({ filename, filetype }),
    session.userId
  );

  if (options.json) {
    console.log(JSON.stringify(artifact));
  } else if (!options.quiet) {
    printSuccess(`Artifact created: ${formatId(artifact.id, options)} - ${filename}`);
  }
}

export async function showArtifact(
  db: Database,
  session: TaktConfig,
  artifactId: string,
  options: FormatOptions
): Promise<void> {
  const artifact = getArtifact(db, artifactId);
  if (!artifact) {
    exitWithError("Artifact not found");
  }

  if (!isBoardMember(db, artifact.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  if (options.json) {
    console.log(JSON.stringify(artifact));
    return;
  }

  // Display metadata header
  console.log(`Filename: ${artifact.filename}`);
  console.log(`Type: ${artifact.filetype.toUpperCase()}`);
  console.log(`Size: ${formatFileSize(artifact.content.length)}`);
  console.log(`Created: ${formatDateTime(artifact.created_at)}`);
  if (artifact.user_id) {
    const user = db.query<{ username: string }, [string]>(
      "SELECT username FROM users WHERE id = ?"
    ).get(artifact.user_id);
    if (user) {
      console.log(`Creator: ${user.username}`);
    }
  }
  console.log("");

  // Display content based on type
  if (artifact.filetype === "md") {
    // Basic markdown rendering for terminal
    const lines = artifact.content.split("\n");
    lines.forEach((line) => {
      // Headers
      if (line.startsWith("# ")) {
        console.log(`\x1b[1m${line}\x1b[0m`); // Bold
      } else if (line.startsWith("## ")) {
        console.log(`\x1b[1m${line}\x1b[0m`); // Bold
      } else if (line.startsWith("### ")) {
        console.log(`\x1b[1m${line}\x1b[0m`); // Bold
      } else if (line.trim().startsWith("```")) {
        console.log(line); // Code blocks as-is
      } else {
        console.log(line);
      }
    });
  } else if (["js", "ts", "sh"].includes(artifact.filetype)) {
    // Code files with line numbers
    const lines = artifact.content.split("\n");
    const lineNumWidth = lines.length.toString().length;
    lines.forEach((line, idx) => {
      const lineNum = (idx + 1).toString().padStart(lineNumWidth, " ");
      console.log(`${lineNum} | ${line}`);
    });
  } else {
    // HTML and others: raw display
    console.log(artifact.content);
  }
}

export async function editArtifact(
  db: Database,
  session: TaktConfig,
  artifactId: string,
  options: FormatOptions & { content?: string }
): Promise<void> {
  const artifact = getArtifact(db, artifactId);
  if (!artifact) {
    exitWithError("Artifact not found");
  }

  if (!isBoardMember(db, artifact.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  let newContent: string;

  if (options.content !== undefined) {
    // Inline edit
    newContent = options.content;
  } else {
    // Editor-based edit
    const editor = process.env.EDITOR || "vi";
    const tempDir = "/tmp";
    const tempFile = join(tempDir, `takt-artifact-${artifactId}.${artifact.filetype}`);
    
    // Write current content to temp file
    await Bun.write(tempFile, artifact.content);
    
    // Open editor
    const proc = Bun.spawn([editor, tempFile], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    
    await proc.exited;
    
    if (proc.exitCode !== 0) {
      exitWithError("Editor exited with non-zero status");
    }
    
    // Read back edited content
    const editedFile = Bun.file(tempFile);
    newContent = await editedFile.text();
    
    // Clean up temp file
    try {
      await Bun.$`rm ${tempFile}`;
    } catch {
      // Ignore cleanup errors
    }
  }

  // Validate new content
  if (newContent.length === 0) {
    exitWithError("Artifact content cannot be empty");
  }
  
  if (newContent.length > 100 * 1024) {
    exitWithError(`Content exceeds 100KB limit (got ${Math.round(newContent.length / 1024)}KB)`);
  }

  // Check if content changed
  if (newContent === artifact.content) {
    if (!options.quiet) {
      console.log("No changes made");
    }
    return;
  }

  // Update artifact
  const updated = updateArtifact(db, artifactId, { content: newContent });
  if (!updated) {
    exitWithError("Failed to update artifact");
  }

  // Create activity entry
  createActivity(
    db,
    artifact.card_id || artifact.board_id,
    artifact.board_id,
    "artifact_edited",
    JSON.stringify({ filename: artifact.filename }),
    session.userId
  );

  if (options.json) {
    console.log(JSON.stringify(updated));
  } else if (!options.quiet) {
    printSuccess(`Artifact updated: ${artifact.filename}`);
  }
}

export async function deleteArtifactCommand(
  db: Database,
  session: TaktConfig,
  artifactId: string,
  options: FormatOptions & { yes?: boolean }
): Promise<void> {
  const artifact = getArtifact(db, artifactId);
  if (!artifact) {
    exitWithError("Artifact not found");
  }

  if (!isBoardMember(db, artifact.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  if (!options.yes) {
    await confirmOrExit(`Delete artifact '${artifact.filename}'?`);
  }

  // Create activity entry before deletion
  createActivity(
    db,
    artifact.card_id || artifact.board_id,
    artifact.board_id,
    "artifact_deleted",
    JSON.stringify({ filename: artifact.filename, filetype: artifact.filetype }),
    session.userId
  );

  // Delete artifact
  deleteArtifact(db, artifactId);

  if (!options.quiet) {
    printSuccess(`Artifact deleted: ${artifact.filename}`);
  }
}

export async function exportArtifact(
  db: Database,
  session: TaktConfig,
  artifactId: string,
  options: FormatOptions & { output?: string }
): Promise<void> {
  const artifact = getArtifact(db, artifactId);
  if (!artifact) {
    exitWithError("Artifact not found");
  }

  if (!isBoardMember(db, artifact.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  const outputPath = options.output || `./${artifact.filename}`;
  
  // Check if file exists
  if (existsSync(outputPath)) {
    exitWithError(`File already exists: ${outputPath}. Delete it first or use --output with a different path`);
  }

  // Create parent directories if needed
  const dir = dirname(outputPath);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }

  // Write file
  await Bun.write(outputPath, artifact.content);

  if (!options.quiet) {
    console.log(outputPath);
  }
}

export async function runArtifact(
  db: Database,
  session: TaktConfig,
  artifactId: string,
  args: string[],
  options: FormatOptions & { yes?: boolean }
): Promise<void> {
  const artifact = getArtifact(db, artifactId);
  if (!artifact) {
    exitWithError("Artifact not found");
  }

  if (!isBoardMember(db, artifact.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  // Check filetype
  if (!["sh", "js", "ts"].includes(artifact.filetype)) {
    exitWithError(`Cannot run artifact of type '${artifact.filetype}'. Only sh, js, and ts artifacts can be executed`);
  }

  // Confirm execution
  if (!options.yes) {
    console.log(`Filename: ${artifact.filename}`);
    console.log(`Type: ${artifact.filetype.toUpperCase()}`);
    console.log(`Size: ${formatFileSize(artifact.content.length)}`);
    console.log("\nFirst 5 lines:");
    const lines = artifact.content.split("\n").slice(0, 5);
    lines.forEach((line) => console.log(`  ${line}`));
    if (artifact.content.split("\n").length > 5) {
      console.log("  ...");
    }
    console.log("");
    
    await confirmOrExit("Run this artifact?");
  }

  // Create temp file
  const tempFile = `/tmp/takt-artifact-run-${artifactId}.${artifact.filetype}`;
  await Bun.write(tempFile, artifact.content);

  let exitCode = 0;
  
  try {
    if (artifact.filetype === "sh") {
      // Make executable
      await Bun.$`chmod +x ${tempFile}`;
      
      // Execute shell script
      const proc = Bun.spawn([tempFile, ...args], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      
      await proc.exited;
      exitCode = proc.exitCode || 0;
    } else {
      // Execute JS/TS with bun
      const proc = Bun.spawn(["bun", "run", tempFile, ...args], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      
      await proc.exited;
      exitCode = proc.exitCode || 0;
    }
  } finally {
    // Clean up temp file
    try {
      await Bun.$`rm ${tempFile}`;
    } catch {
      // Ignore cleanup errors
    }
  }

  // Create activity entry
  createActivity(
    db,
    artifact.card_id || artifact.board_id,
    artifact.board_id,
    "artifact_run",
    JSON.stringify({ filename: artifact.filename, exit_code: exitCode }),
    session.userId
  );

  if (exitCode !== 0 && !options.quiet) {
    console.log(`\nExit code: ${exitCode}`);
  }
}