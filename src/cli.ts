#!/usr/bin/env bun

import { resolve } from "node:path";
import { getDb, getUserByUsername, createUser } from "./src/db";
import { register, login, saveSession, loadSession, clearSession } from "./cli-auth";
import { 
  listBoards, 
  createBoardCommand, 
  showBoard, 
  deleteBoardCommand,
  listBoardMembers,
  inviteToBoardCommand,
  kickFromBoardCommand,
  showBoardActivity 
} from "./cli-board";

const args = process.argv.slice(2);
const [command, subcommand, ...rest] = args;

const COMMANDS = {
  auth: ['register', 'login', 'whoami', 'logout'],
  board: ['list', 'create', 'show', 'delete', 'members', 'invite', 'kick', 'activity'],
  column: ['list', 'create', 'update', 'delete', 'reorder'],
  card: ['list', 'create', 'show', 'update', 'delete', 'move'],
  label: ['list', 'create', 'update', 'delete', 'assign', 'unassign'],
  comment: ['add', 'edit', 'delete'],
  search: [],
  serve: [],
};

function printHelp(): void {
  console.log(`Takt - A command-line interface for task management

Usage: takt <command> [subcommand] [options]

Commands:
  auth                   Authentication commands
    register <username> <password>  Create a new user account
    login <username> <password>     Login and save session
    whoami                         Show current logged-in user
    logout                         Remove saved session

  board                  Board management commands
    list                           List all boards you're a member of
    create <title>                 Create a new board
    show <id>                      Show board overview
    delete <id>                    Delete a board (owner only)
    members <id>                   List board members
    invite <id> <username>         Invite user to board (owner only)
    kick <id> <username>           Remove member from board (owner only)
    activity <id> [--limit N]      Show recent activity

  column                 Column management commands
    list <boardId>                 List columns in a board
    create <boardId> <title>       Create a new column
    update <id> --title <title>    Update column title
    delete <id>                    Delete column and its cards
    reorder <boardId> <id1,id2>    Reorder columns

  card                   Card management commands
    list <boardId> [--column]      List cards in a board
    create <boardId> --column <id> --title <title> [options]
    show <id>                      Show card details
    update <id> [options]          Update card properties
    delete <id>                    Delete a card
    move <id> --column <id>        Move card to another column

  label                  Label management commands
    list <boardId>                 List board labels
    create <boardId> --name <name> --color <color>
    update <id> [options]          Update label properties
    delete <id>                    Delete a label
    assign <cardId> <labelId>      Assign label to card
    unassign <cardId> <labelId>    Remove label from card

  comment                Comment commands
    add <cardId> <content>         Add a comment to a card
    edit <id> <content>            Edit your comment
    delete <id>                    Delete your comment

  search <boardId> <query>  Search cards in a board

  serve [--port N]         Start the web server (default port: 3001)

Global Options:
  --help, -h             Show this help message
  --version, -v          Show version number
  --json                 Output raw JSON
  --quiet                Suppress non-essential output
  --full-ids             Show full IDs instead of truncated
  --yes, -y              Skip confirmation prompts

Examples:
  takt auth login alice mypassword
  takt board create "My Project"
  takt card create <boardId> --column <columnId> --title "New task"
  takt serve --port 8080`);
}

async function printVersion(): Promise<void> {
  const packageJson = await Bun.file('package.json').json();
  console.log(packageJson.version || '0.0.1');
}

async function main(): Promise<void> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  if (args[0] === '--version' || args[0] === '-v') {
    await printVersion();
    process.exit(0);
  }

  if (!command || !COMMANDS.hasOwnProperty(command)) {
    console.error(`Error: Unknown command '${command}'`);
    console.error('');
    printHelp();
    process.exit(1);
  }

  const isAuthCommand = command === 'auth';
  const requiresAuth = !isAuthCommand && command !== 'serve' && !args[0]?.startsWith('--');
  
  if (requiresAuth) {
    const session = await loadSession();
    if (!session) {
      console.error('Not logged in. Run "takt auth login" first.');
      process.exit(1);
    }
  }
  
  switch (command) {
    case 'auth':
      await handleAuth(subcommand, rest);
      break;
    case 'board':
      await handleBoard(subcommand, rest);
      break;
    case 'serve':
      await handleServe(rest);
      break;
    default:
      console.log(`Command '${command}' is not yet implemented.`);
      process.exit(0);
  }
}

