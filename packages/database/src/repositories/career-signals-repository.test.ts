import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  candidateId,
  decisionId,
  discoveryMatchId,
  discoveryRunId,
  evaluationId,
  findingId,
  opportunityId,
  searchTargetId,
  snapshotId,
  type OpportunityId,
  type SnapshotId,
} from '@oca/domain';

import { openDatabase, type DatabaseHandle } from '../client.js';
import { applyMigrations } from '../migrate.js';
import { getTables } from '../schema-helper.js';
import { SourceListingRepository } from './source-listing-repository.js';
import { CandidateRepository } from './candidate-repository.js';
import { SearchTargetRepository } from './search-target-repository.js';
import { CareerSignalsRepository } from './career-signals-repository.js';
import { EvaluationRepository } from './evaluation-repository.js';
import { OpportunityRepository } from './opportunity-repository.js';

describe('CareerSignalsRepository', () => {
  let dbDir: string;
  let handle: DatabaseHandle;
  let repo: CareerSignalsRepository;
  let oppRepo: OpportunityRepository;
  let evalRepo: EvaluationRepository;
  let searchRepo: SearchTargetRepository;
  let candRepo: CandidateRepository;
  let sourceRepo: SourceListingRepository;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'oca-signals-test-'));
    handle = openDatabase(join(dbDir, 'test.db'));
    await applyMigrations(handle);
    repo = new CareerSignalsRepository(handle);
    oppRepo = new OpportunityRepository(handle);
    evalRepo = new EvaluationRepository(handle);
    searchRepo = new SearchTargetRepository(handle);
    candRepo = new CandidateRepository(handle);
    sourceRepo = new SourceListingRepository(handle);
  });

  afterEach(async () => {
    await handle.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('returns empty signals when candidate has no active discovered opportunities', async () => {
    const res = await repo.getCareerSignals(candidateId('cand-empty'));
    expect(res.activeOpportunityCount).toBe(0);
    expect(res.repeatedGaps).toHaveLength(0);
    expect(res.strongAlignments).toHaveLength(0);
  });

  it('INVARIANT 1: READ-ONLY NON-INTERFERENCE - query executes with zero mutations or side-effects', async () => {
    const cand = candidateId('cand-readonly');
    await candRepo.createCandidate(cand);
    const opp = opportunityId('opp-ro');
    await oppRepo.createOpportunity(opp);
    const snap = snapshotId('snap-ro');
    await oppRepo.appendSnapshot({
      id: snap,
      opportunityId: opp,
      title: 'Engineer',
      organization: 'Acme',
      content: 'Rust',
      fingerprint: 'fp-ro',
    });
    const sl = 'sl-ro';
    await sourceRepo.persistListing(
      sl,
      { sourceSystem: 'greenhouse', sourceExternalId: 'ext-ro' },
      opp,
    );
    const target = searchTargetId('t-ro');
    await searchRepo.createSearchTarget(cand, { name: 'T' }, target);
    const run = discoveryRunId('r-ro');
    await searchRepo.createDiscoveryRun(run, cand, target);
    await searchRepo.recordDiscoveryMatch({
      id: discoveryMatchId('m-ro'),
      discoveryRunId: run,
      searchTargetId: target,
      candidateId: cand,
      opportunityId: opp,
      sourceListingId: sl,
      matchReasons: ['query'],
      retainedUnresolved: [],
    });
    const ev = evaluationId('ev-ro');
    await evalRepo.persistEvaluation({
      id: ev,
      candidateId: cand,
      snapshotId: snap,
      eligibilityState: 'eligible',
    });

    const { candidateClaims, decisions, evaluations } = getTables(handle);
    const db = handle.db as any;

    const countBeforeClaims = (await db.select().from(candidateClaims)).length;
    const countBeforeDecisions = (await db.select().from(decisions)).length;
    const countBeforeEvals = (await db.select().from(evaluations)).length;

    // Execute signals query
    const res = await repo.getCareerSignals(cand);
    expect(res.activeOpportunityCount).toBe(1);

    const countAfterClaims = (await db.select().from(candidateClaims)).length;
    const countAfterDecisions = (await db.select().from(decisions)).length;
    const countAfterEvals = (await db.select().from(evaluations)).length;

    expect(countAfterClaims).toBe(countBeforeClaims);
    expect(countAfterDecisions).toBe(countBeforeDecisions);
    expect(countAfterEvals).toBe(countBeforeEvals);
  });

  it('INVARIANT 2: UNKNOWN / NO_EVIDENCE SEMANTICS - evidence not recorded wording', async () => {
    const cand = candidateId('cand-semantics');
    await candRepo.createCandidate(cand);

    for (let i = 1; i <= 2; i++) {
      const opp = opportunityId(`opp-sem-${i}`);
      const snap = snapshotId(`snap-sem-${i}`);
      await oppRepo.createOpportunity(opp);
      await oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: 'Engineer',
        organization: 'Acme',
        content: 'Python required',
        fingerprint: `fp-sem-${i}`,
      });
      const sl = `sl-sem-${i}`;
      await sourceRepo.persistListing(
        sl,
        { sourceSystem: 'greenhouse', sourceExternalId: `ext-sem-${i}` },
        opp,
      );
      const target = searchTargetId(`t-sem-${i}`);
      await searchRepo.createSearchTarget(cand, { name: 'T' }, target);
      const run = discoveryRunId(`r-sem-${i}`);
      await searchRepo.createDiscoveryRun(run, cand, target);
      await searchRepo.recordDiscoveryMatch({
        id: discoveryMatchId(`m-sem-${i}`),
        discoveryRunId: run,
        searchTargetId: target,
        candidateId: cand,
        opportunityId: opp,
        sourceListingId: sl,
        matchReasons: ['query'],
        retainedUnresolved: [],
      });
      const ev = evaluationId(`ev-sem-${i}`);
      await evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snap,
        eligibilityState: 'eligible',
      });
      await evalRepo.persistFinding({
        id: findingId(`f-sem-${i}`),
        evaluationId: ev,
        category: 'fit',
        dimensionKey: 'tech:python',
        label: 'Python',
        state: 'NO_EVIDENCE',
        summary: 'No evidence found in memory',
      });
    }

    const res = await repo.getCareerSignals(cand);
    expect(res.repeatedGaps).toHaveLength(1);
    expect(res.repeatedGaps[0]?.summary).toContain(
      'does not currently establish',
    );
    expect(res.evidenceGaps[0]?.summary).toContain('Evidence not recorded');
  });

  it('groups repeated gaps across multiple opportunities correctly', async () => {
    const cand = candidateId('cand-gaps');
    await candRepo.createCandidate(cand);

    for (let i = 1; i <= 3; i++) {
      const opp = opportunityId(`opp-gap-${i}`);
      const snap = snapshotId(`snap-gap-${i}`);
      await oppRepo.createOpportunity(opp);
      await oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: 'Engineer',
        organization: 'Acme',
        content: 'Go required',
        fingerprint: `fp-gap-${i}`,
      });
      const sl = `sl-gap-${i}`;
      await sourceRepo.persistListing(
        sl,
        { sourceSystem: 'greenhouse', sourceExternalId: `ext-gap-${i}` },
        opp,
      );
      const target = searchTargetId(`t-gap-${i}`);
      await searchRepo.createSearchTarget(cand, { name: 'T' }, target);
      const run = discoveryRunId(`r-gap-${i}`);
      await searchRepo.createDiscoveryRun(run, cand, target);
      await searchRepo.recordDiscoveryMatch({
        id: discoveryMatchId(`m-gap-${i}`),
        discoveryRunId: run,
        searchTargetId: target,
        candidateId: cand,
        opportunityId: opp,
        sourceListingId: sl,
        matchReasons: ['query'],
        retainedUnresolved: [],
      });
      const ev = evaluationId(`ev-gap-${i}`);
      await evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snap,
        eligibilityState: 'eligible',
      });
      await evalRepo.persistFinding({
        id: findingId(`f-gap-${i}`),
        evaluationId: ev,
        category: 'fit',
        dimensionKey: 'tech:go',
        label: 'Go',
        state: 'GAP',
        summary: 'Go gap',
      });
    }

    const res = await repo.getCareerSignals(cand);
    expect(res.repeatedGaps).toHaveLength(1);
    expect(res.repeatedGaps[0]?.affectedOpportunityCount).toBe(3);
  });

  it('groups strong alignments correctly', async () => {
    const cand = candidateId('cand-align');
    await candRepo.createCandidate(cand);

    for (let i = 1; i <= 2; i++) {
      const opp = opportunityId(`opp-align-${i}`);
      const snap = snapshotId(`snap-align-${i}`);
      await oppRepo.createOpportunity(opp);
      await oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: 'Engineer',
        organization: 'Acme',
        content: 'TS required',
        fingerprint: `fp-align-${i}`,
      });
      const sl = `sl-align-${i}`;
      await sourceRepo.persistListing(
        sl,
        { sourceSystem: 'greenhouse', sourceExternalId: `ext-align-${i}` },
        opp,
      );
      const target = searchTargetId(`t-align-${i}`);
      await searchRepo.createSearchTarget(cand, { name: 'T' }, target);
      const run = discoveryRunId(`r-align-${i}`);
      await searchRepo.createDiscoveryRun(run, cand, target);
      await searchRepo.recordDiscoveryMatch({
        id: discoveryMatchId(`m-align-${i}`),
        discoveryRunId: run,
        searchTargetId: target,
        candidateId: cand,
        opportunityId: opp,
        sourceListingId: sl,
        matchReasons: ['query'],
        retainedUnresolved: [],
      });
      const ev = evaluationId(`ev-align-${i}`);
      await evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snap,
        eligibilityState: 'eligible',
      });
      await evalRepo.persistFinding({
        id: findingId(`f-align-${i}`),
        evaluationId: ev,
        category: 'fit',
        dimensionKey: 'tech:typescript',
        label: 'TypeScript',
        state: 'STRONG_MATCH',
        summary: 'TypeScript strong',
      });
    }

    const res = await repo.getCareerSignals(cand);
    expect(res.strongAlignments).toHaveLength(1);
    expect(res.strongAlignments[0]?.affectedOpportunityCount).toBe(2);
  });

  it('groups eligibility uncertainties correctly', async () => {
    const cand = candidateId('cand-uncert');
    await candRepo.createCandidate(cand);

    for (let i = 1; i <= 2; i++) {
      const opp = opportunityId(`opp-uncert-${i}`);
      const snap = snapshotId(`snap-uncert-${i}`);
      await oppRepo.createOpportunity(opp);
      await oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: 'Engineer',
        organization: 'Acme',
        content: 'US Auth required',
        fingerprint: `fp-uncert-${i}`,
      });
      const sl = `sl-uncert-${i}`;
      await sourceRepo.persistListing(
        sl,
        { sourceSystem: 'greenhouse', sourceExternalId: `ext-uncert-${i}` },
        opp,
      );
      const target = searchTargetId(`t-uncert-${i}`);
      await searchRepo.createSearchTarget(cand, { name: 'T' }, target);
      const run = discoveryRunId(`r-uncert-${i}`);
      await searchRepo.createDiscoveryRun(run, cand, target);
      await searchRepo.recordDiscoveryMatch({
        id: discoveryMatchId(`m-uncert-${i}`),
        discoveryRunId: run,
        searchTargetId: target,
        candidateId: cand,
        opportunityId: opp,
        sourceListingId: sl,
        matchReasons: ['query'],
        retainedUnresolved: [],
      });
      const ev = evaluationId(`ev-uncert-${i}`);
      await evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snap,
        eligibilityState: 'investigate',
      });
      await evalRepo.persistFinding({
        id: findingId(`f-uncert-${i}`),
        evaluationId: ev,
        category: 'eligibility',
        dimensionKey: 'req:work_authorization:us',
        label: 'US Work Auth',
        state: 'INVESTIGATE',
        summary: 'Work auth unresolved',
      });
    }

    const res = await repo.getCareerSignals(cand);
    expect(res.eligibilityUncertainties).toHaveLength(1);
    expect(res.eligibilityUncertainties[0]?.affectedOpportunityCount).toBe(2);
  });

  it('aggregates source breakdown correctly across multi-source listings', async () => {
    const cand = candidateId('cand-multi-source');
    await candRepo.createCandidate(cand);

    const sources = ['greenhouse', 'greenhouse', 'lever', 'lever', 'ashby'];
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]!;
      const opp = opportunityId(`opp-src-${i}`);
      const snap = snapshotId(`snap-src-${i}`);
      await oppRepo.createOpportunity(opp);
      await oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: 'Engineer',
        organization: 'Acme',
        content: 'K8s required',
        fingerprint: `fp-src-${i}`,
      });
      const sl = `sl-src-${i}`;
      await sourceRepo.persistListing(
        sl,
        { sourceSystem: src, sourceExternalId: `ext-src-${i}` },
        opp,
      );
      const target = searchTargetId(`t-src-${i}`);
      await searchRepo.createSearchTarget(cand, { name: 'T' }, target);
      const run = discoveryRunId(`r-src-${i}`);
      await searchRepo.createDiscoveryRun(run, cand, target);
      await searchRepo.recordDiscoveryMatch({
        id: discoveryMatchId(`m-src-${i}`),
        discoveryRunId: run,
        searchTargetId: target,
        candidateId: cand,
        opportunityId: opp,
        sourceListingId: sl,
        matchReasons: ['query'],
        retainedUnresolved: [],
      });
      const ev = evaluationId(`ev-src-${i}`);
      await evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snap,
        eligibilityState: 'eligible',
      });
      await evalRepo.persistFinding({
        id: findingId(`f-src-${i}`),
        evaluationId: ev,
        category: 'fit',
        dimensionKey: 'tech:kubernetes',
        label: 'Kubernetes',
        state: 'NO_EVIDENCE',
        summary: 'K8s evidence missing',
      });
    }

    const res = await repo.getCareerSignals(cand);
    const k8sSignal = res.repeatedGaps.find(
      (g) => g.dimensionKey === 'tech:kubernetes',
    );
    expect(k8sSignal).toBeDefined();

    expect(k8sSignal?.sourceBreakdown).toEqual({
      greenhouse: 2,
      lever: 2,
      ashby: 1,
    });

    expect(k8sSignal?.affectedOpportunityCount).toBe(5);
    expect(k8sSignal?.sampleOpportunities).toHaveLength(3);
  });

  it('INVARIANT 15: COMPREHENSIVE E2E DETERMINISTIC FIXTURE (9 Opportunities across Greenhouse, Lever, Ashby)', async () => {
    const cand = candidateId('cand-fixture-e2e');
    await candRepo.createCandidate(cand);

    const sources = [
      'greenhouse',
      'greenhouse',
      'greenhouse',
      'lever',
      'lever',
      'lever',
      'ashby',
      'ashby',
      'ashby',
    ];

    const oppIds: OpportunityId[] = [];
    const snapIds: SnapshotId[] = [];

    const target1 = searchTargetId('t-main');
    await searchRepo.createSearchTarget(cand, { name: 'Main Target' }, target1);
    const run1 = discoveryRunId('r-main');
    await searchRepo.createDiscoveryRun(run1, cand, target1);

    for (let i = 1; i <= 9; i++) {
      const opp = opportunityId(`opp-fix-${i}`);
      const snap = snapshotId(`snap-fix-${i}`);
      oppIds.push(opp);
      snapIds.push(snap);

      await oppRepo.createOpportunity(opp);
      await oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: `Role ${i}`,
        organization: `Company ${((i - 1) % 3) + 1}`,
        content: `Content ${i}`,
        fingerprint: `fp-fix-${i}`,
      });

      const sl = `sl-fix-${i}`;
      await sourceRepo.persistListing(
        sl,
        { sourceSystem: sources[i - 1]!, sourceExternalId: `ext-fix-${i}` },
        opp,
      );

      await searchRepo.recordDiscoveryMatch({
        id: discoveryMatchId(`m-fix-${i}`),
        discoveryRunId: run1,
        searchTargetId: target1,
        candidateId: cand,
        opportunityId: opp,
        sourceListingId: sl,
        matchReasons: ['query'],
        retainedUnresolved: [],
      });
    }

    const target2 = searchTargetId('t-dupe');
    await searchRepo.createSearchTarget(cand, { name: 'Dupe Target' }, target2);
    const run2 = discoveryRunId('r-dupe');
    await searchRepo.createDiscoveryRun(run2, cand, target2);
    await searchRepo.recordDiscoveryMatch({
      id: discoveryMatchId('m-fix-1-dupe'),
      discoveryRunId: run2,
      searchTargetId: target2,
      candidateId: cand,
      opportunityId: oppIds[0]!,
      sourceListingId: 'sl-fix-1',
      matchReasons: ['query'],
      retainedUnresolved: [],
    });

    const { decisions, evaluations } = getTables(handle);
    const db = handle.db as any;

    const evClosed = evaluationId('ev-fix-9');
    await evalRepo.persistEvaluation({
      id: evClosed,
      candidateId: cand,
      snapshotId: snapIds[8]!,
      eligibilityState: 'ineligible',
    });
    await db.insert(decisions).values({
      id: decisionId('dec-fix-9'),
      evaluationId: evClosed,
      candidateId: cand,
      snapshotId: snapIds[8]!,
      priority: 'blocked',
      explanation: 'Listing confirmed closed',
      eligibilityInputFingerprint: 'fp-e',
      fitInputFingerprint: 'fp-f',
      qualityInputFingerprint: 'fp-q',
      reasonCodes: JSON.stringify(['LISTING_CLOSED']),
      createdAt: new Date(),
    });

    const evOld2 = evaluationId('ev-fix-2-old');
    await evalRepo.persistEvaluation({
      id: evOld2,
      candidateId: cand,
      snapshotId: snapIds[1]!,
      eligibilityState: 'eligible',
    });
    await evalRepo.persistFinding({
      id: findingId('f-fix-2-old'),
      evaluationId: evOld2,
      category: 'fit',
      dimensionKey: 'tech:python',
      label: 'Python',
      state: 'GAP',
      summary: 'Old Python gap',
    });
    await db
      .update(evaluations)
      .set({ supersededAt: new Date() })
      .where(eq(evaluations.id, evOld2));

    for (let i = 1; i <= 8; i++) {
      const ev = evaluationId(`ev-fix-${i}`);
      await evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snapIds[i - 1]!,
        eligibilityState: i <= 5 ? 'investigate' : 'eligible',
      });

      if (i <= 7) {
        await evalRepo.persistFinding({
          id: findingId(`f-node-${i}`),
          evaluationId: ev,
          category: 'fit',
          dimensionKey: 'tech:nodejs',
          label: 'Node.js',
          state: 'STRONG_MATCH',
          summary: 'Node.js strong match',
          modality: 'required',
        });
      }

      if (i <= 6) {
        await evalRepo.persistFinding({
          id: findingId(`f-aws-${i}`),
          evaluationId: ev,
          category: 'fit',
          dimensionKey: 'tech:aws',
          label: 'AWS',
          state: 'STRONG_MATCH',
          summary: 'AWS strong match',
          modality: 'required',
        });
      }

      if (i <= 5) {
        await evalRepo.persistFinding({
          id: findingId(`f-k8s-${i}`),
          evaluationId: ev,
          category: 'fit',
          dimensionKey: 'tech:kubernetes',
          label: 'Kubernetes',
          state: 'NO_EVIDENCE',
          summary: 'K8s evidence missing',
          modality: 'required',
        });
      }

      if (i >= 6 && i <= 8) {
        await evalRepo.persistFinding({
          id: findingId(`f-tf-${i}`),
          evaluationId: ev,
          category: 'fit',
          dimensionKey: 'tech:terraform',
          label: 'Terraform',
          state: 'NO_EVIDENCE',
          summary: 'Terraform evidence missing',
          modality: 'preferred',
        });
      }

      if (i <= 3) {
        await evalRepo.persistFinding({
          id: findingId(`f-us-${i}`),
          evaluationId: ev,
          category: 'eligibility',
          dimensionKey: 'req:work_authorization:us',
          label: 'US Work Authorization',
          state: 'INVESTIGATE',
          summary: 'US work auth unresolved',
        });
      }

      if (i >= 4 && i <= 5) {
        await evalRepo.persistFinding({
          id: findingId(`f-de-${i}`),
          evaluationId: ev,
          category: 'eligibility',
          dimensionKey: 'req:language:de',
          label: 'German Language',
          state: 'INVESTIGATE',
          summary: 'German language unresolved',
        });
      }
    }

    const res = await repo.getCareerSignals(cand);

    expect(res.activeOpportunityCount).toBe(8);

    const nodeSignal = res.strongAlignments.find(
      (a) => a.dimensionKey === 'tech:nodejs',
    );
    expect(nodeSignal).toBeDefined();
    expect(nodeSignal?.affectedOpportunityCount).toBe(7);

    const awsSignal = res.strongAlignments.find(
      (a) => a.dimensionKey === 'tech:aws',
    );
    expect(awsSignal).toBeDefined();
    expect(awsSignal?.affectedOpportunityCount).toBe(6);

    const k8sSignal = res.repeatedGaps.find(
      (g) => g.dimensionKey === 'tech:kubernetes',
    );
    expect(k8sSignal).toBeDefined();
    expect(k8sSignal?.affectedOpportunityCount).toBe(5);

    const tfSignal = res.repeatedGaps.find(
      (g) => g.dimensionKey === 'tech:terraform',
    );
    expect(tfSignal).toBeDefined();
    expect(tfSignal?.affectedOpportunityCount).toBe(3);
    expect(tfSignal?.preferredCount).toBe(3);

    const usSig = res.eligibilityUncertainties.find(
      (u) => u.dimensionKey === 'req:work_authorization:us',
    );
    expect(usSig).toBeDefined();
    expect(usSig?.affectedOpportunityCount).toBe(3);

    const deSig = res.eligibilityUncertainties.find(
      (u) => u.dimensionKey === 'req:language:de',
    );
    expect(deSig).toBeDefined();
    expect(deSig?.affectedOpportunityCount).toBe(2);

    expect(
      res.repeatedGaps.find((g) => g.dimensionKey === 'tech:python'),
    ).toBeUndefined();

    expect(
      res.repeatedGaps.find((g) => g.dimensionKey === 'tech:azure'),
    ).toBeUndefined();
    expect(
      res.repeatedGaps.find((g) => g.dimensionKey === 'tech:gcp'),
    ).toBeUndefined();
  });
});
