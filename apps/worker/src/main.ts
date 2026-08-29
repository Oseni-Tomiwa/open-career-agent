import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseWorkerConfig } from '@oca/config/server';
import {
  applyMigrations,
  BackgroundTaskLedger,
  openDatabase,
} from '@oca/database';
import pino from 'pino';

import { BackgroundWorker, systemTaskHandlers } from './worker.js';

async function main(): Promise<void> {
  const config = parseWorkerConfig(process.env);
  const logger = pino({ name: 'worker', level: 'info' });
  const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const database = openDatabase(resolve(workspaceRoot, config.databasePath));

  try {
    applyMigrations(database);
    const worker = new BackgroundWorker({
      ledger: new BackgroundTaskLedger(database),
      handlers: systemTaskHandlers,
      logger,
      workerId: randomUUID(),
      pollIntervalMs: config.pollIntervalMs,
      leaseDurationMs: config.leaseDurationMs,
    });
    let shuttingDown = false;

    const shutdown = async (signal: NodeJS.Signals) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, 'Shutting down worker');
      await worker.stop();
      database.close();
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    logger.info('Background worker started');
    await worker.start();
  } catch (error) {
    database.close();
    throw error;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'fatal', message: 'Worker startup failed', error: error instanceof Error ? error.message : 'Unknown error' })}\n`,
  );
  process.exitCode = 1;
});
