import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { drizzle, type NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';

export interface DatabaseHandle {
  readonly path: string;
  readonly sqlite: DatabaseSync;
  readonly db: NodeSQLiteDatabase;
  close(): void;
}

export function openDatabase(databasePath: string): DatabaseHandle {
  const resolvedPath =
    databasePath === ':memory:' ? databasePath : resolve(databasePath);

  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }

  const sqlite = new DatabaseSync(resolvedPath);
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA busy_timeout = 5000');

  const db = drizzle({ client: sqlite });
  let closed = false;

  return {
    path: resolvedPath,
    sqlite,
    db,
    close() {
      if (!closed) {
        sqlite.close();
        closed = true;
      }
    },
  };
}

export function databaseIsReady(handle: DatabaseHandle): boolean {
  const result = handle.sqlite.prepare('select 1 as ready').get() as
    { ready: number } | undefined;
  return result?.ready === 1;
}
