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

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'oca-database-'));
    database = openDatabase(join(directory, 'test.sqlite'));
    applyMigrations(database);
    ledger = new BackgroundTaskLedger(database);
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('opens a migrated database', () => {
    expect(databaseIsReady(database)).toBe(true);
    expect(
      database.sqlite
        .prepare(
          "select name from sqlite_master where type = 'table' and name = 'background_tasks'",
        )
        .get(),
    ).toBeDefined();
  });

  it('enqueues idempotently and rejects conflicting reuse', () => {
    const first = ledger.enqueue({
      taskType: 'system.noop',
      payload: { probe: true },
      idempotencyKey: 'probe-1',
    });
    const repeated = ledger.enqueue({
      taskType: 'system.noop',
      payload: { probe: true },
      idempotencyKey: 'probe-1',
    });

    expect(repeated.id).toBe(first.id);
    expect(ledger.eventsFor(first.id)).toHaveLength(1);
    expect(() =>
      ledger.enqueue({
        taskType: 'system.other',
        idempotencyKey: 'probe-1',
      }),
    ).toThrow(IdempotencyConflictError);
  });

  it('claims an eligible task once and records success', () => {
    const task = ledger.enqueue({ taskType: 'system.noop' });
    const claimed = ledger.claimNext({
      leaseOwner: 'worker-a',
      leaseDurationMs: 30_000,
    });

    expect(claimed?.id).toBe(task.id);
    expect(claimed?.attempts).toBe(1);
    expect(
      ledger.claimNext({ leaseOwner: 'worker-b', leaseDurationMs: 30_000 }),
    ).toBeNull();

    const succeeded = ledger.markSucceeded(task.id, 'worker-a');
    expect(succeeded.state).toBe('SUCCEEDED');
    expect(ledger.eventsFor(task.id).map((event) => event.toState)).toEqual([
      'PENDING',
      'RUNNING',
      'SUCCEEDED',
    ]);
  });

  it('records terminal failure and protects lease ownership', () => {
    const task = ledger.enqueue({ taskType: 'system.noop' });
    ledger.claimNext({ leaseOwner: 'worker-a', leaseDurationMs: 30_000 });

    expect(() => ledger.markSucceeded(task.id, 'worker-b')).toThrow(
      TaskLeaseError,
    );
    expect(ledger.markFailed(task.id, 'worker-a', 'invalid input').state).toBe(
      'FAILED',
    );
  });

  it('schedules retry and fails when attempts are exhausted', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const retryAt = new Date('2026-01-01T00:01:00.000Z');
    const task = ledger.enqueue({
      taskType: 'system.noop',
      maxAttempts: 2,
      availableAt: start,
    });

    ledger.claimNext({
      leaseOwner: 'worker-a',
      leaseDurationMs: 30_000,
      now: start,
    });
    const pending = ledger.scheduleRetry(
      task.id,
      'worker-a',
      'temporary',
      retryAt,
      start,
    );
    expect(pending.state).toBe('PENDING');
    expect(
      ledger.claimNext({
        leaseOwner: 'worker-a',
        leaseDurationMs: 30_000,
        now: start,
      }),
    ).toBeNull();

    ledger.claimNext({
      leaseOwner: 'worker-a',
      leaseDurationMs: 30_000,
      now: retryAt,
    });
    const failed = ledger.scheduleRetry(
      task.id,
      'worker-a',
      'still failing',
      new Date(retryAt.getTime() + 60_000),
      retryAt,
    );
    expect(failed.state).toBe('FAILED');
  });

  it('recovers expired leases for another worker', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const task = ledger.enqueue({
      taskType: 'system.noop',
      availableAt: start,
    });
    ledger.claimNext({
      leaseOwner: 'worker-a',
      leaseDurationMs: 1000,
      now: start,
    });

    expect(() =>
      ledger.markSucceeded(
        task.id,
        'worker-a',
        new Date(start.getTime() + 1001),
      ),
    ).toThrow(TaskLeaseError);

    const recovered = ledger.recoverExpiredLeases(
      new Date(start.getTime() + 1001),
    );
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.state).toBe('PENDING');
    expect(
      ledger.claimNext({
        leaseOwner: 'worker-b',
        leaseDurationMs: 1000,
        now: new Date(start.getTime() + 1001),
      })?.id,
    ).toBe(task.id);
  });
});
