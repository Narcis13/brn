import { Database } from "bun:sqlite";
import { nanoid } from "nanoid";
import type { Session } from "./cli-auth";

interface Column {
  id: string;
  boardId: string;
  title: string;
  position: number;
  createdAt: string;
}

interface Card {
  id: string;
  columnId: string;
  boardId: string;
  title: string;
}

interface BoardMember {
  userId: string;
  boardId: string;
  role: 'owner' | 'member';
}

export async function listColumns(
  db: Database,
  session: Session,
  boardId: string,
  options: { json?: boolean; quiet?: boolean; fullIds?: boolean }
): Promise<void> {
  const member = db.query(`
    SELECT * FROM board_members 
    WHERE userId = ? AND boardId = ?
  `).get(session.userId, boardId) as BoardMember | null;
  
  if (!member) {
    console.error('You do not have access to this board');
    process.exit(1);
  }
  
  const columns = db.query(`
    SELECT * FROM columns 
    WHERE boardId = ?
    ORDER BY position ASC
  `).all(boardId) as Column[];
  
  if (options.json) {
    console.log(JSON.stringify(columns, null, 2));
    return;
  }
  
  if (columns.length === 0) {
    if (!options.quiet) {
      console.log('No columns found in this board');
    }
    return;
  }
  
  const cardCounts = new Map<string, number>();
  const cardCountResult = db.query(`
    SELECT columnId, COUNT(*) as cardCount
    FROM cards
    WHERE boardId = ?
    GROUP BY columnId
  `).all(boardId) as { columnId: string; cardCount: number }[];
  
  for (const row of cardCountResult) {
    cardCounts.set(row.columnId, row.cardCount);
  }
  
  const idLength = options.fullIds ? 36 : 8;
  console.log(`ID${' '.repeat(idLength - 2)}  Title                           Position  Cards`);
  console.log('-'.repeat(60));
  
  for (const column of columns) {
    const displayId = options.fullIds ? column.id : column.id.slice(0, 8);
    const cardCount = cardCounts.get(column.id) || 0;
    console.log(
      `${displayId.padEnd(idLength)}  ${column.title.padEnd(30)}  ${column.position.toString().padEnd(8)}  ${cardCount}`
    );
  }
}

export async function createColumn(
  db: Database,
  session: Session,
  boardId: string,
  title: string,
  options: { json?: boolean; quiet?: boolean }
): Promise<void> {
  const member = db.query(`
    SELECT * FROM board_members 
    WHERE userId = ? AND boardId = ?
  `).get(session.userId, boardId) as BoardMember | null;
  
  if (!member) {
    console.error('You do not have access to this board');
    process.exit(1);
  }
  
  const maxPosition = db.query(`
    SELECT MAX(position) as maxPos FROM columns WHERE boardId = ?
  `).get(boardId) as { maxPos: number | null } | null;
  
  const newPosition = (maxPosition?.maxPos ?? -1) + 1;
  const columnId = nanoid();
  
  db.query(`
    INSERT INTO columns (id, boardId, title, position, createdAt)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(columnId, boardId, title, newPosition);
  
  if (options.json) {
    const column = db.query(`
      SELECT * FROM columns WHERE id = ?
    `).get(columnId) as Column | null;
    console.log(JSON.stringify(column, null, 2));
  } else if (!options.quiet) {
    console.log(columnId);
  }
}

export async function updateColumn(
  db: Database,
  session: Session,
  columnId: string,
  title: string,
  options: { json?: boolean; quiet?: boolean }
): Promise<void> {
  const column = db.query(`
    SELECT * FROM columns WHERE id = ?
  `).get(columnId) as (Column & { boardId: string }) | null;
  
  if (!column) {
    console.error('Column not found');
    process.exit(1);
  }
  
  const member = db.query(`
    SELECT * FROM board_members 
    WHERE userId = ? AND boardId = ?
  `).get(session.userId, column.boardId) as BoardMember | null;
  
  if (!member) {
    console.error('You do not have access to this board');
    process.exit(1);
  }
  
  db.query(`
    UPDATE columns SET title = ? WHERE id = ?
  `).run(title, columnId);
  
  if (!options.quiet) {
    console.log('Column updated successfully');
  }
}

export async function deleteColumn(
  db: Database,
  session: Session,
  columnId: string,
  options: { json?: boolean; quiet?: boolean; yes?: boolean }
): Promise<void> {
  const column = db.query(`
    SELECT * FROM columns WHERE id = ?
  `).get(columnId) as (Column & { boardId: string }) | null;
  
  if (!column) {
    console.error('Column not found');
    process.exit(1);
  }
  
  const member = db.query(`
    SELECT * FROM board_members 
    WHERE userId = ? AND boardId = ? AND role = 'owner'
  `).get(session.userId, column.boardId) as BoardMember | null;
  
  if (!member) {
    console.error('Only the board owner can delete columns');
    process.exit(1);
  }
  
  const cardCount = (db.query(`
    SELECT COUNT(*) as count FROM cards WHERE columnId = ?
  `).get(columnId) as { count: number } | null)?.count || 0;
  
  if (!options.yes && cardCount > 0) {
    const prompt = `This will delete ${cardCount} card${cardCount !== 1 ? 's' : ''}. Are you sure? (y/N): `;
    process.stdout.write(prompt);
    
    const response = await new Promise<string>((resolve) => {
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim().toLowerCase());
      });
    });
    
    if (response !== 'y') {
      console.log('Cancelled');
      process.exit(0);
    }
  }
  
  db.transaction(() => {
    db.query(`DELETE FROM cards WHERE columnId = ?`).run(columnId);
    db.query(`DELETE FROM columns WHERE id = ?`).run(columnId);
    
    const remainingColumns = db.query(`
      SELECT * FROM columns WHERE boardId = ? ORDER BY position
    `).all(column.boardId) as Column[];
    
    for (let i = 0; i < remainingColumns.length; i++) {
      db.query(`UPDATE columns SET position = ? WHERE id = ?`).run(i, remainingColumns[i]!.id);
    }
  })();
  
  if (!options.quiet) {
    console.log('Column deleted successfully');
  }
}

export async function reorderColumns(
  db: Database,
  session: Session,
  boardId: string,
  columnIds: string[],
  options: { quiet?: boolean }
): Promise<void> {
  const member = db.query(`
    SELECT * FROM board_members 
    WHERE userId = ? AND boardId = ? AND role = 'owner'
  `).get(session.userId, boardId) as BoardMember | null;
  
  if (!member) {
    console.error('Only the board owner can reorder columns');
    process.exit(1);
  }
  
  const existingColumns = db.query(`
    SELECT * FROM columns WHERE boardId = ?
  `).all(boardId) as Column[];
  
  const existingIds = new Set(existingColumns.map(col => col.id));
  const providedIds = new Set(columnIds);
  
  for (const id of columnIds) {
    if (!existingIds.has(id)) {
      console.error(`Column ${id} not found in board`);
      process.exit(1);
    }
  }
  
  if (columnIds.length !== existingColumns.length) {
    console.error('You must provide all column IDs for the board');
    process.exit(1);
  }
  
  db.transaction(() => {
    for (let i = 0; i < columnIds.length; i++) {
      db.query(`UPDATE columns SET position = ? WHERE id = ?`).run(i, columnIds[i] as string);
    }
  })();
  
  if (!options.quiet) {
    console.log('Columns reordered successfully');
  }
}