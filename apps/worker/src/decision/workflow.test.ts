import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  BackgroundTaskLedger,
  CandidateRepository,
  CareerMemoryRepository,
  ApplicationRepository,
  EvaluationRepository,
  openDatabase,
  OpportunityRepository,
  SourceListingRepository,
  SearchTargetRepository,
  TodayRepository,
  evaluationFindings,
  type DatabaseHandle,
} from '@oca/database';
import {
  candidateId,
  decisionId,
  applicationId,
  claimId,
  evaluationId,
  findingId,
  eventId,
  searchTargetId,
  discoveryRunId,
  discoveryMatchId,
  opportunityId,
  snapshotId,
} from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDecisionHandlers } from './workflow.js';
import { createQualityHandlers } from '../quality/workflow.js';
import { createFitHandlers } from '../fit/workflow.js';
import { createEligibilityHandlers } from '../eligibility/workflow.js';

const DAY_MS = 86_400_000;

describe('decision.evaluate durable workflow', () => {
  let directory: string;
  let database: DatabaseHandle;
  let ledger: BackgroundTaskLedger;
  let repository: EvaluationRepository;
  const candidate = candidateId('cand-dec-1');
  const opportunity = opportunityId('opp-dec-1');
  const snapshot = snapshotId('snap-dec-1');
  const listingId = 'listing-dec-1';
  const observationId = 'obs-dec-1';
  const evalId = 'eval-dec-1';

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'oca-decision-workflow-'));
    database = openDatabase(join(directory, 'worker.sqlite'));
    applyMigrations(database);
    ledger = new BackgroundTaskLedger(database);
    repository = new EvaluationRepository(database);

    const candidateRepository = new CandidateRepository(database);
    candidateRepository.createCandidate(candidate);
    candidateRepository.addClaim({
      id: claimId('claim-skill-ts'),
      candidateId: candidate,
      kind: 'skill',
      value: 'TypeScript',
      state: 'SUPPORTED',
    });
    candidateRepository.addClaim({
      id: claimId('claim-loc-us'),
      candidateId: candidate,
      kind: 'location',
      value: 'US',
      state: 'SUPPORTED',
    });
    candidateRepository.addClaim({
      id: claimId('claim-auth-us'),
      candidateId: candidate,
      kind: 'work_auth',
      value: 'US',
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
          employmentType: 'full-time',
          compensation: '$130,000 - $160,000',
          updated_at: new Date(Date.now() - 5 * DAY_MS).toISOString(),
          status: 'active',
        }),
        fingerprint: 'obs-fp-dec',
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
        'We are seeking a Senior TypeScript Engineer. Requirements: TypeScript, Node.js. Location: Remote — US.',
      fingerprint: 'snap-hash-dec',
      sourceObservationId: observationId,
    });

    repository.persistEvaluation({
      id: evaluationId(evalId),
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'eligible',
      eligibilityEngineVersion: 'eligibility-v1',
      eligibilityInputFingerprint: 'elig-base-fp',
      fitLevel: 'strong',
      fitEngineVersion: 'fit-v1',
      fitInputFingerprint: 'fit-base-fp',
      fitSummary: 'Strong match on TypeScript',
      qualityLevel: 'strong',
      qualityEngineVersion: 'quality-v1',
      qualityInputFingerprint: 'quality-base-fp',
      qualitySummary: 'Fresh verified listing',
      qualityFreshnessBucket: 'recent',
      qualityEvaluatedAt: new Date(Date.now() - 5 * DAY_MS),
    });
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('populates Decision without mutating Eligibility, Fit, or Quality', async () => {
    const handlers = createDecisionHandlers(database);

    const task = ledger.enqueue({
      taskType: 'decision.evaluate',
      payload: {
        evaluationId: evalId,
        snapshotId: snapshot,
        candidateId: candidate,
      },
    });

    await handlers['decision.evaluate']!(task);

    const evaluation = repository.getEvaluation(evaluationId(evalId));
    expect(evaluation?.eligibilityState).toBe('eligible');
    expect(evaluation?.fitLevel).toBe('strong');
    expect(evaluation?.qualityLevel).toBe('strong');

    const decision = repository.getLatestDecisionForEvaluation(
      evaluationId(evalId),
    );
    expect(decision).not.toBeNull();
    expect(decision?.priority).toBe('high-priority');
    expect(decision?.action).toBe('apply');
    expect(decision?.engineVersion).toBe('decision-v1');
    expect(JSON.parse(decision?.reasonCodes ?? '[]')).toContain(
      'ACTIONABLE_LISTING',
    );
    expect(JSON.parse(decision?.reasonCodes ?? '[]')).toContain(
      'STRONG_REQUIRED_FIT',
    );
    expect(decision?.explanation).toContain('High priority');
  });

  it('rejects a task whose candidate or snapshot identity does not match its Evaluation', async () => {
    const handlers = createDecisionHandlers(database);
    const task = ledger.enqueue({
      taskType: 'decision.evaluate',
      payload: {
        evaluationId: evalId,
        snapshotId: 'snap-not-this-evaluation',
        candidateId: 'cand-not-this-evaluation',
      },
    });

    await expect(handlers['decision.evaluate']!(task)).rejects.toThrow(
      'Decision task input does not match its Evaluation',
    );
    expect(
      repository.getLatestDecisionForEvaluation(evaluationId(evalId)),
    ).toBeNull();
  });

  it('does not persist a positive Decision from incomplete upstream intelligence', async () => {
    const incomplete = evaluationId('eval-dec-incomplete');
    repository.persistEvaluation({
      id: incomplete,
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'eligible',
      eligibilityInputFingerprint: 'elig-complete',
      fitLevel: 'strong',
      fitInputFingerprint: 'fit-complete',
      qualityLevel: 'strong',
      // Deliberately absent: Quality semantic fingerprint/version.
    });
    const task = ledger.enqueue({
      taskType: 'decision.evaluate',
      payload: {
        evaluationId: incomplete,
        snapshotId: snapshot,
        candidateId: candidate,
      },
    });

    await createDecisionHandlers(database)['decision.evaluate']!(task);
    expect(repository.getLatestDecisionForEvaluation(incomplete)).toBeNull();
  });

  it('respects confirmed Eligibility blocker invariant over Strong Fit and Strong Quality', async () => {
    const handlers = createDecisionHandlers(database);

    const blockerEvalId = 'eval-dec-blocker';
    repository.persistEvaluation({
      id: evaluationId(blockerEvalId),
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'ineligible',
      eligibilityEngineVersion: 'eligibility-v1',
      eligibilityInputFingerprint: 'elig-block-fp',
      fitLevel: 'strong',
      fitEngineVersion: 'fit-v1',
      fitInputFingerprint: 'fit-block-fp',
      qualityLevel: 'strong',
      qualityEngineVersion: 'quality-v1',
      qualityInputFingerprint: 'quality-block-fp',
    });

    database.db
      .insert(evaluationFindings)
      .values({
        id: findingId('find-block-1'),
        evaluationId: evaluationId(blockerEvalId),
        category: 'eligibility',
        dimensionKey: 'work_authorization',
        state: 'HARD_BLOCKER',
        summary:
          'Requires German work authorization; candidate lacks German authorization.',
        confidence: 'high',
        explanation:
          'Requires German work authorization; candidate lacks German authorization.',
      })
      .run();

    const task = ledger.enqueue({
      taskType: 'decision.evaluate',
      payload: {
        evaluationId: blockerEvalId,
        snapshotId: snapshot,
        candidateId: candidate,
      },
    });

    await handlers['decision.evaluate']!(task);

    const decision = repository.getLatestDecisionForEvaluation(
      evaluationId(blockerEvalId),
    );
    expect(decision?.priority).toBe('blocked');
    expect(decision?.action).toBe('do_not_apply');
    expect(JSON.parse(decision?.reasonCodes ?? '[]')).toEqual([
      'ELIGIBILITY_BLOCKER',
    ]);
    expect(decision?.explanation).toContain(
      'Blocked by confirmed eligibility blocker',
    );
  });

  it('blocks an explicitly closed listing with Quality provenance without mutating an Application', async () => {
    const application = applicationId('application-closed-listing');
    const applications = new ApplicationRepository(database);
    applications.createApplication({
      id: application,
      candidateId: candidate,
      opportunityId: opportunity,
      status: 'Preparing',
    });
    let current = applications.getApplication(candidate, application)!;
    current = applications.updateApplication({
      id: application,
      candidateId: candidate,
      expectedUpdatedAt: current.updatedAt,
      status: 'Applied',
    });
    current = applications.updateApplication({
      id: application,
      candidateId: candidate,
      expectedUpdatedAt: current.updatedAt,
      status: 'Assessment',
    });
    applications.updateApplication({
      id: application,
      candidateId: candidate,
      expectedUpdatedAt: current.updatedAt,
      status: 'Interview',
    });
    applications.appendEvent({
      id: eventId('application-event-before-decision'),
      candidateId: candidate,
      applicationId: application,
      eventType: 'note',
      detail: 'Existing application history',
    });

    const sourceRepo = new SourceListingRepository(database);
    const closedObservation = 'obs-dec-closed';
    sourceRepo.persistObservation(
      closedObservation,
      listingId,
      {
        rawPayload: JSON.stringify({
          title: 'Senior TypeScript Engineer',
          company_name: 'Acme Corp',
          status: 'closed',
        }),
        fingerprint: 'obs-fp-dec-closed',
      },
      Date.now(),
    );
    const closedSnapshot = snapshotId('snap-dec-closed');
    new OpportunityRepository(database).appendSnapshot({
      id: closedSnapshot,
      opportunityId: opportunity,
      title: 'Senior TypeScript Engineer',
      organization: 'Acme Corp',
      content: 'This listing is closed.',
      fingerprint: 'snap-hash-dec-closed',
      sourceObservationId: closedObservation,
    });

    const closedEvaluation = evaluationId('eval-dec-closed');
    repository.persistEvaluation({
      id: closedEvaluation,
      candidateId: candidate,
      snapshotId: closedSnapshot,
      eligibilityState: 'eligible',
      eligibilityInputFingerprint: 'elig-closed-fp',
      fitLevel: 'strong',
      fitInputFingerprint: 'fit-closed-fp',
    });

    ledger.enqueue({
      taskType: 'quality.evaluate',
      payload: {
        evaluationId: closedEvaluation,
        snapshotId: closedSnapshot,
        candidateId: candidate,
      },
    });
    const qualityTask = ledger.claimNext({
      leaseOwner: 'closed-listing-test',
      leaseDurationMs: 30_000,
      now: new Date(Date.now() + 1),
    });
    expect(qualityTask?.taskType).toBe('quality.evaluate');
    await createQualityHandlers({ db: database })['quality.evaluate']!(
      qualityTask!,
    );
    ledger.markSucceeded(qualityTask!.id, 'closed-listing-test');
    const decisionTask = ledger.claimNext({
      leaseOwner: 'closed-listing-test',
      leaseDurationMs: 30_000,
      now: new Date(Date.now() + 1),
    });
    expect(decisionTask?.taskType).toBe('decision.evaluate');
    await createDecisionHandlers(database)['decision.evaluate']!(decisionTask!);

    const decision =
      repository.getLatestDecisionForEvaluation(closedEvaluation);
    expect(decision).toMatchObject({
      priority: 'blocked',
      action: 'do_not_apply',
    });
    expect(JSON.parse(decision?.reasonCodes ?? '[]')).toEqual([
      'LISTING_CLOSED',
    ]);
    expect(repository.getEvaluation(closedEvaluation)).toMatchObject({
      eligibilityState: 'eligible',
      fitLevel: 'strong',
    });
    expect(repository.getDecisionReasons(decisionId(decision!.id))).toEqual([
      expect.objectContaining({ reasonCode: 'LISTING_CLOSED' }),
    ]);
    expect(applications.getApplication(candidate, application)?.status).toBe(
      'Interview',
    );
    expect(applications.getEvents(candidate, application)).toHaveLength(6);

    const search = new SearchTargetRepository(database);
    const target = search.createSearchTarget(candidate, { name: 'Backend' });
    const run = discoveryRunId('run-closed-listing');
    search.createDiscoveryRun(
      run,
      candidate,
      searchTargetId(target.id),
      'greenhouse',
    );
    search.recordDiscoveryMatch({
      id: discoveryMatchId('match-closed-listing'),
      candidateId: candidate,
      searchTargetId: searchTargetId(target.id),
      discoveryRunId: run,
      opportunityId: opportunity,
      sourceListingId: listingId,
      matchReasons: [],
      retainedUnresolved: [],
    });
    const today = new TodayRepository(database).getTodayDashboard(candidate);
    expect(today.needsAttention).toEqual([
      expect.objectContaining({
        opportunityId: opportunity,
        category: 'blocked_closed',
      }),
    ]);
    expect(today.applicationActivity).toEqual([
      expect.objectContaining({
        applicationId: application,
        status: 'Interview',
      }),
    ]);
  });

  it('handles Quality risk as investigate without marking candidate ineligible', async () => {
    const handlers = createDecisionHandlers(database);

    const riskEvalId = 'eval-dec-risk';
    repository.persistEvaluation({
      id: evaluationId(riskEvalId),
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'eligible',
      eligibilityInputFingerprint: 'elig-risk-fp',
      fitLevel: 'strong',
      fitInputFingerprint: 'fit-risk-fp',
      qualityLevel: 'risk',
      qualityEngineVersion: 'quality-v1',
      qualityInputFingerprint: 'quality-risk-fp',
    });

    database.db
      .insert(evaluationFindings)
      .values({
        id: findingId('find-risk-1'),
        evaluationId: evaluationId(riskEvalId),
        category: 'quality',
        dimensionKey: 'application_link',
        label: 'Application Link',
        state: 'RISK',
        summary: 'Application URL is malformed.',
        confidence: 'critical',
        explanation: 'Application URL is malformed.',
      })
      .run();

    const task = ledger.enqueue({
      taskType: 'decision.evaluate',
      payload: {
        evaluationId: riskEvalId,
        snapshotId: snapshot,
        candidateId: candidate,
      },
    });

    await handlers['decision.evaluate']!(task);

    const decision = repository.getLatestDecisionForEvaluation(
      evaluationId(riskEvalId),
    );
    expect(decision?.priority).toBe('investigate');
    expect(decision?.action).toBe('investigate');
    expect(JSON.parse(decision?.reasonCodes ?? '[]')).toContain('QUALITY_RISK');
    expect(decision?.explanation).toContain(
      'Investigate listing quality before applying',
    );
  });

  it('behaves idempotently when evaluated multiple times with identical inputs', async () => {
    const handlers = createDecisionHandlers(database);

    const task = ledger.enqueue({
      taskType: 'decision.evaluate',
      payload: {
        evaluationId: evalId,
        snapshotId: snapshot,
        candidateId: candidate,
      },
    });

    await handlers['decision.evaluate']!(task);
    const firstDecision = repository.getLatestDecisionForEvaluation(
      evaluationId(evalId),
    );

    // Run again with identical inputs
    await handlers['decision.evaluate']!(task);
    const secondDecision = repository.getLatestDecisionForEvaluation(
      evaluationId(evalId),
    );

    expect(secondDecision?.id).toBe(firstDecision?.id);
    expect(secondDecision?.inputFingerprint).toBe(
      firstDecision?.inputFingerprint,
    );
  });

  it('automatically chains through eligibility -> fit -> quality -> decision in worker pipeline', async () => {
    const eligibilityHandlers = createEligibilityHandlers({ db: database });
    const fitHandlers = createFitHandlers({ db: database });
    const qualityHandlers = createQualityHandlers({ db: database });
    const decisionHandlers = createDecisionHandlers(database);

    // Step 1: Run eligibility evaluation
    ledger.enqueue({
      taskType: 'eligibility.evaluate',
      payload: {
        snapshotId: snapshot,
        candidateId: candidate,
      },
    });

    const eligTask = ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(eligTask?.taskType).toBe('eligibility.evaluate');
    await eligibilityHandlers['eligibility.evaluate']!(eligTask!);
    ledger.markSucceeded(eligTask!.id, 'worker-1');

    // Step 2: Claim and run fit evaluation
    const fitTask = ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(fitTask?.taskType).toBe('fit.evaluate');
    await fitHandlers['fit.evaluate']!(fitTask!);
    ledger.markSucceeded(fitTask!.id, 'worker-1');

    // Step 3: Claim and run quality evaluation
    const qualityTask = ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(qualityTask?.taskType).toBe('quality.evaluate');
    await qualityHandlers['quality.evaluate']!(qualityTask!);
    ledger.markSucceeded(qualityTask!.id, 'worker-1');

    // Step 4: Claim and run decision evaluation
    const decisionTask = ledger.claimNext({
      leaseOwner: 'worker-1',
      leaseDurationMs: 30_000,
    });
    expect(decisionTask?.taskType).toBe('decision.evaluate');
    await decisionHandlers['decision.evaluate']!(decisionTask!);
    ledger.markSucceeded(decisionTask!.id, 'worker-1');

    const finalEval = repository.getEvaluation(
      evaluationId(
        (decisionTask!.payload as { evaluationId: string }).evaluationId,
      ),
    );

    expect(finalEval?.eligibilityState).toBe('investigate');
    expect(finalEval?.fitLevel).toBe('weak');
    expect(finalEval?.qualityLevel).toBe('strong');

    const latestDecision = repository.getLatestDecisionForSnapshot(snapshot);
    expect(latestDecision).not.toBeNull();
    expect(latestDecision?.engineVersion).toBe('decision-v1');
    expect(latestDecision?.priority).toBe('investigate');
    expect(latestDecision?.action).toBe('investigate');
    expect(JSON.parse(latestDecision?.reasonCodes ?? '[]')).toContain(
      'ELIGIBILITY_UNRESOLVED',
    );
  });

  it('propagates eligibility changes end-to-end through pipeline to current decision', async () => {
    const candId = candidateId('cand-elig-prop');
    const candRepo = new CandidateRepository(database);
    candRepo.createCandidate(candId);

    const handlers = {
      ...createEligibilityHandlers({ db: database }),
      ...createFitHandlers({ db: database }),
      ...createQualityHandlers({ db: database }),
      ...createDecisionHandlers(database),
    };

    // Initial pipeline execution
    ledger.enqueue({
      taskType: 'eligibility.evaluate',
      payload: { snapshotId: snapshot, candidateId: candId },
    });

    let task = ledger.claimNext({ leaseOwner: 'w1', leaseDurationMs: 10_000 });
    while (task) {
      const handler = handlers[task.taskType];
      if (handler) {
        await handler(task);
        ledger.markSucceeded(task.id, 'w1');
      }
      task = ledger.claimNext({ leaseOwner: 'w1', leaseDurationMs: 10_000 });
    }

    const initialDecision = repository.getCurrentDecision(candId, snapshot);
    expect(initialDecision).not.toBeNull();

    // Now candidate adds US work auth claim
    candRepo.addClaim({
      id: claimId('claim-auth-us-new'),
      candidateId: candId,
      kind: 'work_auth',
      value: 'US',
      state: 'SUPPORTED',
    });

    // Re-evaluate eligibility pipeline
    ledger.enqueue({
      taskType: 'eligibility.evaluate',
      payload: { snapshotId: snapshot, candidateId: candId },
    });

    task = ledger.claimNext({ leaseOwner: 'w1', leaseDurationMs: 10_000 });
    while (task) {
      const handler = handlers[task.taskType];
      if (handler) {
        await handler(task);
        ledger.markSucceeded(task.id, 'w1');
      }
      task = ledger.claimNext({ leaseOwner: 'w1', leaseDurationMs: 10_000 });
    }

    const updatedDecision = repository.getCurrentDecision(candId, snapshot);
    expect(updatedDecision).not.toBeNull();
    expect(updatedDecision?.id).not.toBe(initialDecision?.id);
  });

  it('propagates evidence-backed Career Memory confirmation and conflict to Decision', async () => {
    const candId = candidateId('cand-career-memory-e2e');
    const candRepo = new CandidateRepository(database);
    candRepo.createCandidate(candId);
    candRepo.addClaim({
      id: claimId('claim-memory-ts'),
      candidateId: candId,
      kind: 'skill',
      value: 'TypeScript',
      state: 'SUPPORTED',
    });
    candRepo.addClaim({
      id: claimId('claim-memory-node'),
      candidateId: candId,
      kind: 'skill',
      value: 'Node.js',
      state: 'SUPPORTED',
    });
    const targetSnapshot = snapshotId('snap-career-memory-e2e');
    new OpportunityRepository(database).appendSnapshot({
      id: targetSnapshot,
      opportunityId: opportunity,
      title: 'Senior TypeScript Engineer',
      organization: 'Acme Corp',
      location: 'New York, US',
      workModel: 'hybrid',
      employmentType: 'full-time',
      compensation: '$130,000 - $160,000',
      content:
        'Must be authorized to work in the US. Requirements: TypeScript, Node.js. Apply at https://boards.greenhouse.io/acme/jobs/123.',
      fingerprint: 'snap-career-memory-e2e',
      sourceObservationId: observationId,
    });
    const memory = new CareerMemoryRepository(database);
    const authorization = memory.createClaim({
      candidateId: candId,
      kind: 'work_authorization',
      value: 'US work authorization',
      scope: 'us',
      state: 'UNKNOWN',
    });
    const handlers = {
      ...createEligibilityHandlers({ db: database }),
      ...createFitHandlers({ db: database }),
      ...createQualityHandlers({ db: database }),
      ...createDecisionHandlers(database),
    };
    const drain = async () => {
      let task = ledger.claimNext({
        leaseOwner: 'memory-worker',
        leaseDurationMs: 10_000,
      });
      while (task) {
        await handlers[task.taskType]!(task);
        ledger.markSucceeded(task.id, 'memory-worker');
        task = ledger.claimNext({
          leaseOwner: 'memory-worker',
          leaseDurationMs: 10_000,
        });
      }
    };

    await drain();
    let evaluation = repository.getCurrentEvaluation(candId, targetSnapshot);
    let decision = repository.getCurrentDecision(candId, targetSnapshot);
    expect(evaluation?.eligibilityState).toBe('investigate');
    expect(decision?.priority).toBe('investigate');

    memory.attachEvidence({
      candidateId: candId,
      claimId: claimId(authorization.id),
      evidence: {
        evidenceType: 'user-confirmed statement',
        excerpt: 'I am authorized to work in the United States.',
        state: 'candidate-confirmed',
      },
      transitionTo: 'SUPPORTED',
    });
    await drain();
    evaluation = repository.getCurrentEvaluation(candId, targetSnapshot);
    decision = repository.getCurrentDecision(candId, targetSnapshot);
    expect(evaluation?.eligibilityState).toBe('eligible');
    expect(decision?.action).not.toBe('do_not_apply');

    memory.attachEvidence({
      candidateId: candId,
      claimId: claimId(authorization.id),
      evidence: {
        evidenceType: 'candidate correction',
        sourceReference: 'manual:authorization-correction',
        excerpt: 'I do not currently possess the required authorization.',
        state: 'disputed',
      },
      transitionTo: 'CONFLICTING',
    });
    await drain();
    evaluation = repository.getCurrentEvaluation(candId, targetSnapshot);
    decision = repository.getCurrentDecision(candId, targetSnapshot);
    expect(evaluation?.eligibilityState).toBe('ineligible');
    expect(decision?.priority).toBe('blocked');
  });

  it('propagates fit changes end-to-end through pipeline to current decision', async () => {
    const candId = candidateId('cand-fit-prop');
    const candRepo = new CandidateRepository(database);
    candRepo.createCandidate(candId);
    candRepo.addClaim({
      id: claimId('claim-auth-us-fit'),
      candidateId: candId,
      kind: 'work_auth',
      value: 'US',
      state: 'SUPPORTED',
    });
    candRepo.addClaim({
      id: claimId('claim-loc-us-fit'),
      candidateId: candId,
      kind: 'location',
      value: 'US',
      state: 'SUPPORTED',
    });

    const handlers = {
      ...createEligibilityHandlers({ db: database }),
      ...createFitHandlers({ db: database }),
      ...createQualityHandlers({ db: database }),
      ...createDecisionHandlers(database),
    };

    // Initial run with weak fit (no skill claims)
    ledger.enqueue({
      taskType: 'eligibility.evaluate',
      payload: { snapshotId: snapshot, candidateId: candId },
    });

    let task = ledger.claimNext({ leaseOwner: 'w1', leaseDurationMs: 10_000 });
    while (task) {
      const handler = handlers[task.taskType];
      if (handler) {
        await handler(task);
        ledger.markSucceeded(task.id, 'w1');
      }
      task = ledger.claimNext({ leaseOwner: 'w1', leaseDurationMs: 10_000 });
    }

    const initialDecision = repository.getCurrentDecision(candId, snapshot);
    expect(initialDecision).not.toBeNull();

    // Candidate acquires required skill claim
    candRepo.addClaim({
      id: claimId('claim-skill-ts-prop'),
      candidateId: candId,
      kind: 'skill',
      value: 'TypeScript',
      state: 'SUPPORTED',
    });

    // Re-run fit pipeline
    const evalRecord = repository.getCurrentEvaluation(candId, snapshot);
    ledger.enqueue({
      taskType: 'fit.evaluate',
      payload: {
        evaluationId: evalRecord!.id,
        snapshotId: snapshot,
        candidateId: candId,
      },
    });

    task = ledger.claimNext({ leaseOwner: 'w1', leaseDurationMs: 10_000 });
    while (task) {
      const handler = handlers[task.taskType];
      if (handler) {
        await handler(task);
        ledger.markSucceeded(task.id, 'w1');
      }
      task = ledger.claimNext({ leaseOwner: 'w1', leaseDurationMs: 10_000 });
    }

    const updatedDecision = repository.getCurrentDecision(candId, snapshot);
    expect(updatedDecision).not.toBeNull();
    expect(updatedDecision?.id).not.toBe(initialDecision?.id);
  });

  it('maintains strict candidate isolation for evaluations on the same snapshot', async () => {
    const candA = candidateId('cand-iso-a');
    const candB = candidateId('cand-iso-b');
    const candRepo = new CandidateRepository(database);
    candRepo.createCandidate(candA);
    candRepo.createCandidate(candB);

    candRepo.addClaim({
      id: claimId('claim-auth-a'),
      candidateId: candA,
      kind: 'work_auth',
      value: 'US',
      state: 'SUPPORTED',
    });

    const handlers = createDecisionHandlers(database);

    const evalA = evaluationId('eval-iso-a');
    const evalB = evaluationId('eval-iso-b');

    repository.persistEvaluation({
      id: evalA,
      candidateId: candA,
      snapshotId: snapshot,
      eligibilityState: 'eligible',
      eligibilityInputFingerprint: 'elig-fp-a',
      fitLevel: 'strong',
      fitInputFingerprint: 'fit-fp-a',
      qualityLevel: 'strong',
      qualityInputFingerprint: 'quality-fp-a',
    });

    repository.persistEvaluation({
      id: evalB,
      candidateId: candB,
      snapshotId: snapshot,
      eligibilityState: 'ineligible',
      eligibilityInputFingerprint: 'elig-fp-b',
      fitLevel: 'strong',
      fitInputFingerprint: 'fit-fp-b',
      qualityLevel: 'strong',
      qualityInputFingerprint: 'quality-fp-b',
    });

    database.db
      .insert(evaluationFindings)
      .values({
        id: findingId('find-iso-b'),
        evaluationId: evalB,
        category: 'eligibility',
        dimensionKey: 'work_authorization',
        state: 'HARD_BLOCKER',
        summary: 'Requires US work authorization.',
      })
      .run();

    const taskA = ledger.enqueue({
      taskType: 'decision.evaluate',
      payload: {
        evaluationId: evalA,
        snapshotId: snapshot,
        candidateId: candA,
      },
    });
    await handlers['decision.evaluate']!(taskA);

    const taskB = ledger.enqueue({
      taskType: 'decision.evaluate',
      payload: {
        evaluationId: evalB,
        snapshotId: snapshot,
        candidateId: candB,
      },
    });
    await handlers['decision.evaluate']!(taskB);

    const decA = repository.getCurrentDecision(candA, snapshot);
    const decB = repository.getCurrentDecision(candB, snapshot);

    expect(decA?.priority).toBe('high-priority');
    expect(decA?.action).toBe('apply');

    expect(decB?.priority).toBe('blocked');
    expect(decB?.action).toBe('do_not_apply');
  });
});
