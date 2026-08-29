import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseApiConfig } from '@oca/config/server';
import { applyMigrations, openDatabase } from '@oca/database';

import { createApiApp } from './app.js';

async function main(): Promise<void> {
  const config = parseApiConfig(process.env);
  const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const database = openDatabase(resolve(workspaceRoot, config.databasePath));

  try {
    applyMigrations(database);
    const app = await createApiApp({ config, database });
    let shuttingDown = false;

    const shutdown = async (signal: NodeJS.Signals) => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info({ signal }, 'Shutting down API');
      await app.close();
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    database.close();
    throw error;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'fatal', message: 'API startup failed', error: error instanceof Error ? error.message : 'Unknown error' })}\n`,
  );
  process.exitCode = 1;
});
