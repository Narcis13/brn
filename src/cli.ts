#!/usr/bin/env bun

import { resolve } from "node:path";
import { getDb, getUserByUsername } from "./src/db";
import { clearSession, loadSession, login, register, saveSession } from "./cli-auth";
import {
  createBoardCommand,
  deleteBoardCommand,
  inviteToBoardCommand,
  kickFromBoardCommand,
  listBoardMembers,
  listBoards,
  showBoard,
  showBoardActivity,
} from "./cli-board";
import {
  createColumn,
  deleteColumn,
  listColumns,
  reorderColumns,
  updateColumn,
} from "./cli-column";
import {
  createCardCommand,
  deleteCardCommand,
  listCards,
  moveCard,
  showCard,
  updateCardCommand,
} from "./cli-card";
import {
  addCommentCommand,
  deleteCommentCommand,
  editCommentCommand,
} from "./cli-comment";
import {
  assignLabelCommand,
  createLabelCommand,
  deleteLabelCommand,
  listLabels,
  unassignLabelCommand,
  updateLabelCommand,
} from "./cli-label";
import { searchCardsCommand } from "./cli-search";
import {
  listArtifacts,
  addArtifact,
  showArtifact,
  editArtifact,
  deleteArtifactCommand,
  exportArtifact,
  runArtifact,
} from "./cli-artifact";
import {
  exitWithError,
  getCommandContext,
  getPositionals,
  getProjectRoot,
  parseGlobalOptions,
  parseInteger,
  printError,
  readOptionValue,
  resolveDbPath,
} from "./cli-utils";

const args = process.argv.slice(2);
const [command, subcommand, ...rest] = args;

const COMMANDS = {
  auth: ["register", "login", "whoami", "logout"],
  board: ["list", "create", "show", "delete", "members", "invite", "kick", "activity"],
  column: ["list", "create", "update", "delete", "reorder"],
  card: ["list", "create", "show", "update", "delete", "move"],
  label: ["list", "create", "update", "delete", "assign", "unassign"],
  comment: ["add", "edit", "delete"],
  artifact: ["list", "add", "show", "edit", "delete", "export", "run"],
  search: [],
  serve: [],
} as const;

function printHelp(): void {
  console.log(`Takt

Usage: takt <command> [subcommand] [options]

Commands:
  auth
    register <username> <password>
    login <username> <password>
    whoami
    logout

  board
    list
    create <title>
    show <id>
    delete <id> [--yes]
    members <id>
    invite <id> <username>
    kick <id> <username>
    activity <id> [--limit <n>]

  column
    list <boardId>
    create <boardId> <title>
    update <id> --title <title>
    delete <id> [--yes]
    reorder <boardId> <id1,id2,...>

  card
    list <boardId> [--column <id>]
    create <boardId> --column <id> --title <title> [--description <text>] [--due <date>] [--start <date>]
    show <id>
    update <id> [--title <text>] [--description <text>] [--due <date>] [--start <date>] [--column <id>] [--position <n>] [--checklist <json>] [--add-check <text>] [--toggle-check <index>] [--remove-check <index>]
    delete <id> [--yes]
    move <id> --column <id> [--position <n>]

  label
    list <boardId>
    create <boardId> --name <name> --color <color>
    update <id> [--name <name>] [--color <color>]
    delete <id>
    assign <cardId> <labelId>
    unassign <cardId> <labelId>

  comment
    add <cardId> <content>
    edit <id> <content>
    delete <id>

  artifact
    list <cardId|boardId> [--board]
    add <cardId|boardId> [--board] [--file <path>] [--filename <name> --content <text>]
    show <id>
    edit <id> [--content <text>]
    delete <id> [--yes]
    export <id> [--output <path>]
    run <id> [--yes] [-- args...]

  search <boardId> <query>
  serve [--port <number>]

Global Options:
  --help, -h
  --version, -v
  --json
  --quiet
  --full-ids
  --yes, -y`);
}

async function printVersion(): Promise<void> {
  const packageJson = await Bun.file(resolve(getProjectRoot(), "package.json")).json();
  console.log(packageJson.version ?? "0.0.0");
}

