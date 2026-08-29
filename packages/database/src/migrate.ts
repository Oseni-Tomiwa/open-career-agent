import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-sqlite/migrator';

import type { DatabaseHandle } from './client.js';

const defaultMigrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

export function applyMigrations(
  handle: DatabaseHandle,
  migrationsFolder = defaultMigrationsFolder,
): void {
  migrate(handle.db, { migrationsFolder });
}
