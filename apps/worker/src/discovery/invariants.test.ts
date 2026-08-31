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
  SearchTargetRepository,
  SourceListingRepository,
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
import { isSafeHttpUrl } from '@oca/sources';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDecisionHandlers } from '../decision/workflow.js';
import { createEligibilityHandlers } from '../eligibility/workflow.js';
import { createFitHandlers } from '../fit/workflow.js';
import { createQualityHandlers } from '../quality/workflow.js';
import { BackgroundWorker } from '../worker.js';
import { createDiscoveryHandlers } from './workflow.js';

describe('Adversarial Invariant Freeze Review Matrix', () => {
  let directory: string;
  let db: DatabaseHandle;
  let ledger: BackgroundTaskLedger;
  let worker: BackgroundWorker;
  let targetRepo: SearchTargetRepository;
  let candRepo: CandidateRepository;
  let oppRepo: OpportunityRepository;
  let evalRepo: EvaluationRepository;
  let sourceRepo: SourceListingRepository;

  const candidateA = candidateId('cand-inv-a');
  const candidateB = candidateId('cand-inv-b');

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'oca-inv-worker-test-'));
    db = openDatabase(join(directory, 'test.sqlite'));
    applyMigrations(db);

    ledger = new BackgroundTaskLedger(db);
    targetRepo = new SearchTargetRepository(db);
    candRepo = new CandidateRepository(db);
    oppRepo = new OpportunityRepository(db);
    evalRepo = new EvaluationRepository(db);
    sourceRepo = new SourceListingRepository(db);

    candRepo.createCandidate(candidateA);
    candRepo.createCandidate(candidateB);

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
      workerId: 'test-worker-inv',
      pollIntervalMs: 50,
      leaseDurationMs: 5000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('1. SAME-SOURCE IDEMPOTENCY: repeated discovery reuses listing identity and avoids duplicate canonical opportunities or discovery matches', async () => {
    const target = targetRepo.createSearchTarget(candidateA, {
      name: 'Idempotency Target',
      targetRoles: ['Backend Engineer'],
      sources: [{ sourceSystem: 'lever', boardId: 'acme' }],
    });

    const leverFixture = [
      {
        id: 'lever-idem-100',
        text: 'Backend Engineer',
        categories: { team: 'Backend', location: 'Remote' },
        descriptionPlain: 'TypeScript Backend role.',
        hostedUrl: 'https://jobs.lever.co/acme/lever-idem-100',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(leverFixture), { status: 200 }),
      ),
    );

    // Run 1
    const run1 = discoveryRunId('dr-idem-1');
    targetRepo.createDiscoveryRun(
      run1,
      candidateA,
      searchTargetId(target.id),
      'lever',
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: target.id,
        discoveryRunId: run1,
      },
      idempotencyKey: 'disc-idem-1',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    // Run 2 (Same listing rediscovered)
    const run2 = discoveryRunId('dr-idem-2');
    targetRepo.createDiscoveryRun(
      run2,
      candidateA,
      searchTargetId(target.id),
      'lever',
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: target.id,
        discoveryRunId: run2,
      },
      idempotencyKey: 'disc-idem-2',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    // ASSERTIONS:
    // Exactly 1 canonical Opportunity created
    const summaries = oppRepo.getOpportunitySummaries();
    expect(summaries).toHaveLength(1);

    // Exactly 1 SourceListing exists for (lever, lever-idem-100)
    const listing = sourceRepo.findListingByExternalId(
      'lever',
      'lever-idem-100',
    );
    expect(listing).not.toBeNull();

    // SourceObservations recorded
    const obsList = sourceRepo.listObservationsForListing(listing!.id);
    expect(obsList.length).toBeGreaterThanOrEqual(1);

    // DiscoveryMatch for (candidateA, target.id, opportunityId) is deduped / single record per candidate target match
    const matches = targetRepo.listDiscoveryMatches(candidateA);
    expect(matches).toHaveLength(1);
  });

  it('2. CROSS-SOURCE NON-MERGING: weakly similar roles from Greenhouse and Lever remain separate canonical Opportunities', async () => {
    const target = targetRepo.createSearchTarget(candidateA, {
      name: 'Cross-Source Non-Merging Target',
      targetRoles: ['Backend Engineer'],
      sources: [
        { sourceSystem: 'greenhouse', boardId: 'acme-gh' },
        { sourceSystem: 'lever', boardId: 'acme-lev' },
      ],
    });

    const greenhouseFixture = {
      jobs: [
        {
          id: 555,
          absolute_url: 'https://boards.greenhouse.io/acme-gh/jobs/555',
          title: 'Backend Engineer',
          location: { name: 'Berlin' },
          content: 'Backend Developer in Berlin.',
        },
      ],
    };

    const leverFixture = [
      {
        id: 'lever-555',
        text: 'Backend Engineer',
        categories: { team: 'Acme', location: 'Berlin' },
        descriptionPlain: 'Backend Developer in Berlin.',
        hostedUrl: 'https://jobs.lever.co/acme-lev/lever-555',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr =
        typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.href
            : String((url as { url?: string }).url ?? '');
      if (urlStr.includes('greenhouse.io')) {
        return Promise.resolve(
          new Response(JSON.stringify(greenhouseFixture), { status: 200 }),
        );
      }
      if (urlStr.includes('lever.co')) {
        return Promise.resolve(
          new Response(JSON.stringify(leverFixture), { status: 200 }),
        );
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const runId = discoveryRunId('dr-cross-merge');
    targetRepo.createDiscoveryRun(runId, candidateA, searchTargetId(target.id));
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: target.id,
        discoveryRunId: runId,
      },
      idempotencyKey: 'disc-cross-merge',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    // ASSERTION: Must produce TWO distinct canonical Opportunities
    const summaries = oppRepo.getOpportunitySummaries();
    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.id).not.toBe(summaries[1]?.id);
  });

  it('3. MULTI-CANDIDATE SAME SOURCE LISTING: two candidates discovering exact same listing share ONE Opportunity with TWO candidate matches and independent evaluations', async () => {
    const targetA = targetRepo.createSearchTarget(candidateA, {
      name: 'Target A',
      targetRoles: ['Frontend Engineer'],
      sources: [{ sourceSystem: 'ashby', boardId: 'linear' }],
    });

    const targetB = targetRepo.createSearchTarget(candidateB, {
      name: 'Target B',
      targetRoles: ['Frontend Engineer'],
      sources: [{ sourceSystem: 'ashby', boardId: 'linear' }],
    });

    const ashbyFixture = {
      jobs: [
        {
          id: 'ashby-shared-1',
          title: 'Frontend Engineer',
          department: 'Product',
          locationName: 'Remote',
          descriptionPlain: 'React & TypeScript expert.',
          jobUrl: 'https://jobs.ashbyhq.com/linear/ashby-shared-1',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(ashbyFixture), { status: 200 }),
      ),
    );

    // Candidate A Discovery
    const runA = discoveryRunId('dr-shared-cand-a');
    targetRepo.createDiscoveryRun(
      runA,
      candidateA,
      searchTargetId(targetA.id),
      'ashby',
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetA.id,
        discoveryRunId: runA,
      },
      idempotencyKey: 'disc-shared-a',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    // Candidate B Discovery
    const runB = discoveryRunId('dr-shared-cand-b');
    targetRepo.createDiscoveryRun(
      runB,
      candidateB,
      searchTargetId(targetB.id),
      'ashby',
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateB,
        searchTargetId: targetB.id,
        discoveryRunId: runB,
      },
      idempotencyKey: 'disc-shared-b',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    // ASSERTIONS:
    // ONE canonical Opportunity
    const summaries = oppRepo.getOpportunitySummaries();
    expect(summaries).toHaveLength(1);

    // TWO Candidate-owned Discovery Matches
    const matchesA = targetRepo.listDiscoveryMatches(candidateA);
    const matchesB = targetRepo.listDiscoveryMatches(candidateB);
    expect(matchesA).toHaveLength(1);
    expect(matchesB).toHaveLength(1);
    expect(matchesA[0]?.opportunityId).toBe(matchesB[0]?.opportunityId);
    expect(matchesA[0]?.candidateId).toBe(candidateA);
    expect(matchesB[0]?.candidateId).toBe(candidateB);

    // Independent Evaluation lineages
    const oppId = opportunityId(summaries[0]!.id);
    const snap = oppRepo.getLatestSnapshot(oppId)!;

    const evalA = evalRepo.getCurrentEvaluation(
      candidateA,
      snapshotId(snap.id),
    );
    const evalB = evalRepo.getCurrentEvaluation(
      candidateB,
      snapshotId(snap.id),
    );
    expect(evalA).not.toBeNull();
    expect(evalB).not.toBeNull();
    expect(evalA?.id).not.toBe(evalB?.id);
  });

  it('4. INTELLIGENCE SOURCE NEUTRALITY: equivalent snapshots from Greenhouse, Lever, and Ashby yield identical Eligibility, Fit, and Decision outcomes', async () => {
    // Construct 3 targets for Candidate A targeting 3 different sources
    const targetGh = targetRepo.createSearchTarget(candidateA, {
      name: 'Greenhouse Target',
      targetRoles: ['Software Engineer'],
      sources: [{ sourceSystem: 'greenhouse', boardId: 'co-gh' }],
    });
    const targetLev = targetRepo.createSearchTarget(candidateA, {
      name: 'Lever Target',
      targetRoles: ['Software Engineer'],
      sources: [{ sourceSystem: 'lever', boardId: 'co-lev' }],
    });
    const targetAsh = targetRepo.createSearchTarget(candidateA, {
      name: 'Ashby Target',
      targetRoles: ['Software Engineer'],
      sources: [{ sourceSystem: 'ashby', boardId: 'co-ash' }],
    });

    const jobTitle = 'Staff Software Engineer';
    const org = 'Core Platform';
    const content = 'TypeScript and Distributed Systems experience required.';
    const location = 'Remote';

    // Fixtures
    const ghFixture = {
      jobs: [
        {
          id: 1,
          title: jobTitle,
          location: { name: location },
          content,
          absolute_url: 'https://boards.greenhouse.io/co-gh/jobs/1',
        },
      ],
    };
    const levFixture = [
      {
        id: '1',
        text: jobTitle,
        categories: { team: org, location },
        descriptionPlain: content,
        hostedUrl: 'https://jobs.lever.co/co-lev/1',
      },
    ];
    const ashFixture = {
      jobs: [
        {
          id: '1',
          title: jobTitle,
          department: org,
          locationName: location,
          descriptionPlain: content,
          jobUrl: 'https://jobs.ashbyhq.com/co-ash/1',
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
      if (urlStr.includes('greenhouse.io'))
        return Promise.resolve(
          new Response(JSON.stringify(ghFixture), { status: 200 }),
        );
      if (urlStr.includes('lever.co'))
        return Promise.resolve(
          new Response(JSON.stringify(levFixture), { status: 200 }),
        );
      if (urlStr.includes('ashbyhq.com'))
        return Promise.resolve(
          new Response(JSON.stringify(ashFixture), { status: 200 }),
        );
      return Promise.reject(new Error('Unknown URL'));
    });

    // Run GH
    const runGh = discoveryRunId('dr-neut-gh');
    targetRepo.createDiscoveryRun(
      runGh,
      candidateA,
      searchTargetId(targetGh.id),
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetGh.id,
        discoveryRunId: runGh,
      },
      idempotencyKey: 'neut-gh',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    // Run Lever
    const runLev = discoveryRunId('dr-neut-lev');
    targetRepo.createDiscoveryRun(
      runLev,
      candidateA,
      searchTargetId(targetLev.id),
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetLev.id,
        discoveryRunId: runLev,
      },
      idempotencyKey: 'neut-lev',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    // Run Ashby
    const runAsh = discoveryRunId('dr-neut-ash');
    targetRepo.createDiscoveryRun(
      runAsh,
      candidateA,
      searchTargetId(targetAsh.id),
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetAsh.id,
        discoveryRunId: runAsh,
      },
      idempotencyKey: 'neut-ash',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    const matches = targetRepo.listDiscoveryMatches(candidateA);
    expect(matches).toHaveLength(3);

    const evals = matches.map((m) => {
      const snap = oppRepo.getLatestSnapshot(opportunityId(m.opportunityId))!;
      const ev = evalRepo.getCurrentEvaluation(
        candidateA,
        snapshotId(snap.id),
      )!;
      const dec = evalRepo.getCurrentDecisionForEvaluation(
        evaluationId(ev.id),
      )!;
      return { ev, dec };
    });

    // ASSERTIONS: Eligibility, Fit, Quality, and Decision outcomes are IDENTICAL across ATS origins
    expect(evals[0]?.ev.eligibilityState).toBe(evals[1]?.ev.eligibilityState);
    expect(evals[1]?.ev.eligibilityState).toBe(evals[2]?.ev.eligibilityState);

    expect(evals[0]?.ev.fitLevel).toBe(evals[1]?.ev.fitLevel);
    expect(evals[1]?.ev.fitLevel).toBe(evals[2]?.ev.fitLevel);

    expect(evals[0]?.dec.priority).toBe(evals[1]?.dec.priority);
    expect(evals[1]?.dec.priority).toBe(evals[2]?.dec.priority);
  });

  it('5. MIGRATION & EXISTING GREENHOUSE COMPATIBILITY: pre-multi-source targets and listings map seamlessly', () => {
    // Create target without explicit sources array (simulating pre-multi-source database row)
    const legacyTarget = targetRepo.createSearchTarget(candidateA, {
      name: 'Legacy Greenhouse Target',
      targetRoles: ['Backend Engineer'],
    });

    expect(legacyTarget.sources).toHaveLength(1);
    expect(legacyTarget.sources[0]?.sourceSystem).toBe('greenhouse');
    expect(legacyTarget.sources[0]?.boardId).toBe('figma');
  });

  it('6. SOURCE CONFIG VALIDATION & SSRF SAFETY: invalid board identifiers and unsafe URLs fail or sanitize honestly', async () => {
    // Unsafe URL check
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(
      false,
    );
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('https://boards.greenhouse.io/figma/jobs/101')).toBe(
      true,
    );

    // Path traversal in boardId
    const targetBad = targetRepo.createSearchTarget(candidateA, {
      name: 'SSRF Target',
      sources: [{ sourceSystem: 'lever', boardId: '../../admin' }],
    });

    const runId = discoveryRunId('dr-ssrf');
    targetRepo.createDiscoveryRun(
      runId,
      candidateA,
      searchTargetId(targetBad.id),
      'lever',
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetBad.id,
        discoveryRunId: runId,
      },
      idempotencyKey: 'disc-ssrf',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    const runRecord = targetRepo.getDiscoveryRun(runId);
    expect(runRecord?.status).toBe('FAILED');
    expect(runRecord?.errorSummary).toContain('Invalid Lever site identifier');
  });

  it('7. FAILURE SEMANTICS: valid empty board completes clean; HTTP 500/network error fails honestly', async () => {
    // Test Valid Empty Board
    const targetEmpty = targetRepo.createSearchTarget(candidateA, {
      name: 'Empty Target',
      sources: [{ sourceSystem: 'ashby', boardId: 'empty-board' }],
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ jobs: [] }), { status: 200 }),
    );

    const runEmptyId = discoveryRunId('dr-empty');
    targetRepo.createDiscoveryRun(
      runEmptyId,
      candidateA,
      searchTargetId(targetEmpty.id),
      'ashby',
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetEmpty.id,
        discoveryRunId: runEmptyId,
      },
      idempotencyKey: 'disc-empty',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    const runEmpty = targetRepo.getDiscoveryRun(runEmptyId);
    expect(runEmpty?.status).toBe('COMPLETED');
    expect(runEmpty?.discoveredCount).toBe(0);
    expect(runEmpty?.errorSummary).toBeNull();

    // Test Network Error
    const targetNetworkErr = targetRepo.createSearchTarget(candidateA, {
      name: 'Network Error Target',
      sources: [{ sourceSystem: 'lever', boardId: 'network-down' }],
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Gateway Timeout', {
        status: 504,
        statusText: 'Gateway Timeout',
      }),
    );

    const runNetId = discoveryRunId('dr-net-err');
    targetRepo.createDiscoveryRun(
      runNetId,
      candidateA,
      searchTargetId(targetNetworkErr.id),
      'lever',
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetNetworkErr.id,
        discoveryRunId: runNetId,
      },
      idempotencyKey: 'disc-net-err',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    const runNet = targetRepo.getDiscoveryRun(runNetId);
    expect(runNet?.status).toBe('FAILED');
    expect(runNet?.errorSummary).toContain(
      'Lever API returned 504 Gateway Timeout',
    );
  });

  it('9. GREENHOUSE REGRESSION: existing Greenhouse search target executes through generalized discovery workflow', async () => {
    const targetGh = targetRepo.createSearchTarget(candidateA, {
      name: 'Greenhouse Reg Target',
      targetRoles: ['Backend Engineer'],
      sources: [{ sourceSystem: 'greenhouse', boardId: 'figma' }],
    });

    const ghFixture = {
      jobs: [
        {
          id: 999,
          absolute_url: 'https://boards.greenhouse.io/figma/jobs/999',
          title: 'Backend Engineer',
          location: { name: 'San Francisco, CA' },
          content: 'TypeScript engineer needed.',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(ghFixture), { status: 200 }),
    );

    const runId = discoveryRunId('dr-gh-reg');
    targetRepo.createDiscoveryRun(
      runId,
      candidateA,
      searchTargetId(targetGh.id),
      'greenhouse',
    );
    ledger.enqueue({
      taskType: 'discovery.run',
      payload: {
        candidateId: candidateA,
        searchTargetId: targetGh.id,
        discoveryRunId: runId,
      },
      idempotencyKey: 'disc-gh-reg',
    });
    while (await worker.runOnce(new Date())) {
      // Drain worker queue
    }

    const runRecord = targetRepo.getDiscoveryRun(runId);
    expect(runRecord?.status).toBe('COMPLETED');
    expect(runRecord?.discoveredCount).toBe(1);
    expect(runRecord?.acceptedCount).toBe(1);
  });
});
