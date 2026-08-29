import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseApiConfig } from '@oca/config/server';

import { openDatabase } from '../client.js';
import { applyMigrations } from '../migrate.js';

const config = parseApiConfig(process.env);
const workspaceRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const database = openDatabase(resolve(workspaceRoot, config.databasePath));

try {
  applyMigrations(database);
  process.stdout.write('Database migrations applied successfully.\n');
} finally {
  database.close();
}
