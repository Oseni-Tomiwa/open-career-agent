import { fileURLToPath } from 'node:url';

import { migrate as migrateSqlite } from 'drizzle-orm/node-sqlite/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';

import type { DatabaseHandle } from './client.js';

const defaultSqliteFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

const defaultPostgresFolder = fileURLToPath(
  new URL('../migrations-postgres', import.meta.url),
);

export async function applyMigrations(
  handle: DatabaseHandle,
  migrationsFolder?: string,
): Promise<void> {
  if (handle.engine === 'postgres') {
    const folder = migrationsFolder ?? defaultPostgresFolder;
    await migratePg(handle.db as any, { migrationsFolder: folder });
  } else {
    const folder = migrationsFolder ?? defaultSqliteFolder;
    migrateSqlite(handle.db as any, { migrationsFolder: folder });
  }
}
