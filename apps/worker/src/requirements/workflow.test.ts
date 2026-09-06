import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  BackgroundTaskLedger,
  CandidateRepository,
  EvaluationRepository,
  openDatabase,
  OpportunityRepository,
  RequirementSetRepository,
  SourceListingRepository,
  type BackgroundTask,
  type DatabaseHandle,
} from '@oca/database';
import { candidateId, opportunityId, snapshotId } from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDecisionHandlers } from '../decision/workflow.js';
import { createEligibilityHandlers } from '../eligibility/workflow.js';
import { createFitHandlers } from '../fit/workflow.js';
import { createQualityHandlers } from '../quality/workflow.js';
import { createRequirementHandlers } from './workflow.js';

function task(snapshot: string, candidate: string): BackgroundTask {
  return {
    id: 'task-requirements',
    taskType: 'requirements.extract',
    payload: { snapshotId: snapshot, candidateId: candidate },
    state: 'RUNNING',
    attempts: 1,
    maxAttempts: 3,
    availableAt: new Date(),
    leaseOwner: 'requirements-test',
    leaseExpiresAt: new Date(Date.now() + 30_000),
    idempotencyKey: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('requirements.extract V2.1 workflow', () => {
  let directory: string;
  let database: DatabaseHandle;
  let ledger: BackgroundTaskLedger;
  const candidate = candidateId('candidate-requirements-workflow');
  const snapshot = snapshotId('snapshot-requirements-workflow');

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-requirements-worker-'));
    database = openDatabase(join(directory, 'worker.sqlite'));
    await applyMigrations(database);
    ledger = new BackgroundTaskLedger(database);
    await new CandidateRepository(database).createCandidate(candidate);

    const sources = new SourceListingRepository(database);
    await sources.persistListing('listing-requirements-workflow', {
      sourceSystem: 'synthetic',
      sourceExternalId: 'synthetic-requirements-workflow',
      sourceUrl: 'https://example.test/jobs/requirements-workflow',
    });
    await sources.persistObservation(
      'observation-requirements-workflow',
      'listing-requirements-workflow',
      {
        rawPayload: '{"description":"TypeScript is required."}',
        fingerprint: 'observation-requirements-workflow',
      },
    );
    const opportunities = new OpportunityRepository(database);
    const opportunity = opportunityId('opportunity-requirements-workflow');
    await opportunities.createOpportunity(opportunity);
    await opportunities.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Synthetic Engineer',
      organization: 'Synthetic Organization',
      content: 'TypeScript is required.',
      fingerprint: 'snapshot-requirements-workflow',
      sourceObservationId: 'observation-requirements-workflow',
    });
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function runEvaluationChain(): Promise<void> {
    const handlers = {
      ...createEligibilityHandlers({ db: database }),
      ...createFitHandlers({ db: database }),
      ...createQualityHandlers({ db: database }),
      ...createDecisionHandlers(database),
    };
    for (let index = 0; index < 4; index += 1) {
      const next = await ledger.claimNext({
        leaseOwner: 'requirements-chain',
        leaseDurationMs: 30_000,
      });
      expect(next).not.toBeNull();
      await handlers[next!.taskType]!(next!);
      await ledger.markSucceeded(next!.id, 'requirements-chain');
    }
  }

  it('generates one set and one evaluation chain for repeated identical processing', async () => {
    const handler = createRequirementHandlers({ db: database })[
      'requirements.extract'
    ]!;
    const work = task(snapshot, candidate);
    await handler(work);
    await handler(work);

    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_sets')
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database
        .sqlite!.prepare(
          "select count(*) count from background_tasks where task_type = 'eligibility.evaluate'",
        )
        .get(),
    ).toEqual({ count: 1 });

    await runEvaluationChain();
    const evaluation = await new EvaluationRepository(
      database,
    ).getCurrentEvaluation(candidate, snapshot);
    expect(evaluation?.requirementSetId).toBeTruthy();
    expect(evaluation?.requirementInputFingerprint).toBeTruthy();
    expect(
      database.sqlite!.prepare('select count(*) count from evaluations').get(),
    ).toEqual({ count: 1 });
    expect(
      database.sqlite!.prepare('select count(*) count from decisions').get(),
    ).toEqual({ count: 1 });
  });

  it('creates a new historical set and evaluation lineage for a new extractor version', async () => {
    await createRequirementHandlers({ db: database })['requirements.extract']!(
      task(snapshot, candidate),
    );
    await runEvaluationChain();
    const firstEvaluation = await new EvaluationRepository(
      database,
    ).getCurrentEvaluation(candidate, snapshot);

    await createRequirementHandlers({
      db: database,
      pipelineVersion: 'requirements-v2.1-v1-compat-next',
      deterministicExtractorVersion: 'eligibility-v1+fit-v1.3-next',
    })['requirements.extract']!(task(snapshot, candidate));
    await runEvaluationChain();

    const currentEvaluation = await new EvaluationRepository(
      database,
    ).getCurrentEvaluation(candidate, snapshot);
    expect(currentEvaluation?.requirementSetId).not.toBe(
      firstEvaluation?.requirementSetId,
    );
    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_sets')
        .get(),
    ).toEqual({ count: 2 });
    expect(
      database.sqlite!.prepare('select count(*) count from evaluations').get(),
    ).toEqual({ count: 2 });
    expect(
      database
        .sqlite!.prepare(
          'select count(*) count from evaluations where superseded_at is not null',
        )
        .get(),
    ).toEqual({ count: 1 });

    const firstSet = await new RequirementSetRepository(database).getById(
      firstEvaluation!.requirementSetId,
    );
    expect(firstSet).not.toBeNull();
  });
});
