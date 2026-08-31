import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  BackgroundTaskLedger,
  CandidateRepository,
  EvaluationRepository,
  EvidenceRepository,
  openDatabase,
  OpportunityRepository,
  SourceListingRepository,
  type BackgroundTask,
  type DatabaseHandle,
} from '@oca/database';
import {
  candidateId,
  claimId,
  evaluationId,
  findingId,
  opportunityId,
  snapshotId,
} from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQualityHandlers } from './workflow.js';
import { createDecisionHandlers } from '../decision/workflow.js';
import { createFitHandlers } from '../fit/workflow.js';
import { createEligibilityHandlers } from '../eligibility/workflow.js';
import { createTaskHandlers } from '../ingestion/workflow.js';

const DAY_MS = 86_400_000;

function task(
  taskType: string,
  payload: BackgroundTask['payload'],
  availableAt = new Date(),
): BackgroundTask {
  return {
    id: `${taskType}-task`,
    taskType,
    payload,
    state: 'RUNNING',
    attempts: 1,
    maxAttempts: 3,
    availableAt,
    leaseOwner: 'test-worker',
    leaseExpiresAt: new Date(Date.now() + 30_000),
    idempotencyKey: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('quality.evaluate durable workflow', () => {
  let directory: string;
  let database: DatabaseHandle;
  const candidate = candidateId('candidate-qual');
  const opportunity = opportunityId('opportunity-qual');
  const snapshot = snapshotId('snapshot-qual');
  const listingId = 'sl_greenhouse_123';
  const observationId = 'so_greenhouse_123';

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-qual-worker-'));
    database = openDatabase(join(directory, 'qual.sqlite'));
    await applyMigrations(database);

    const candidateRepository = new CandidateRepository(database);
    await candidateRepository.createCandidate(candidate);
    await candidateRepository.addClaim({
      id: claimId('claim-ts'),
      candidateId: candidate,
      kind: 'skill',
      value: 'TypeScript',
      state: 'SUPPORTED',
    });

    const opportunityRepository = new OpportunityRepository(database);
    await opportunityRepository.createOpportunity(opportunity);

    const sourceListingRepo = new SourceListingRepository(database);
    await sourceListingRepo.persistListing(
      listingId,
      {
        sourceSystem: 'greenhouse',
        sourceExternalId: '123',
        sourceUrl: 'https://boards.greenhouse.io/acme/jobs/123',
      },
      opportunity,
      Date.now() - 5 * DAY_MS,
    );
    await sourceListingRepo.persistObservation(
      observationId,
      listingId,
      {
        rawPayload: JSON.stringify({
          id: 123,
          title: 'Senior TypeScript Engineer',
          company_name: 'Acme Corp',
          location: { name: 'Remote — US' },
          work_model: 'remote',
          employment_type: 'full-time',
          compensation: '$130,000 - $160,000',
          updated_at: new Date(Date.now() - 5 * DAY_MS).toISOString(),
          status: 'active',
        }),
        fingerprint: 'obs-fp-qual',
      },
      Date.now() - 5 * DAY_MS,
    );

    await opportunityRepository.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Senior TypeScript Engineer',
      organization: 'Acme Corp',
      location: 'Remote — US',
      workModel: 'remote',
      employmentType: 'full-time',
      compensation: '$130,000 - $160,000',
      content:
        'We are seeking a Senior TypeScript Engineer to design and build scalable cloud services.',
      fingerprint: 'snap-hash-qual',
      sourceObservationId: observationId,
    });
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function createEvaluation(id: string) {
    const repository = new EvaluationRepository(database);
    await repository.persistEvaluation({
      id: evaluationId(id),
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'eligible',
      eligibilityEngineVersion: 'eligibility-v1',
      fitLevel: 'strong',
      fitEngineVersion: 'fit-v1',
      fitSummary: 'Strong TypeScript match',
    });
    return evaluationId(id);
  }

  it('populates Quality without modifying Eligibility or Fit', async () => {
    const evaluation = await createEvaluation('eval-populates-quality');
    const handlers = createQualityHandlers({ db: database });

    await handlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const repository = new EvaluationRepository(database);
    const updated = await repository.getEvaluation(evaluation);
    expect(updated).toMatchObject({
      eligibilityState: 'eligible',
      eligibilityEngineVersion: 'eligibility-v1',
      fitLevel: 'strong',
      fitEngineVersion: 'fit-v1',
      fitSummary: 'Strong TypeScript match',
      qualityLevel: 'strong',
      qualityEngineVersion: 'quality-v1',
      qualityFreshnessBucket: 'recent',
    });

    const findings = await repository.getQualityFindings(evaluation);
    expect(findings.length).toBeGreaterThanOrEqual(10);

    const freshnessFinding = findings.find(
      (f) => f.dimensionKey === 'freshness',
    );
    expect(freshnessFinding?.state).toBe('STRONG');

    const sourceConfidenceFinding = findings.find(
      (f) => f.dimensionKey === 'source_confidence',
    );
    expect(sourceConfidenceFinding?.state).toBe('STRONG');

    const evidenceRepo = new EvidenceRepository(database);
    const evidenceList = await evidenceRepo.getFindingEvidence(
      findingId(freshnessFinding!.id),
    );
    expect(evidenceList.length).toBeGreaterThanOrEqual(1);
    expect(evidenceList[0]?.sourceReference).toContain(
      'snapshot:snapshot-qual',
    );
  });

  it('treats Quality evaluation as write-once against older/stale writes', async () => {
    const evaluation = await createEvaluation('eval-stale-protection');
    const handlers = createQualityHandlers({ db: database });

    const newerTime = new Date('2026-08-30T14:00:00Z');
    const olderTime = new Date('2026-08-30T06:00:00Z');

    await handlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
        evaluatedAt: newerTime.toISOString(),
      }),
    );

    const repository = new EvaluationRepository(database);
    const before = await repository.getEvaluation(evaluation);
    expect(before?.qualityLevel).toBe('strong');

    const rejected = await repository.persistQualityResult({
      evaluationId: evaluation,
      quality: {
        level: 'weak',
        engineVersion: 'quality-v1',
        inputFingerprint: 'older-stale-fp',
        summary: 'Older write',
        evaluatedAt: olderTime,
        freshnessBucket: 'aging',
      },
      findings: [],
    });

    expect(rejected).toBe(false);
    expect((await repository.getEvaluation(evaluation))?.qualityLevel).toBe(
      'strong',
    );
  });

  it('behaves idempotently when evaluated multiple times with identical inputs', async () => {
    const evaluation = await createEvaluation('eval-idempotent');
    const handlers = createQualityHandlers({ db: database });

    await handlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const repository = new EvaluationRepository(database);
    const findingsBefore = await repository.getQualityFindings(evaluation);

    await handlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const findingsAfter = await repository.getQualityFindings(evaluation);
    expect(findingsAfter.length).toBe(findingsBefore.length);
  });

  it('schedules next freshness boundary reevaluation and updates freshness upon reevaluation', async () => {
    const evaluation = await createEvaluation('eval-freshness-schedule');
    const handlers = createQualityHandlers({ db: database });

    const baseTime = new Date('2026-08-30T10:00:00Z');
    await handlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
        evaluatedAt: baseTime.toISOString(),
      }),
    );

    const ledger = new BackgroundTaskLedger(database);
    const firstTask = await ledger.claimNext({
      leaseOwner: 'test-worker',
      leaseDurationMs: 30_000,
      now: new Date(baseTime.getTime() + 100 * DAY_MS),
    });
    expect(firstTask?.taskType).toBe('decision.evaluate');

    const scheduled = await ledger.claimNext({
      leaseOwner: 'test-worker',
      leaseDurationMs: 30_000,
      now: new Date(baseTime.getTime() + 100 * DAY_MS),
    });

    expect(scheduled).not.toBeNull();
    expect(scheduled?.taskType).toBe('quality.evaluate');

    const advancedTime = new Date(baseTime.getTime() + 35 * DAY_MS);
    await handlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
        evaluatedAt: advancedTime.toISOString(),
      }),
    );

    const repository = new EvaluationRepository(database);
    const updatedEval = await repository.getCurrentEvaluation(
      candidate,
      snapshot,
    );
    expect(updatedEval?.qualityFreshnessBucket).toBe('stale');

    expect(
      (await repository.getEvaluation(evaluation))?.qualityFreshnessBucket,
    ).toBe('recent');
    expect(updatedEval?.supersedesEvaluationId).toBe(evaluation);
    const findings = await repository.getQualityFindings(
      evaluationId(updatedEval!.id),
    );
    const freshnessFinding = findings.find(
      (f) => f.dimensionKey === 'freshness',
    );
    expect(freshnessFinding?.state).toBe('WEAK');
  });

  it('propagates a freshness revision through the queued Decision workflow without duplicate current Decisions', async () => {
    const repository = new EvaluationRepository(database);
    const evaluation = evaluationId('eval-freshness-decision');
    await repository.persistEvaluation({
      id: evaluation,
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'eligible',
      eligibilityEngineVersion: 'eligibility-v1',
      eligibilityInputFingerprint: 'elig-freshness-decision',
      fitLevel: 'strong',
      fitEngineVersion: 'fit-v1',
      fitInputFingerprint: 'fit-freshness-decision',
      fitSummary: 'Strong TypeScript match',
    });
    const qualityHandlers = createQualityHandlers({ db: database });
    const decisionHandlers = createDecisionHandlers(database);
    const ledger = new BackgroundTaskLedger(database);
    const baseTime = new Date(Date.now());

    await qualityHandlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
        evaluatedAt: baseTime.toISOString(),
      }),
    );
    const firstDecisionTask = await ledger.claimNext({
      leaseOwner: 'test-worker',
      leaseDurationMs: 30_000,
      now: new Date(Date.now() + 1),
    });
    expect(firstDecisionTask?.taskType).toBe('decision.evaluate');
    await decisionHandlers['decision.evaluate']!(firstDecisionTask!);
    await ledger.markSucceeded(firstDecisionTask!.id, 'test-worker');
    expect(
      (await repository.getLatestDecisionForEvaluation(evaluation))?.priority,
    ).toBe('high-priority');

    const advancedTime = new Date(baseTime.getTime() + 100 * DAY_MS);
    await qualityHandlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
        evaluatedAt: advancedTime.toISOString(),
      }),
    );
    const current = (await repository.getCurrentEvaluation(
      candidate,
      snapshot,
    ))!;
    expect(current.id).not.toBe(evaluation);
    expect(current.supersedesEvaluationId).toBe(evaluation);
    expect(
      (await repository.getEvaluation(evaluation))?.qualityFreshnessBucket,
    ).toBe('recent');

    const secondDecisionTask = await ledger.claimNext({
      leaseOwner: 'test-worker',
      leaseDurationMs: 30_000,
      now: new Date(Date.now() + 1),
    });
    expect(secondDecisionTask?.taskType).toBe('decision.evaluate');
    expect(
      (secondDecisionTask?.payload as { evaluationId?: string }).evaluationId,
    ).toBe(current.id);

    expect(current.qualityLevel).toBe('strong');
    await decisionHandlers['decision.evaluate']!(secondDecisionTask!);
    await ledger.markSucceeded(secondDecisionTask!.id, 'test-worker');
    expect(
      await repository.getCurrentDecision(candidate, snapshot),
    ).toMatchObject({
      evaluationId: current.id,
      priority: 'investigate',
      action: 'investigate',
    });
    expect(
      JSON.parse(
        (await repository.getCurrentDecision(candidate, snapshot))
          ?.reasonCodes ?? '[]',
      ),
    ).toEqual(['LISTING_STALE']);
    expect(
      (await repository.getLatestDecisionForEvaluation(evaluation))?.priority,
    ).toBe('high-priority');

    await qualityHandlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: current.id,
        snapshotId: snapshot,
        candidateId: candidate,
        evaluatedAt: advancedTime.toISOString(),
      }),
    );
    expect(
      (await repository.getCurrentDecision(candidate, snapshot))?.evaluationId,
    ).toBe(current.id);
  });

  it('automatically chains through eligibility -> fit -> quality in worker pipeline', async () => {
    const eligibilityHandlers = createEligibilityHandlers({ db: database });
    const fitHandlers = createFitHandlers({ db: database });
    const qualityHandlers = createQualityHandlers({ db: database });

    await eligibilityHandlers['eligibility.evaluate']!(
      task('eligibility.evaluate', {
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const ledger = new BackgroundTaskLedger(database);
    const fitTask = await ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(fitTask?.taskType).toBe('fit.evaluate');

    await fitHandlers['fit.evaluate']!(fitTask!);
    await ledger.markSucceeded(fitTask!.id, 'worker-1');

    const qualityTask = await ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(qualityTask?.taskType).toBe('quality.evaluate');

    await qualityHandlers['quality.evaluate']!(qualityTask!);
    await ledger.markSucceeded(qualityTask!.id, 'worker-1');

    const repository = new EvaluationRepository(database);
    const evalId = (qualityTask!.payload as { evaluationId: string })
      .evaluationId;
    const finalEval = await repository.getEvaluation(evaluationId(evalId));

    expect(finalEval?.eligibilityState).toBe('investigate');
    expect(finalEval?.fitLevel).toBe('weak');
    expect(finalEval?.qualityLevel).toBe('strong');
  });

  it('evaluates quality for real Greenhouse ingested opportunity payload end-to-end', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const greenhouseJob = {
      id: 99901,
      title: 'Staff Distributed Systems Engineer',
      company_name: 'Stripe',
      location: { name: 'Seattle, WA, US' },
      updated_at: new Date(Date.now() - 3 * DAY_MS).toISOString(),
      absolute_url: 'https://boards.greenhouse.io/stripe/jobs/99901',
      content:
        '<p>We are looking for a Staff Distributed Systems Engineer to build reliable global payments infrastructure. Required: Go, TypeScript, Distributed Systems.</p>',
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ jobs: [greenhouseJob] }),
    } as unknown as Response);

    const config = {
      environment: 'test' as const,
      databaseEngine: 'sqlite' as const,
      databasePath: join(directory, 'qual.sqlite'),
      migrationMode: 'auto' as const,
      pollIntervalMs: 1000,
      leaseDurationMs: 30000,
      greenhouseBoards: ['stripe'],
    };

    const taskHandlers = createTaskHandlers({ db: database, config });
    const eligibilityHandlers = createEligibilityHandlers({ db: database });
    const fitHandlers = createFitHandlers({ db: database });
    const qualityHandlers = createQualityHandlers({ db: database });

    await taskHandlers['source.greenhouse.discover']!(
      task('source.greenhouse.discover', {
        boardId: 'stripe',
        candidateId: candidate,
      }),
    );

    const ledger = new BackgroundTaskLedger(database);

    const eligTask = await ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(eligTask?.taskType).toBe('eligibility.evaluate');
    await eligibilityHandlers['eligibility.evaluate']!(eligTask!);
    await ledger.markSucceeded(eligTask!.id, 'worker-1');

    const fitTask = await ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(fitTask?.taskType).toBe('fit.evaluate');
    await fitHandlers['fit.evaluate']!(fitTask!);
    await ledger.markSucceeded(fitTask!.id, 'worker-1');

    const qualTask = await ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(qualTask?.taskType).toBe('quality.evaluate');
    await qualityHandlers['quality.evaluate']!(qualTask!);
    await ledger.markSucceeded(qualTask!.id, 'worker-1');

    const evalId = (qualTask!.payload as { evaluationId: string }).evaluationId;
    const evalRepo = new EvaluationRepository(database);
    const evaluation = await evalRepo.getEvaluation(evaluationId(evalId));

    expect(evaluation?.qualityLevel).toBe('strong');
    expect(evaluation?.qualityFreshnessBucket).toBe('recent');

    const findings = await evalRepo.getQualityFindings(evaluationId(evalId));
    expect(findings.length).toBeGreaterThan(0);

    const sourceConf = findings.find(
      (f) => f.dimensionKey === 'source_confidence',
    );
    expect(sourceConf?.state).toBe('STRONG');
  });
});
