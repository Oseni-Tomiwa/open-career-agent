import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  databaseIsReady,
  openDatabase,
  type DatabaseHandle,
} from './client.js';
import { applyMigrations } from './migrate.js';
import {
  BackgroundTaskLedger,
  IdempotencyConflictError,
  TaskLeaseError,
} from './task-ledger.js';

describe('background task ledger', () => {
  let directory: string;
  let database: DatabaseHandle;
  let ledger: BackgroundTaskLedger;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-database-'));
    database = openDatabase(join(directory, 'test.sqlite'));
    await applyMigrations(database);
    ledger = new BackgroundTaskLedger(database);
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('opens a migrated database', async () => {
    expect(await databaseIsReady(database)).toBe(true);
    expect(
      database
        .sqlite!.prepare(
          "select name from sqlite_master where type = 'table' and name = 'background_tasks'",
        )
        .get(),
    ).toBeDefined();
  });

  it('enqueues idempotently and rejects conflicting reuse', async () => {
    const first = await ledger.enqueue({
      taskType: 'system.noop',
      payload: { probe: true },
      idempotencyKey: 'probe-1',
    });
    const repeated = await ledger.enqueue({
      taskType: 'system.noop',
      payload: { probe: true },
      idempotencyKey: 'probe-1',
    });

    expect(repeated.id).toBe(first.id);
    expect(await ledger.eventsFor(first.id)).toHaveLength(1);
    await expect(
      ledger.enqueue({
        taskType: 'system.other',
        idempotencyKey: 'probe-1',
      }),
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it('claims an eligible task once and records success', async () => {
    const task = await ledger.enqueue({ taskType: 'system.noop' });
    const claimed = await ledger.claimNext({
      leaseOwner: 'worker-a',
      leaseDurationMs: 30_000,
    });

    expect(claimed?.id).toBe(task.id);
    expect(claimed?.attempts).toBe(1);
    expect(
      await ledger.claimNext({
        leaseOwner: 'worker-b',
        leaseDurationMs: 30_000,
      }),
    ).toBeNull();

    const succeeded = await ledger.markSucceeded(task.id, 'worker-a');
    expect(succeeded.state).toBe('SUCCEEDED');
    const events = await ledger.eventsFor(task.id);
    expect(events.map((event) => event.toState)).toEqual([
      'PENDING',
      'RUNNING',
      'SUCCEEDED',
    ]);
  });

  it('records terminal failure and protects lease ownership', async () => {
    const task = await ledger.enqueue({ taskType: 'system.noop' });
    await ledger.claimNext({ leaseOwner: 'worker-a', leaseDurationMs: 30_000 });

    await expect(ledger.markSucceeded(task.id, 'worker-b')).rejects.toThrow(
      TaskLeaseError,
    );
    const failed = await ledger.markFailed(
      task.id,
      'worker-a',
      'invalid input',
    );
    expect(failed.state).toBe('FAILED');
  });

  it('schedules retry and fails when attempts are exhausted', async () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const retryAt = new Date('2026-01-01T00:01:00.000Z');
    const task = await ledger.enqueue({
      taskType: 'system.noop',
      maxAttempts: 2,
      availableAt: start,
    });

    await ledger.claimNext({
      leaseOwner: 'worker-a',
      leaseDurationMs: 30_000,
      now: start,
    });
    const pending = await ledger.scheduleRetry(
      task.id,
      'worker-a',
      'temporary',
      retryAt,
      start,
    );
    expect(pending.state).toBe('PENDING');
    expect(
      await ledger.claimNext({
        leaseOwner: 'worker-a',
        leaseDurationMs: 30_000,
        now: start,
      }),
    ).toBeNull();

    await ledger.claimNext({
      leaseOwner: 'worker-a',
      leaseDurationMs: 30_000,
      now: retryAt,
    });
    const failed = await ledger.scheduleRetry(
      task.id,
      'worker-a',
      'still failing',
      new Date(retryAt.getTime() + 60_000),
      retryAt,
    );
    expect(failed.state).toBe('FAILED');
  });

  it('recovers expired leases for another worker', async () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const task = await ledger.enqueue({
      taskType: 'system.noop',
      availableAt: start,
    });
    await ledger.claimNext({
      leaseOwner: 'worker-a',
      leaseDurationMs: 1000,
      now: start,
    });

    await expect(
      ledger.markSucceeded(
        task.id,
        'worker-a',
        new Date(start.getTime() + 1001),
      ),
    ).rejects.toThrow(TaskLeaseError);

    const recovered = await ledger.recoverExpiredLeases(
      new Date(start.getTime() + 1001),
    );
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.state).toBe('PENDING');

    const nextClaimed = await ledger.claimNext({
      leaseOwner: 'worker-b',
      leaseDurationMs: 1000,
      now: new Date(start.getTime() + 1001),
    });
    expect(nextClaimed?.id).toBe(task.id);
  });
});
