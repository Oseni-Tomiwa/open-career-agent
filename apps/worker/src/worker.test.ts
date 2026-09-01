import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  BackgroundTaskLedger,
  CandidateRepository,
  CareerMemoryRepository,
  OpportunityRepository,
  openDatabase,
  type DatabaseHandle,
} from '@oca/database';
import { candidateId, opportunityId, snapshotId } from '@oca/domain';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BackgroundWorker } from './worker.js';
import { createTaskHandlers } from './ingestion/workflow.js';
import { createEligibilityHandlers } from './eligibility/workflow.js';
import { createFitHandlers } from './fit/workflow.js';
import { createQualityHandlers } from './quality/workflow.js';
import { createDecisionHandlers } from './decision/workflow.js';
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

  it('reports a profile reevaluation complete only after the decision chain finishes', async () => {
    const candidate = candidateId('candidate-worker-profile-status');
    await new CandidateRepository(database).createCandidate(candidate);
    const opportunity = opportunityId('opportunity-worker-profile-status');
    const snapshot = snapshotId('snapshot-worker-profile-status');
    const opportunities = new OpportunityRepository(database);
    await opportunities.createOpportunity(opportunity);
    await opportunities.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Synthetic Backend Engineer',
      organization: 'Synthetic Organization',
      content: 'Node.js required.',
      fingerprint: 'worker-profile-status',
    });
    const memory = new CareerMemoryRepository(database);
    const mutation = await memory.createClaimsBatch({
      candidateId: candidate,
      claims: [{ kind: 'skill', value: 'Node.js', state: 'UNKNOWN' }],
    });
    expect(mutation.reevaluation.state).toBe('PENDING');

    const worker = new BackgroundWorker({
      ledger,
      handlers: {
        ...createEligibilityHandlers({ db: database }),
        ...createFitHandlers({ db: database }),
        ...createQualityHandlers({ db: database }),
        ...createDecisionHandlers(database),
      },
      logger: pino({ enabled: false }),
      workerId: 'profile-status-worker',
      pollIntervalMs: 10,
      leaseDurationMs: 30_000,
    });

    expect(await worker.runOnce()).toBe(true);
    expect(
      (await memory.getReevaluation(candidate, mutation.reevaluation.id)).state,
    ).toBe('PENDING');
    for (let index = 0; index < 3; index += 1) {
      expect(await worker.runOnce()).toBe(true);
    }
    expect(
      await memory.getReevaluation(candidate, mutation.reevaluation.id),
    ).toMatchObject({
      state: 'SUCCEEDED',
      taskCount: 1,
      completedTaskCount: 1,
      failedTaskCount: 0,
    });
  });
});
