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

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'oca-qual-worker-'));
    database = openDatabase(join(directory, 'qual.sqlite'));
    applyMigrations(database);

    const candidateRepository = new CandidateRepository(database);
    candidateRepository.createCandidate(candidate);
    candidateRepository.addClaim({
      id: claimId('claim-ts'),
      candidateId: candidate,
      kind: 'skill',
      value: 'TypeScript',
      state: 'SUPPORTED',
    });

    const opportunityRepository = new OpportunityRepository(database);
    opportunityRepository.createOpportunity(opportunity);

    const sourceListingRepo = new SourceListingRepository(database);
    sourceListingRepo.persistListing(
      listingId,
      {
        sourceSystem: 'greenhouse',
        sourceExternalId: '123',
        sourceUrl: 'https://boards.greenhouse.io/acme/jobs/123',
      },
      opportunity,
      Date.now() - 5 * DAY_MS,
    );
    sourceListingRepo.persistObservation(
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

    opportunityRepository.appendSnapshot({
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

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function createEvaluation(id: string) {
    const repository = new EvaluationRepository(database);
    repository.persistEvaluation({
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
    const evaluation = createEvaluation('eval-populates-quality');
    const handlers = createQualityHandlers({ db: database });

    await handlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const repository = new EvaluationRepository(database);
    const updated = repository.getEvaluation(evaluation);
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

    const findings = repository.getQualityFindings(evaluation);
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
    const evidenceList = evidenceRepo.getFindingEvidence(
      findingId(freshnessFinding!.id),
    );
    expect(evidenceList.length).toBeGreaterThanOrEqual(1);
    expect(evidenceList[0]?.sourceReference).toContain(
      'snapshot:snapshot-qual',
    );
  });

  it('treats Quality evaluation as write-once against older/stale writes', async () => {
    const evaluation = createEvaluation('eval-stale-protection');
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
    const before = repository.getEvaluation(evaluation);
    expect(before?.qualityLevel).toBe('strong');

    // Attempt stale write with older evaluatedAt
    const rejected = repository.persistQualityResult({
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
    expect(repository.getEvaluation(evaluation)?.qualityLevel).toBe('strong');
  });

  it('behaves idempotently when evaluated multiple times with identical inputs', async () => {
    const evaluation = createEvaluation('eval-idempotent');
    const handlers = createQualityHandlers({ db: database });

    await handlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const repository = new EvaluationRepository(database);
    const findingsBefore = repository.getQualityFindings(evaluation);

    // Second evaluation run
    await handlers['quality.evaluate']!(
      task('quality.evaluate', {
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const findingsAfter = repository.getQualityFindings(evaluation);
    expect(findingsAfter.length).toBe(findingsBefore.length);
  });

  it('schedules next freshness boundary reevaluation and updates freshness upon reevaluation', async () => {
    const evaluation = createEvaluation('eval-freshness-schedule');
    const handlers = createQualityHandlers({ db: database });

    // Initial evaluation at day 5 (recent bucket)
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
    const scheduled = ledger.claimNext({
      leaseOwner: 'test-worker',
      leaseDurationMs: 30_000,
      now: new Date(baseTime.getTime() + 100 * DAY_MS), // check future scheduled task
    });

    expect(scheduled).not.toBeNull();
    expect(scheduled?.taskType).toBe('quality.evaluate');

    // Advance time to 40 days old (stale bucket) and reevaluate
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
    const updatedEval = repository.getEvaluation(evaluation);
    expect(updatedEval?.qualityFreshnessBucket).toBe('stale');

    const findings = repository.getQualityFindings(evaluation);
    const freshnessFinding = findings.find(
      (f) => f.dimensionKey === 'freshness',
    );
    expect(freshnessFinding?.state).toBe('WEAK');
  });

  it('automatically chains through eligibility -> fit -> quality in worker pipeline', async () => {
    const eligibilityHandlers = createEligibilityHandlers({ db: database });
    const fitHandlers = createFitHandlers({ db: database });
    const qualityHandlers = createQualityHandlers({ db: database });

    // Step 1: Run eligibility
    await eligibilityHandlers['eligibility.evaluate']!(
      task('eligibility.evaluate', {
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const ledger = new BackgroundTaskLedger(database);
    const fitTask = ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(fitTask?.taskType).toBe('fit.evaluate');

    // Step 2: Run fit
    await fitHandlers['fit.evaluate']!(fitTask!);
    ledger.markSucceeded(fitTask!.id, 'worker-1');

    const qualityTask = ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(qualityTask?.taskType).toBe('quality.evaluate');

    // Step 3: Run quality
    await qualityHandlers['quality.evaluate']!(qualityTask!);
    ledger.markSucceeded(qualityTask!.id, 'worker-1');

    const repository = new EvaluationRepository(database);
    const evalId = (qualityTask!.payload as { evaluationId: string })
      .evaluationId;
    const finalEval = repository.getEvaluation(evaluationId(evalId));

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
      databasePath: join(directory, 'qual.sqlite'),
      pollIntervalMs: 1000,
      leaseDurationMs: 30000,
      greenhouseBoards: ['stripe'],
    };

    const taskHandlers = createTaskHandlers({ db: database, config });
    const eligibilityHandlers = createEligibilityHandlers({ db: database });
    const fitHandlers = createFitHandlers({ db: database });
    const qualityHandlers = createQualityHandlers({ db: database });

    // Ingest
    await taskHandlers['source.greenhouse.discover']!(
      task('source.greenhouse.discover', { boardId: 'stripe' }),
    );

    const ledger = new BackgroundTaskLedger(database);

    // Eligibility task
    const eligTask = ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(eligTask?.taskType).toBe('eligibility.evaluate');
    await eligibilityHandlers['eligibility.evaluate']!(eligTask!);
    ledger.markSucceeded(eligTask!.id, 'worker-1');

    // Fit task
    const fitTask = ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(fitTask?.taskType).toBe('fit.evaluate');
    await fitHandlers['fit.evaluate']!(fitTask!);
    ledger.markSucceeded(fitTask!.id, 'worker-1');

    // Quality task
    const qualTask = ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(qualTask?.taskType).toBe('quality.evaluate');
    await qualityHandlers['quality.evaluate']!(qualTask!);
    ledger.markSucceeded(qualTask!.id, 'worker-1');

    const evalId = (qualTask!.payload as { evaluationId: string }).evaluationId;
    const evalRepo = new EvaluationRepository(database);
    const evaluation = evalRepo.getEvaluation(evaluationId(evalId));

    expect(evaluation?.qualityLevel).toBe('strong');
    expect(evaluation?.qualityFreshnessBucket).toBe('recent');

    const findings = evalRepo.getQualityFindings(evaluationId(evalId));
    expect(findings.length).toBeGreaterThan(0);

    const sourceConf = findings.find(
      (f) => f.dimensionKey === 'source_confidence',
    );
    expect(sourceConf?.state).toBe('STRONG');
  });
});