async function main(): Promise<void> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  if (args[0] === "--version" || args[0] === "-v") {
    await printVersion();
    return;
  }

  if (!command || !Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
    printError(`Unknown command: ${command ?? ""}`);
    console.log("");
    printHelp();
    process.exit(1);
  }

  switch (command) {
    case "auth":
      await handleAuth(subcommand, rest);
      return;
    case "board":
      await handleBoard(subcommand, rest);
      return;
    case "column":
      await handleColumn(subcommand, rest);
      return;
    case "card":
      await handleCard(subcommand, rest);
      return;
    case "label":
      await handleLabel(subcommand, rest);
      return;
    case "comment":
      await handleComment(subcommand, rest);
      return;
    case "artifact":
      await handleArtifact(subcommand, rest);
      return;
    case "search":
      await handleSearch(rest);
      return;
    case "serve":
      await handleServe(rest);
      return;
    default:
      printHelp();
      process.exit(1);
  }
}

async function handleAuth(subcommand: string | undefined, commandArgs: string[]): Promise<void> {
  const options = parseGlobalOptions(commandArgs);
  const positionals = getPositionals(commandArgs);

  switch (subcommand) {
    case "register": {
      const [username, password] = positionals;
      if (!username || !password) {
        exitWithError("Usage: takt auth register <username> <password>");
      }

      const dbPath = resolveDbPath(await loadSession());
      if (!dbPath) {
        exitWithError("No database found. Run this command from the Takt project directory.");
      }

      const db = getDb(dbPath);
      if (getUserByUsername(db, username)) {
        exitWithError("Username already taken");
      }

      const user = await register(db, username, password);
      if (options.json) {
        console.log(JSON.stringify(user, null, 2));
        return;
      }

      console.log(`User '${user.username}' created successfully`);
      return;
    }

    case "login": {
      const [username, password] = positionals;
      if (!username || !password) {
        exitWithError("Usage: takt auth login <username> <password>");
      }

      const dbPath = resolveDbPath(await loadSession());
      if (!dbPath) {
        exitWithError("No database found. Run this command from the Takt project directory.");
      }

      const db = getDb(dbPath);
      const user = await login(db, username, password);
      if (!user) {
        exitWithError("Invalid username or password");
      }

      await saveSession(user.id, user.username, dbPath);
      if (options.json) {
        console.log(JSON.stringify({ userId: user.id, username: user.username, dbPath }, null, 2));
        return;
      }

      console.log(`Logged in as '${user.username}'`);
      return;
    }

    case "whoami": {
      const session = await loadSession();
      if (options.json) {
        console.log(JSON.stringify(session, null, 2));
        return;
      }

      console.log(session ? session.username : "Not logged in");
      return;
    }

    case "logout": {
      await clearSession();
      if (options.json) {
        console.log(JSON.stringify({ ok: true }, null, 2));
        return;
      }

      console.log("Logged out");
      return;
    }

    default:
      exitWithError("Unknown auth subcommand");
  }
}

async function handleBoard(subcommand: string | undefined, commandArgs: string[]): Promise<void> {
  const { db, session } = await getCommandContext();
  const options = parseGlobalOptions(commandArgs);
  const positionals = getPositionals(commandArgs, ["--limit"]);

  switch (subcommand) {
    case "list":
      await listBoards(db, session, options);
      return;
    case "create": {
      const [title] = positionals;
      if (!title) {
        exitWithError("Usage: takt board create <title>");
      }
      await createBoardCommand(db, session, title, options);
      return;
    }
    case "show": {
      const [boardId] = positionals;
      if (!boardId) {
        exitWithError("Usage: takt board show <id>");
      }
      await showBoard(db, session, boardId, options);
      return;
    }
    case "delete": {
      const [boardId] = positionals;
      if (!boardId) {
        exitWithError("Usage: takt board delete <id> [--yes]");
      }
      await deleteBoardCommand(db, session, boardId, options);
      return;
    }
    case "members": {
      const [boardId] = positionals;
      if (!boardId) {
        exitWithError("Usage: takt board members <id>");
      }
      await listBoardMembers(db, session, boardId, options);
      return;
    }
    case "invite": {
      const [boardId, username] = positionals;
      if (!boardId || !username) {
        exitWithError("Usage: takt board invite <id> <username>");
      }
      await inviteToBoardCommand(db, session, boardId, username, options);
      return;
    }
    case "kick": {
      const [boardId, username] = positionals;
      if (!boardId || !username) {
        exitWithError("Usage: takt board kick <id> <username>");
      }
      await kickFromBoardCommand(db, session, boardId, username, options);
      return;
    }
    case "activity": {
      const [boardId] = positionals;
      if (!boardId) {
        exitWithError("Usage: takt board activity <id> [--limit <n>]");
      }

      const limitValue = readOptionValue(commandArgs, "--limit");
      const limit = limitValue ? parseInteger(limitValue, "limit") : 20;
      await showBoardActivity(db, session, boardId, limit, options);
      return;
    }
    default:
      exitWithError("Unknown board subcommand");
  }
}

