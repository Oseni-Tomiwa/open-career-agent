import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  BackgroundTaskLedger,
  openDatabase,
  type DatabaseHandle,
} from '@oca/database';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BackgroundWorker } from './worker.js';
import { createTaskHandlers } from './ingestion/workflow.js';
import { parseWorkerConfig } from '@oca/config/server';

describe('background worker', () => {
  let directory: string;
  let database: DatabaseHandle;
  let ledger: BackgroundTaskLedger;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-worker-'));
    database = openDatabase(join(directory, 'worker.sqlite'));
    await applyMigrations(database);
    ledger = new BackgroundTaskLedger(database);
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('claims and completes the harmless system task', async () => {
    const task = await ledger.enqueue({ taskType: 'system.noop' });
    const worker = new BackgroundWorker({
      ledger,
      handlers: createTaskHandlers({
        db: database,
        config: parseWorkerConfig(process.env),
      }),
      logger: pino({ enabled: false }),
      workerId: 'worker-test',
      pollIntervalMs: 10,
      leaseDurationMs: 30_000,
    });

    expect(await worker.runOnce()).toBe(true);
    const found = await ledger.findById(task.id);
    expect(found?.state).toBe('SUCCEEDED');
  });

  it('schedules a retry after a handler error', async () => {
    const task = await ledger.enqueue({
      taskType: 'system.retry',
      maxAttempts: 2,
    });
    const worker = new BackgroundWorker({
      ledger,
      handlers: {
        'system.retry': () => {
          throw new Error('temporary failure');
        },
      },
      logger: pino({ enabled: false }),
      workerId: 'worker-test',
      pollIntervalMs: 10,
      leaseDurationMs: 30_000,
      random: () => 0.5,
    });

    expect(await worker.runOnce()).toBe(true);
    const found = await ledger.findById(task.id);
    expect(found).toMatchObject({
      state: 'PENDING',
      attempts: 1,
      lastError: 'temporary failure',
    });
  });
});
