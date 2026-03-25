#!/usr/bin/env bun

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

  console.log(`Command '${command}' is not yet implemented.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});