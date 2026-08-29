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

import { BackgroundWorker, systemTaskHandlers } from './worker.js';

describe('background worker', () => {
  let directory: string;
  let database: DatabaseHandle;
  let ledger: BackgroundTaskLedger;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'oca-worker-'));
    database = openDatabase(join(directory, 'worker.sqlite'));
    applyMigrations(database);
    ledger = new BackgroundTaskLedger(database);
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('claims and completes the harmless system task', async () => {
    const task = ledger.enqueue({ taskType: 'system.noop' });
    const worker = new BackgroundWorker({
      ledger,
      handlers: systemTaskHandlers,
      logger: pino({ enabled: false }),
      workerId: 'worker-test',
      pollIntervalMs: 10,
      leaseDurationMs: 30_000,
    });

    expect(await worker.runOnce()).toBe(true);
    expect(ledger.findById(task.id)?.state).toBe('SUCCEEDED');
  });

  it('schedules a retry after a handler error', async () => {
    const task = ledger.enqueue({ taskType: 'system.retry', maxAttempts: 2 });
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
    expect(ledger.findById(task.id)).toMatchObject({
      state: 'PENDING',
      attempts: 1,
      lastError: 'temporary failure',
    });
  });
});
