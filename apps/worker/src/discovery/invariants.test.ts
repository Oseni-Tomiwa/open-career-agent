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
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDecisionHandlers } from '../decision/workflow.js';
import { createEligibilityHandlers } from '../eligibility/workflow.js';
import { createFitHandlers } from '../fit/workflow.js';
import { createQualityHandlers } from '../quality/workflow.js';
import { BackgroundWorker } from '../worker.js';
import { createDiscoveryHandlers } from './workflow.js';
import { isSafeHttpUrl } from '@oca/sources';

describe('Multi-Source Discovery V1 Invariants Audit', () => {
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

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-inv-worker-test-'));
    db = openDatabase(join(directory, 'test.sqlite'));
    await applyMigrations(db);

    ledger = new BackgroundTaskLedger(db);
    targetRepo = new SearchTargetRepository(db);
    candRepo = new CandidateRepository(db);
    oppRepo = new OpportunityRepository(db);
    evalRepo = new EvaluationRepository(db);
    sourceRepo = new SourceListingRepository(db);

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
      workerId: 'test-worker-inv',
      pollIntervalMs: 50,
      leaseDurationMs: 5000,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('1. SAME-SOURCE IDEMPOTENCY: repeated discovery reuses listing identity and avoids duplicate canonical opportunities or discovery matches', async () => {
    const target = await targetRepo.createSearchTarget(candidateA, {
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

    const run1 = discoveryRunId('dr-idem-1');
    await targetRepo.createDiscoveryRun(
      run1,
      candidateA,
      searchTargetId(target.id),
      'lever',
    );
    await ledger.enqueue({
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

    const run2 = discoveryRunId('dr-idem-2');
    await targetRepo.createDiscoveryRun(
      run2,
      candidateA,
      searchTargetId(target.id),
      'lever',
    );
    await ledger.enqueue({
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

    const summaries = await oppRepo.getOpportunitySummaries();
    expect(summaries).toHaveLength(1);

    const listing = await sourceRepo.findListingByExternalId(
      'lever',
      'lever-idem-100',
    );
    expect(listing).not.toBeNull();

    const obsList = await sourceRepo.listObservationsForListing(listing!.id);
    expect(obsList.length).toBeGreaterThanOrEqual(1);

    const matches = await targetRepo.listDiscoveryMatches(candidateA);
    expect(matches).toHaveLength(1);
  });

  it('2. CROSS-SOURCE NON-MERGING: weakly similar roles from Greenhouse and Lever remain separate canonical Opportunities', async () => {
    const target = await targetRepo.createSearchTarget(candidateA, {
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
    await targetRepo.createDiscoveryRun(
      runId,
      candidateA,
      searchTargetId(target.id),
    );
    await ledger.enqueue({
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

    const summaries = await oppRepo.getOpportunitySummaries();
    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.id).not.toBe(summaries[1]?.id);
  });

  it('3. MULTI-CANDIDATE SAME SOURCE LISTING: two candidates discovering exact same listing share ONE Opportunity with TWO candidate matches and independent evaluations', async () => {
    const targetA = await targetRepo.createSearchTarget(candidateA, {
      name: 'Target A',
      targetRoles: ['Frontend Engineer'],
      sources: [{ sourceSystem: 'ashby', boardId: 'linear' }],
    });

    const targetB = await targetRepo.createSearchTarget(candidateB, {
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

    const runA = discoveryRunId('dr-shared-cand-a');
    await targetRepo.createDiscoveryRun(
      runA,
      candidateA,
      searchTargetId(targetA.id),
      'ashby',
    );
    await ledger.enqueue({
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

    const runB = discoveryRunId('dr-shared-cand-b');
    await targetRepo.createDiscoveryRun(
      runB,
      candidateB,
      searchTargetId(targetB.id),
      'ashby',
    );
    await ledger.enqueue({
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

    const summaries = await oppRepo.getOpportunitySummaries();
    expect(summaries).toHaveLength(1);

    const matchesA = await targetRepo.listDiscoveryMatches(candidateA);
    const matchesB = await targetRepo.listDiscoveryMatches(candidateB);
    expect(matchesA).toHaveLength(1);
    expect(matchesB).toHaveLength(1);
    expect(matchesA[0]?.opportunityId).toBe(matchesB[0]?.opportunityId);
    expect(matchesA[0]?.candidateId).toBe(candidateA);
    expect(matchesB[0]?.candidateId).toBe(candidateB);

    const oppId = opportunityId(summaries[0]!.id);
    const snap = (await oppRepo.getLatestSnapshot(oppId))!;

    const evalA = await evalRepo.getCurrentEvaluation(
      candidateA,
      snapshotId(snap.id),
    );
    const evalB = await evalRepo.getCurrentEvaluation(
      candidateB,
      snapshotId(snap.id),
    );
    expect(evalA).not.toBeNull();
    expect(evalB).not.toBeNull();
    expect(evalA?.id).not.toBe(evalB?.id);
  });

  it('4. INTELLIGENCE SOURCE NEUTRALITY: equivalent snapshots from Greenhouse, Lever, and Ashby yield identical Eligibility, Fit, and Decision outcomes', async () => {
    const targetGh = await targetRepo.createSearchTarget(candidateA, {
      name: 'Greenhouse Target',
      targetRoles: ['Software Engineer'],
      sources: [{ sourceSystem: 'greenhouse', boardId: 'co-gh' }],
    });
    const targetLev = await targetRepo.createSearchTarget(candidateA, {
      name: 'Lever Target',
      targetRoles: ['Software Engineer'],
      sources: [{ sourceSystem: 'lever', boardId: 'co-lev' }],
    });
    const targetAsh = await targetRepo.createSearchTarget(candidateA, {
      name: 'Ashby Target',
      targetRoles: ['Software Engineer'],
      sources: [{ sourceSystem: 'ashby', boardId: 'co-ash' }],
    });

    const jobTitle = 'Staff Software Engineer';
    const org = 'Core Platform';
    const content = 'TypeScript and Distributed Systems experience required.';
    const location = 'Remote';

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

    const runGh = discoveryRunId('dr-neut-gh');
    await targetRepo.createDiscoveryRun(
      runGh,
      candidateA,
      searchTargetId(targetGh.id),
    );
    await ledger.enqueue({
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

    const runLev = discoveryRunId('dr-neut-lev');
    await targetRepo.createDiscoveryRun(
      runLev,
      candidateA,
      searchTargetId(targetLev.id),
    );
    await ledger.enqueue({
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

    const runAsh = discoveryRunId('dr-neut-ash');
    await targetRepo.createDiscoveryRun(
      runAsh,
      candidateA,
      searchTargetId(targetAsh.id),
    );
    await ledger.enqueue({
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

    const matches = await targetRepo.listDiscoveryMatches(candidateA);
    expect(matches).toHaveLength(3);

    const evals = await Promise.all(
      matches.map(async (m) => {
        const snap = (await oppRepo.getLatestSnapshot(
          opportunityId(m.opportunityId),
        ))!;
        const ev = (await evalRepo.getCurrentEvaluation(
          candidateA,
          snapshotId(snap.id),
        ))!;
        const dec = (await evalRepo.getCurrentDecisionForEvaluation(
          evaluationId(ev.id),
        ))!;
        return { ev, dec };
      }),
    );

    expect(evals[0]?.ev.eligibilityState).toBe(evals[1]?.ev.eligibilityState);
    expect(evals[1]?.ev.eligibilityState).toBe(evals[2]?.ev.eligibilityState);

    expect(evals[0]?.ev.fitLevel).toBe(evals[1]?.ev.fitLevel);
    expect(evals[1]?.ev.fitLevel).toBe(evals[2]?.ev.fitLevel);

    expect(evals[0]?.dec.priority).toBe(evals[1]?.dec.priority);
    expect(evals[1]?.dec.priority).toBe(evals[2]?.dec.priority);
  });

  it('5. MIGRATION & EXISTING GREENHOUSE COMPATIBILITY: pre-multi-source targets and listings map seamlessly', async () => {
    const legacyTarget = await targetRepo.createSearchTarget(candidateA, {
      name: 'Legacy Greenhouse Target',
      targetRoles: ['Backend Engineer'],
    });

    expect(legacyTarget.sources).toHaveLength(1);
    expect(legacyTarget.sources[0]?.sourceSystem).toBe('greenhouse');
    expect(legacyTarget.sources[0]?.boardId).toBe('figma');
  });

  it('6. SOURCE CONFIG VALIDATION & SSRF SAFETY: invalid board identifiers and unsafe URLs fail or sanitize honestly', async () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(
      false,
    );
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('https://boards.greenhouse.io/figma/jobs/101')).toBe(
      true,
    );

    const targetBad = await targetRepo.createSearchTarget(candidateA, {
      name: 'SSRF Target',
      sources: [{ sourceSystem: 'lever', boardId: '../../admin' }],
    });

    const runId = discoveryRunId('dr-ssrf');
    await targetRepo.createDiscoveryRun(
      runId,
      candidateA,
      searchTargetId(targetBad.id),
      'lever',
    );
    await ledger.enqueue({
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

    const runRecord = await targetRepo.getDiscoveryRun(runId);
    expect(runRecord?.status).toBe('FAILED');
    expect(runRecord?.errorSummary).toContain('Invalid Lever site identifier');
  });

  it('7. FAILURE SEMANTICS: valid empty board completes clean; HTTP 500/network error fails honestly', async () => {
    const targetEmpty = await targetRepo.createSearchTarget(candidateA, {
      name: 'Empty Target',
      sources: [{ sourceSystem: 'ashby', boardId: 'empty-board' }],
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ jobs: [] }), { status: 200 }),
    );

    const runEmptyId = discoveryRunId('dr-empty');
    await targetRepo.createDiscoveryRun(
      runEmptyId,
      candidateA,
      searchTargetId(targetEmpty.id),
      'ashby',
    );
    await ledger.enqueue({
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

    const runEmpty = await targetRepo.getDiscoveryRun(runEmptyId);
    expect(runEmpty?.status).toBe('COMPLETED');
    expect(runEmpty?.discoveredCount).toBe(0);
    expect(runEmpty?.errorSummary).toBeNull();

    const targetNetworkErr = await targetRepo.createSearchTarget(candidateA, {
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
    await targetRepo.createDiscoveryRun(
      runNetId,
      candidateA,
      searchTargetId(targetNetworkErr.id),
      'lever',
    );
    await ledger.enqueue({
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

    const runNet = await targetRepo.getDiscoveryRun(runNetId);
    expect(runNet?.status).toBe('FAILED');
    expect(runNet?.errorSummary).toContain(
      'Lever API returned 504 Gateway Timeout',
    );
  });

  it('9. GREENHOUSE REGRESSION: existing Greenhouse search target executes through generalized discovery workflow', async () => {
    const targetGh = await targetRepo.createSearchTarget(candidateA, {
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
    await targetRepo.createDiscoveryRun(
      runId,
      candidateA,
      searchTargetId(targetGh.id),
      'greenhouse',
    );
    await ledger.enqueue({
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

    const runRecord = await targetRepo.getDiscoveryRun(runId);
    expect(runRecord?.status).toBe('COMPLETED');
    expect(runRecord?.discoveredCount).toBe(1);
    expect(runRecord?.acceptedCount).toBe(1);
  });
});