async function handleColumn(subcommand: string | undefined, commandArgs: string[]): Promise<void> {
  const { db, session } = await getCommandContext();
  const options = parseGlobalOptions(commandArgs);
  const positionals = getPositionals(commandArgs, ["--title"]);

  switch (subcommand) {
    case "list": {
      const [boardId] = positionals;
      if (!boardId) {
        exitWithError("Usage: takt column list <boardId>");
      }
      await listColumns(db, session, boardId, options);
      return;
    }
    case "create": {
      const [boardId, title] = positionals;
      if (!boardId || !title) {
        exitWithError("Usage: takt column create <boardId> <title>");
      }
      await createColumn(db, session, boardId, title, options);
      return;
    }
    case "update": {
      const [columnId] = positionals;
      const title = readOptionValue(commandArgs, "--title");
      if (!columnId || !title) {
        exitWithError("Usage: takt column update <id> --title <title>");
      }
      await updateColumn(db, session, columnId, title, options);
      return;
    }
    case "delete": {
      const [columnId] = positionals;
      if (!columnId) {
        exitWithError("Usage: takt column delete <id> [--yes]");
      }
      await deleteColumn(db, session, columnId, options);
      return;
    }
    case "reorder": {
      const [boardId, order] = positionals;
      if (!boardId || !order) {
        exitWithError("Usage: takt column reorder <boardId> <id1,id2,...>");
      }
      await reorderColumns(
        db,
        session,
        boardId,
        order.split(",").map((value) => value.trim()).filter(Boolean),
        options
      );
      return;
    }
    default:
      exitWithError("Unknown column subcommand");
  }
}

async function handleCard(subcommand: string | undefined, commandArgs: string[]): Promise<void> {
  const { db, session } = await getCommandContext();
  const options = parseGlobalOptions(commandArgs);

  switch (subcommand) {
    case "list": {
      const positionals = getPositionals(commandArgs, ["--column"]);
      const [boardId] = positionals;
      if (!boardId) {
        exitWithError("Usage: takt card list <boardId> [--column <id>]");
      }
      await listCards(db, session, boardId, readOptionValue(commandArgs, "--column"), options);
      return;
    }
    case "create": {
      const positionals = getPositionals(commandArgs, [
        "--column",
        "--title",
        "--description",
        "--due",
        "--start",
      ]);
      const [boardId] = positionals;
      const columnId = readOptionValue(commandArgs, "--column");
      const title = readOptionValue(commandArgs, "--title");
      if (!boardId || !columnId || !title) {
        exitWithError("Usage: takt card create <boardId> --column <id> --title <title> [--description <text>] [--due <date>] [--start <date>]");
      }

      await createCardCommand(
        db,
        session,
        boardId,
        columnId,
        title,
        readOptionValue(commandArgs, "--description"),
        readOptionValue(commandArgs, "--due"),
        readOptionValue(commandArgs, "--start"),
        options
      );
      return;
    }
    case "show": {
      const [cardId] = getPositionals(commandArgs);
      if (!cardId) {
        exitWithError("Usage: takt card show <id>");
      }
      await showCard(db, session, cardId, options);
      return;
    }
    case "update": {
      const positionals = getPositionals(commandArgs, [
        "--title",
        "--description",
        "--due",
        "--start",
        "--column",
        "--position",
        "--checklist",
        "--add-check",
        "--toggle-check",
        "--remove-check",
      ]);
      const [cardId] = positionals;
      if (!cardId) {
        exitWithError("Usage: takt card update <id> [options]");
      }

      const positionValue = readOptionValue(commandArgs, "--position");
      const toggleValue = readOptionValue(commandArgs, "--toggle-check");
      const removeValue = readOptionValue(commandArgs, "--remove-check");

      await updateCardCommand(
        db,
        session,
        cardId,
        {
          title: readOptionValue(commandArgs, "--title"),
          description: readOptionValue(commandArgs, "--description"),
          dueDate: readOptionValue(commandArgs, "--due"),
          startDate: readOptionValue(commandArgs, "--start"),
          columnId: readOptionValue(commandArgs, "--column"),
          position: positionValue ? parseInteger(positionValue, "position") : undefined,
          checklist: readOptionValue(commandArgs, "--checklist"),
          addCheck: readOptionValue(commandArgs, "--add-check"),
          toggleCheck: toggleValue ? parseInteger(toggleValue, "toggle-check") : undefined,
          removeCheck: removeValue ? parseInteger(removeValue, "remove-check") : undefined,
        },
        options
      );
      return;
    }
    case "delete": {
      const [cardId] = getPositionals(commandArgs);
      if (!cardId) {
        exitWithError("Usage: takt card delete <id> [--yes]");
      }
      await deleteCardCommand(db, session, cardId, options);
      return;
    }
    case "move": {
      const positionals = getPositionals(commandArgs, ["--column", "--position"]);
      const [cardId] = positionals;
      const columnId = readOptionValue(commandArgs, "--column");
      const positionValue = readOptionValue(commandArgs, "--position");
      if (!cardId || !columnId) {
        exitWithError("Usage: takt card move <id> --column <id> [--position <n>]");
      }
      await moveCard(
        db,
        session,
        cardId,
        columnId,
        positionValue ? parseInteger(positionValue, "position") : undefined,
        options
      );
      return;
    }
    default:
      exitWithError("Unknown card subcommand");
  }
}