async function handleAuth(subcommand: string | undefined, args: string[]): Promise<void> {
  const dbPath = resolve(import.meta.dir, '../data/kanban.db');
  
  switch (subcommand) {
    case 'register': {
      const [username, password] = args;
      if (!username || !password) {
        console.error('Usage: takt auth register <username> <password>');
        process.exit(1);
      }
      
      const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
      const MIN_PASSWORD_LENGTH = 6;
      
      if (!USERNAME_REGEX.test(username)) {
        console.error('Username must be 3-30 characters, alphanumeric and underscore only');
        process.exit(1);
      }
      
      if (password.length < MIN_PASSWORD_LENGTH) {
        console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        process.exit(1);
      }
      
      const db = getDb(dbPath);
      const existing = getUserByUsername(db, username);
      if (existing) {
        console.error('Username already taken');
        process.exit(1);
      }
      
      const user = await register(db, username, password);
      console.log(`User '${user.username}' created successfully`);
      break;
    }
    
    case 'login': {
      const [username, password] = args;
      if (!username || !password) {
        console.error('Usage: takt auth login <username> <password>');
        process.exit(1);
      }
      
      const db = getDb(dbPath);
      const user = await login(db, username, password);
      if (!user) {
        console.error('Invalid username or password');
        process.exit(1);
      }
      
      await saveSession(user.id, user.username, dbPath);
      console.log(`Logged in as '${user.username}'`);
      break;
    }
    
    case 'whoami': {
      const session = await loadSession();
      if (!session) {
        console.log('Not logged in');
      } else {
        console.log(session.username);
      }
      break;
    }
    
    case 'logout': {
      await clearSession();
      console.log('Logged out');
      break;
    }
    
    default:
      console.error(`Unknown auth subcommand: '${subcommand}'`);
      console.error('');
      console.error('Available auth commands:');
      console.error('  register <username> <password>  Create a new user account');
      console.error('  login <username> <password>     Login and save session');
      console.error('  whoami                         Show current logged-in user');
      console.error('  logout                         Remove saved session');
      process.exit(1);
  }
}

async function handleServe(args: string[]): Promise<void> {
  let port = 3001;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.error('Invalid port number. Must be between 1 and 65535.');
        process.exit(1);
      }
      port = parsed;
      break;
    }
  }
  
  // Build the UI bundle first
  console.log('Building UI bundle...');
  const buildResult = await Bun.$`cd ${import.meta.dir} && bun run build.ts`.quiet();
  if (buildResult.exitCode !== 0) {
    console.error('Build failed');
    process.exit(1);
  }
  
  // Start the server
  const { spawn } = await import('bun');
  const proc = spawn(['bun', 'run', `${import.meta.dir}/src/index.ts`], {
    env: { ...process.env, PORT: port.toString() },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  
  // Wait for the process to exit
  await proc.exited;
}

async function handleBoard(subcommand: string | undefined, args: string[]): Promise<void> {
  const session = await loadSession();
  if (!session) {
    console.error('Not logged in. Run "takt auth login" first.');
    process.exit(1);
  }
  
  const db = getDb(session.dbPath);
  
  // Parse global options
  const options: any = {
    json: args.includes('--json'),
    quiet: args.includes('--quiet'),
    fullIds: args.includes('--full-ids'),
    yes: args.includes('--yes') || args.includes('-y'),
  };
  
  // Remove option flags from args
  const filteredArgs = args.filter(arg => !arg.startsWith('--') && arg !== '-y');
  
  switch (subcommand) {
    case 'list':
      await listBoards(db, session, options);
      break;
      
    case 'create': {
      const [title] = filteredArgs;
      if (!title) {
        console.error('Usage: takt board create <title>');
        process.exit(1);
      }
      await createBoardCommand(db, session, title, options);
      break;
    }
    
    case 'show': {
      const [boardId] = filteredArgs;
      if (!boardId) {
        console.error('Usage: takt board show <id>');
        process.exit(1);
      }
      await showBoard(db, session, boardId, options);
      break;
    }
    
    case 'delete': {
      const [boardId] = filteredArgs;
      if (!boardId) {
        console.error('Usage: takt board delete <id> [--yes]');
        process.exit(1);
      }
      await deleteBoardCommand(db, session, boardId, options);
      break;
    }
    
    case 'members': {
      const [boardId] = filteredArgs;
      if (!boardId) {
        console.error('Usage: takt board members <id>');
        process.exit(1);
      }
      await listBoardMembers(db, session, boardId, options);
      break;
    }
    
    case 'invite': {
      const [boardId, username] = filteredArgs;
      if (!boardId || !username) {
        console.error('Usage: takt board invite <id> <username>');
        process.exit(1);
      }
      await inviteToBoardCommand(db, session, boardId, username, options);
      break;
    }
    
    case 'kick': {
      const [boardId, username] = filteredArgs;
      if (!boardId || !username) {
        console.error('Usage: takt board kick <id> <username>');
        process.exit(1);
      }
      await kickFromBoardCommand(db, session, boardId, username, options);
      break;
    }
    
    case 'activity': {
      const [boardId] = filteredArgs;
      if (!boardId) {
        console.error('Usage: takt board activity <id> [--limit N]');
        process.exit(1);
      }
      
      // Parse limit option
      let limit = 20;
      const limitIndex = args.indexOf('--limit');
      if (limitIndex !== -1 && args[limitIndex + 1]) {
        const parsedLimit = Number(args[limitIndex + 1]);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          limit = parsedLimit;
        }
      }
      
      await showBoardActivity(db, session, boardId, limit, options);
      break;
    }
    
    default:
      console.error(`Unknown board subcommand: '${subcommand}'`);
      console.error('');
      console.error('Available board commands:');
      console.error('  list                      List all boards you\'re a member of');
      console.error('  create <title>            Create a new board');
      console.error('  show <id>                 Show board overview');
      console.error('  delete <id> [--yes]       Delete a board (owner only)');
      console.error('  members <id>              List board members');
      console.error('  invite <id> <username>    Invite user to board (owner only)');
      console.error('  kick <id> <username>      Remove member from board (owner only)');
      console.error('  activity <id> [--limit N] Show recent activity');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});