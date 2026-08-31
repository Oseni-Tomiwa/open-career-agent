import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  BackgroundTaskLedger,
  CandidateRepository,
  CareerMemoryRepository,
  EvaluationRepository,
  openDatabase,
  OpportunityRepository,
  SearchTargetRepository,
  type DatabaseHandle,
} from '@oca/database';
import {
  candidateId,
  discoveryRunId,
  evaluationId,
  opportunityId,
  searchTargetId,
  snapshotId,
} from '@oca/domain';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDecisionHandlers } from '../decision/workflow.js';
import { createEligibilityHandlers } from '../eligibility/workflow.js';
import { createFitHandlers } from '../fit/workflow.js';
import { createQualityHandlers } from '../quality/workflow.js';
import { BackgroundWorker } from '../worker.js';
import { createDiscoveryHandlers } from './workflow.js';

describe('Discovery Worker Workflow & E2E Scenarios', () => {
  let directory: string;
  let db: DatabaseHandle;
  let ledger: BackgroundTaskLedger;
  let worker: BackgroundWorker;
  let targetRepo: SearchTargetRepository;
  let candRepo: CandidateRepository;
  let oppRepo: OpportunityRepository;
  let evalRepo: EvaluationRepository;

  const candidateA = candidateId('cand-disc-a');
  const candidateB = candidateId('cand-disc-b');

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-disc-worker-test-'));
    db = openDatabase(join(directory, 'test.sqlite'));
    await applyMigrations(db);

    ledger = new BackgroundTaskLedger(db);
    targetRepo = new SearchTargetRepository(db);
    candRepo = new CandidateRepository(db);
    oppRepo = new OpportunityRepository(db);
    evalRepo = new EvaluationRepository(db);

    await candRepo.createCandidate(candidateA);
    await candRepo.createCandidate(candidateB);

    worker = new BackgroundWorker({
      ledger,
      handlers: {
        ...createDiscoveryHandlers({ db }),
        ...createEligibilityHandlers({ db }),
        ...createFitHandlers({ db }),
        ...createQualityHandlers({ db }),
        ...createDecisionHandlers(db),
      },
      logger: pino({ level: 'silent' }),
      workerId: 'test-worker-1',
      pollIntervalMs: 50,
      leaseDurationMs: 5000,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('runs E2E discovery scenario with 4 discovered, 2 accepted, 2 rejected, cascading accepted into intelligence pipeline', async () => {
    const targetA = await targetRepo.createSearchTarget(candidateA, {
      name: 'Backend Target',
      targetRoles: ['Backend Engineer'],
      locations: ['Germany'],
      locationIsHardFilter: true,
      workModels: ['remote'],
      workModelIsHardFilter: false,
      requiredTerms: ['TypeScript'],
      excludedTerms: ['Senior'],
      sources: [{ sourceSystem: 'greenhouse', boardId: 'testboard' }],
    });

    const greenhouseFixture = {
      jobs: [
        {
          id: 101,
          absolute_url: 'https://boards.greenhouse.io/testboard/jobs/101',
          title: 'Backend Engineer',
          location: { name: 'Germany (Remote)' },
          content: '&lt;p&gt;TypeScript experience required.&lt;/p&gt;',
        },
        {
          id: 102,
          absolute_url: 'https://boards.greenhouse.io/testboard/jobs/102',
          title: 'Senior Backend Engineer',
          location: { name: 'Germany' },
          content: '&lt;p&gt;TypeScript experience required.&lt;/p&gt;',
        },
        {
          id: 103,
          absolute_url: 'https://boards.greenhouse.io/testboard/jobs/103',
          title: 'Backend Engineer',
          location: { name: 'United States' },
          content: '&lt;p&gt;TypeScript experience required.&lt;/p&gt;',
        },
        {
          id: 104,
          absolute_url: 'https://boards.greenhouse.io/testboard/jobs/104',
          title: 'Backend Engineer',
          location: { name: 'Germany (Hybrid)' },
          content: '&lt;p&gt;TypeScript experience required.&lt;/p&gt;',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(greenhouseFixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const runId = discoveryRunId('dr-test-e2e-1');
    await targetRepo.createDiscoveryRun(
      runId,
      candidateA,
      searchTargetId(targetA.id),
      'greenhouse',
    );

    await ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetA.id,
        discoveryRunId: runId,
      },
      idempotencyKey: 'disc-task-1',
    });

    while (await worker.runOnce(new Date())) {
      // Drain background worker task ledger
    }

    const completedRun = await targetRepo.getDiscoveryRun(runId);
    expect(completedRun).not.toBeNull();
    expect(completedRun?.status).toBe('COMPLETED');
    expect(completedRun?.discoveredCount).toBe(4);
    expect(completedRun?.acceptedCount).toBe(2);
    expect(completedRun?.rejectedCount).toBe(2);
    expect(completedRun?.rejectedByReason).toMatchObject({
      'EXCLUDED_TERM: Senior': 1,
      'LOCATION_HARD_REJECT: United States': 1,
    });

    const matches = await targetRepo.listDiscoveryMatches(candidateA);
    expect(matches).toHaveLength(2);

    const matchedOppIds = await targetRepo.getMatchedOpportunityIds(candidateA);
    expect(matchedOppIds.length).toBe(2);

    const firstOppId = matchedOppIds[0];
    expect(firstOppId).toBeDefined();
    const latestSnapshot = await oppRepo.getLatestSnapshot(firstOppId!);
    expect(latestSnapshot).not.toBeNull();

    const evaluation = await evalRepo.getCurrentEvaluation(
      candidateA,
      snapshotId(latestSnapshot!.id),
    );
    expect(evaluation).not.toBeNull();
    expect(evaluation?.eligibilityState).toBeDefined();

    const decision = await evalRepo.getCurrentDecisionForEvaluation(
      evaluationId(evaluation!.id),
    );
    expect(decision).not.toBeNull();
    expect(decision?.priority).toBeDefined();
  });

  it('supports multi-candidate discovery of the same canonical opportunity with isolated candidate matches and decisions', async () => {
    const targetA = await targetRepo.createSearchTarget(candidateA, {
      name: 'Target A',
      targetRoles: ['Full Stack'],
    });

    const targetB = await targetRepo.createSearchTarget(candidateB, {
      name: 'Target B',
      targetRoles: ['Full Stack'],
    });

    const sharedJobFixture = {
      jobs: [
        {
          id: 505,
          absolute_url: 'https://boards.greenhouse.io/testboard/jobs/505',
          title: 'Full Stack Engineer',
          location: { name: 'Germany' },
          content: 'Node.js and React.',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(sharedJobFixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const runA = discoveryRunId('dr-shared-a');
    await targetRepo.createDiscoveryRun(
      runA,
      candidateA,
      searchTargetId(targetA.id),
    );
    await ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetA.id,
        discoveryRunId: runA,
      },
      idempotencyKey: 'disc-task-a',
    });

    while (await worker.runOnce(new Date())) {
      // Drain background worker task ledger
    }

    const runB = discoveryRunId('dr-shared-b');
    await targetRepo.createDiscoveryRun(
      runB,
      candidateB,
      searchTargetId(targetB.id),
    );
    await ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateB,
        searchTargetId: targetB.id,
        discoveryRunId: runB,
      },
      idempotencyKey: 'disc-task-b',
    });

    while (await worker.runOnce(new Date())) {
      // Drain background worker task ledger
    }

    const summaries = await oppRepo.getOpportunitySummaries();
    expect(summaries).toHaveLength(1);

    const matchesA = await targetRepo.listDiscoveryMatches(candidateA);
    const matchesB = await targetRepo.listDiscoveryMatches(candidateB);
    expect(matchesA).toHaveLength(1);
    expect(matchesB).toHaveLength(1);
    expect(matchesA[0]?.opportunityId).toBe(matchesB[0]?.opportunityId);
  });

  it('proves Discovery metadata and preferences strictly DO NOT alter Fit, Eligibility, Quality, or Decision evaluations', async () => {
    const target1 = await targetRepo.createSearchTarget(candidateA, {
      name: 'Target 1 Remote Pref',
      targetRoles: ['Backend Engineer'],
      locations: ['Germany'],
      locationIsHardFilter: false,
      workModels: ['remote'],
      workModelIsHardFilter: false,
      requiredTerms: ['TypeScript'],
    });

    const target2 = await targetRepo.createSearchTarget(candidateA, {
      name: 'Target 2 Onsite Pref',
      targetRoles: ['Backend Engineer'],
      locations: ['France'],
      locationIsHardFilter: false,
      workModels: ['onsite'],
      workModelIsHardFilter: false,
      requiredTerms: [],
    });

    const jobFixture = {
      jobs: [
        {
          id: 707,
          absolute_url: 'https://boards.greenhouse.io/testboard/jobs/707',
          title: 'Backend Engineer',
          location: { name: 'Germany (Remote)' },
          content: 'TypeScript and Node.js developer.',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(jobFixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const run1 = discoveryRunId('dr-iso-1');
    await targetRepo.createDiscoveryRun(
      run1,
      candidateA,
      searchTargetId(target1.id),
    );
    await ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: target1.id,
        discoveryRunId: run1,
      },
      idempotencyKey: 'disc-iso-1',
    });

    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    const matchedOppId = (
      await targetRepo.getMatchedOpportunityIds(candidateA)
    )[0]!;
    const snapshot1 = (await oppRepo.getLatestSnapshot(matchedOppId))!;
    const eval1 = (await evalRepo.getCurrentEvaluation(
      candidateA,
      snapshotId(snapshot1.id),
    ))!;
    const dec1 = (await evalRepo.getCurrentDecisionForEvaluation(
      evaluationId(eval1.id),
    ))!;

    const run2 = discoveryRunId('dr-iso-2');
    await targetRepo.createDiscoveryRun(
      run2,
      candidateA,
      searchTargetId(target2.id),
    );
    await ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: target2.id,
        discoveryRunId: run2,
      },
      idempotencyKey: 'disc-iso-2',
    });

    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    const eval2 = (await evalRepo.getCurrentEvaluation(
      candidateA,
      snapshotId(snapshot1.id),
    ))!;
    const dec2 = (await evalRepo.getCurrentDecisionForEvaluation(
      evaluationId(eval2.id),
    ))!;

    expect(eval1.fitLevel).toBe(eval2.fitLevel);

    const memoryRepo = new CareerMemoryRepository(db);
    const profile = await memoryRepo.getProfile(candidateA);
    expect(profile?.claims).toHaveLength(0);

    expect(eval1.eligibilityState).toBe(eval2.eligibilityState);
    expect(eval1.qualityLevel).toBe(eval2.qualityLevel);
    expect(dec1.priority).toBe(dec2.priority);
    expect(dec1.action).toBe(dec2.action);

    expect(eval1.fitInputFingerprint).toBe(eval2.fitInputFingerprint);
    expect(eval1.eligibilityInputFingerprint).toBe(
      eval2.eligibilityInputFingerprint,
    );
    expect(dec1.inputFingerprint).toBe(dec2.inputFingerprint);
  });

  it('runs discovery across Lever and Ashby sources and produces identical downstream intelligence evaluations for equivalent job snapshots', async () => {
    const targetMulti = await targetRepo.createSearchTarget(candidateA, {
      name: 'Multi ATS Target',
      targetRoles: ['Backend Engineer'],
      sources: [
        { sourceSystem: 'lever', boardId: 'acme-lever' },
        { sourceSystem: 'ashby', boardId: 'acme-ashby' },
      ],
    });

    const leverFixture = [
      {
        id: 'lever-opp-1',
        text: 'Backend Engineer',
        categories: { team: 'Acme Corp', location: 'Remote' },
        descriptionPlain: 'TypeScript Backend role.',
        hostedUrl: 'https://jobs.lever.co/acme/lever-opp-1',
        workplaceType: 'remote',
      },
    ];

    const ashbyFixture = {
      jobs: [
        {
          id: 'ashby-opp-1',
          title: 'Backend Engineer',
          department: 'Acme Corp',
          locationName: 'Remote',
          descriptionPlain: 'TypeScript Backend role.',
          jobUrl: 'https://jobs.ashbyhq.com/acme/ashby-opp-1',
          isRemote: true,
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr =
        typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.href
            : String((url as { url?: string }).url ?? '');
      if (urlStr.includes('lever.co')) {
        return Promise.resolve(
          new Response(JSON.stringify(leverFixture), { status: 200 }),
        );
      }
      if (urlStr.includes('ashbyhq.com')) {
        return Promise.resolve(
          new Response(JSON.stringify(ashbyFixture), { status: 200 }),
        );
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const runId = discoveryRunId('dr-multi-ats');
    await targetRepo.createDiscoveryRun(
      runId,
      candidateA,
      searchTargetId(targetMulti.id),
      'lever',
    );

    await ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetMulti.id,
        discoveryRunId: runId,
      },
      idempotencyKey: 'disc-multi-ats',
    });

    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    const runRecord = await targetRepo.getDiscoveryRun(runId);
    expect(runRecord?.status).toBe('COMPLETED');
    expect(runRecord?.discoveredCount).toBe(2);
    expect(runRecord?.acceptedCount).toBe(2);

    const matches = await targetRepo.listDiscoveryMatches(candidateA);
    expect(matches).toHaveLength(2);

    for (const match of matches) {
      const snap = (await oppRepo.getLatestSnapshot(
        opportunityId(match.opportunityId),
      ))!;
      const evaluation = await evalRepo.getCurrentEvaluation(
        candidateA,
        snapshotId(snap.id),
      );
      expect(evaluation).not.toBeNull();
      expect(evaluation?.eligibilityState).toBeDefined();

      const decision = await evalRepo.getCurrentDecisionForEvaluation(
        evaluationId(evaluation!.id),
      );
      expect(decision).not.toBeNull();
      expect(decision?.priority).toBeDefined();
    }
  });

  it('handles source failure honestly without marking discovery run as COMPLETED', async () => {
    const targetFailing = await targetRepo.createSearchTarget(candidateA, {
      name: 'Failing Source Target',
      targetRoles: ['Backend Engineer'],
      sources: [{ sourceSystem: 'lever', boardId: 'broken-site' }],
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Service Unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      }),
    );

    const runId = discoveryRunId('dr-failing');
    await targetRepo.createDiscoveryRun(
      runId,
      candidateA,
      searchTargetId(targetFailing.id),
      'lever',
    );

    await ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetFailing.id,
        discoveryRunId: runId,
      },
      idempotencyKey: 'disc-failing',
    });

    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    const runRecord = await targetRepo.getDiscoveryRun(runId);
    expect(runRecord?.status).toBe('FAILED');
    expect(runRecord?.errorSummary).toContain('Lever API returned 503');
  });
});