async function handleLabel(subcommand: string | undefined, commandArgs: string[]): Promise<void> {
  const { db, session } = await getCommandContext();
  const options = parseGlobalOptions(commandArgs);

  switch (subcommand) {
    case "list": {
      const [boardId] = getPositionals(commandArgs);
      if (!boardId) {
        exitWithError("Usage: takt label list <boardId>");
      }
      await listLabels(db, session, boardId, options);
      return;
    }
    case "create": {
      const positionals = getPositionals(commandArgs, ["--name", "--color"]);
      const [boardId] = positionals;
      const name = readOptionValue(commandArgs, "--name");
      const color = readOptionValue(commandArgs, "--color");
      if (!boardId || !name || !color) {
        exitWithError("Usage: takt label create <boardId> --name <name> --color <color>");
      }
      await createLabelCommand(db, session, boardId, name, color, options);
      return;
    }
    case "update": {
      const positionals = getPositionals(commandArgs, ["--name", "--color"]);
      const [labelId] = positionals;
      if (!labelId) {
        exitWithError("Usage: takt label update <id> [--name <name>] [--color <color>]");
      }
      await updateLabelCommand(
        db,
        session,
        labelId,
        {
          name: readOptionValue(commandArgs, "--name"),
          color: readOptionValue(commandArgs, "--color"),
        },
        options
      );
      return;
    }
    case "delete": {
      const [labelId] = getPositionals(commandArgs);
      if (!labelId) {
        exitWithError("Usage: takt label delete <id>");
      }
      await deleteLabelCommand(db, session, labelId, options);
      return;
    }
    case "assign": {
      const [cardId, labelId] = getPositionals(commandArgs);
      if (!cardId || !labelId) {
        exitWithError("Usage: takt label assign <cardId> <labelId>");
      }
      await assignLabelCommand(db, session, cardId, labelId, options);
      return;
    }
    case "unassign": {
      const [cardId, labelId] = getPositionals(commandArgs);
      if (!cardId || !labelId) {
        exitWithError("Usage: takt label unassign <cardId> <labelId>");
      }
      await unassignLabelCommand(db, session, cardId, labelId, options);
      return;
    }
    default:
      exitWithError("Unknown label subcommand");
  }
}

async function handleComment(subcommand: string | undefined, commandArgs: string[]): Promise<void> {
  const { db, session } = await getCommandContext();
  const options = parseGlobalOptions(commandArgs);

  switch (subcommand) {
    case "add": {
      const [cardId, ...contentParts] = getPositionals(commandArgs);
      if (!cardId || contentParts.length === 0) {
        exitWithError("Usage: takt comment add <cardId> <content>");
      }
      await addCommentCommand(db, session, cardId, contentParts.join(" "), options);
      return;
    }
    case "edit": {
      const [commentId, ...contentParts] = getPositionals(commandArgs);
      if (!commentId || contentParts.length === 0) {
        exitWithError("Usage: takt comment edit <id> <content>");
      }
      await editCommentCommand(db, session, commentId, contentParts.join(" "), options);
      return;
    }
    case "delete": {
      const [commentId] = getPositionals(commandArgs);
      if (!commentId) {
        exitWithError("Usage: takt comment delete <id>");
      }
      await deleteCommentCommand(db, session, commentId, options);
      return;
    }
    default:
      exitWithError("Unknown comment subcommand");
  }
}

