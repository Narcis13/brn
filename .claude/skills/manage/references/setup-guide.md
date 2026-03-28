# Takt First-Time Setup

Follow these steps when `takt` is not installed or the user is not authenticated.

## 1. Install

From the BRN project root (`/Users/narcisbrindusescu/newme/brn`):

```bash
cd /Users/narcisbrindusescu/newme/brn && bun install && bun link
```

After `bun link`, the `takt` command is available globally.

If `bun link` fails or isn't desired, run directly:

```bash
bun run src/cli.ts --help
```

## 2. Register (first time only)

```bash
takt auth register <username> <password>
```

Run this from the project directory so Takt resolves the local database at `data/kanban.db`.

## 3. Login

```bash
takt auth login <username> <password>
```

Saves session to `~/.takt/config.json` with `userId`, `username`, and `dbPath`. After login, `takt` works from any directory.

## 4. Verify

```bash
takt auth whoami
```

Should print the logged-in username.

## Troubleshooting

- **"command not found: takt"**: Run `bun link` from the project root, or use `bun run src/cli.ts` instead.
- **Database not found**: Run `takt auth login` from the project directory first to establish the dbPath.
- **"Not logged in"**: Run `takt auth login <username> <password>`.
- **Session file location**: `~/.takt/config.json` — contains userId, username, dbPath.
