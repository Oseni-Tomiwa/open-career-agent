import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseApiConfig } from '@oca/config/server';

import { openDatabase } from '../client.js';
import { applyMigrations } from '../migrate.js';

async function main(): Promise<void> {
  const config = parseApiConfig(process.env);
  const workspaceRoot = fileURLToPath(new URL('../../../..', import.meta.url));
  const database = openDatabase({
    engine: config.databaseEngine,
    databasePath: resolve(workspaceRoot, config.databasePath),
    ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  });

  try {
    await applyMigrations(database);
    process.stdout.write(
      `Database migrations applied successfully (${database.engine}).\n`,
    );
  } finally {
    await database.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Migration CLI failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