async function handleArtifact(subcommand: string | undefined, commandArgs: string[]): Promise<void> {
  const { db, session } = await getCommandContext();
  const options = parseGlobalOptions(commandArgs);

  switch (subcommand) {
    case "list": {
      const positionals = getPositionals(commandArgs, ["--board"]);
      const [targetId] = positionals;
      if (!targetId) {
        exitWithError("Usage: takt artifact list <cardId|boardId> [--board]");
      }
      const board = commandArgs.includes("--board");
      await listArtifacts(db, session, targetId, { ...options, board });
      return;
    }
    case "add": {
      const positionals = getPositionals(commandArgs, ["--board", "--file", "--filename", "--content"]);
      const [targetId] = positionals;
      if (!targetId) {
        exitWithError("Usage: takt artifact add <cardId|boardId> [--board] [--file <path>] [--filename <name> --content <text>]");
      }
      const board = commandArgs.includes("--board");
      const file = readOptionValue(commandArgs, "--file");
      const filename = readOptionValue(commandArgs, "--filename");
      const content = readOptionValue(commandArgs, "--content");
      
      await addArtifact(db, session, targetId, { ...options, board, file, filename, content });
      return;
    }
    case "show": {
      const [artifactId] = getPositionals(commandArgs);
      if (!artifactId) {
        exitWithError("Usage: takt artifact show <id>");
      }
      await showArtifact(db, session, artifactId, options);
      return;
    }
    case "edit": {
      const positionals = getPositionals(commandArgs, ["--content"]);
      const [artifactId] = positionals;
      if (!artifactId) {
        exitWithError("Usage: takt artifact edit <id> [--content <text>]");
      }
      const content = readOptionValue(commandArgs, "--content");
      await editArtifact(db, session, artifactId, { ...options, content });
      return;
    }
    case "delete": {
      const [artifactId] = getPositionals(commandArgs);
      if (!artifactId) {
        exitWithError("Usage: takt artifact delete <id> [--yes]");
      }
      await deleteArtifactCommand(db, session, artifactId, options);
      return;
    }
    case "export": {
      const positionals = getPositionals(commandArgs, ["--output"]);
      const [artifactId] = positionals;
      if (!artifactId) {
        exitWithError("Usage: takt artifact export <id> [--output <path>]");
      }
      const output = readOptionValue(commandArgs, "--output");
      await exportArtifact(db, session, artifactId, { ...options, output });
      return;
    }
    case "run": {
      // Special handling for run to capture args after --
      const dashDashIndex = commandArgs.indexOf("--");
      let artifactArgs: string[] = [];
      let filteredArgs = commandArgs;
      
      if (dashDashIndex !== -1) {
        artifactArgs = commandArgs.slice(dashDashIndex + 1);
        filteredArgs = commandArgs.slice(0, dashDashIndex);
      }
      
      const [artifactId] = getPositionals(filteredArgs);
      if (!artifactId) {
        exitWithError("Usage: takt artifact run <id> [--yes] [-- args...]");
      }
      
      const runOptions = parseGlobalOptions(filteredArgs);
      await runArtifact(db, session, artifactId, artifactArgs, runOptions);
      return;
    }
    default:
      exitWithError("Unknown artifact subcommand");
  }
}

async function handleSearch(commandArgs: string[]): Promise<void> {
  const { db, session } = await getCommandContext();
  const options = parseGlobalOptions(commandArgs);
  const [boardId, ...queryParts] = getPositionals(commandArgs);

  if (!boardId || queryParts.length === 0) {
    exitWithError("Usage: takt search <boardId> <query>");
  }

  await searchCardsCommand(db, session, boardId, queryParts.join(" "), options);
}

async function handleServe(commandArgs: string[]): Promise<void> {
  const portValue = readOptionValue(commandArgs, "--port");
  let port = 3001;

  if (portValue) {
    port = parseInteger(portValue, "port");
    if (port < 1 || port > 65535) {
      exitWithError("Invalid port number. Must be between 1 and 65535.");
    }
  }

  const buildResult = await Bun.$`cd ${import.meta.dir} && bun run build.ts`.quiet();
  if (buildResult.exitCode !== 0) {
    exitWithError("Build failed");
  }

  const proc = Bun.spawn(["bun", "run", `${import.meta.dir}/src/index.ts`], {
    env: { ...process.env, PORT: String(port) },
    stdout: "inherit",
    stderr: "inherit",
  });

  await proc.exited;
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    printError(error.message);
  } else {
    printError(String(error));
  }
  process.exit(1);
});
