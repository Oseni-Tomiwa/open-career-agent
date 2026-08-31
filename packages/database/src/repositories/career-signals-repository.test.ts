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
import { candidateClaims, decisions, evaluations } from '../schema.js';
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

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'oca-signals-test-'));
    handle = openDatabase(join(dbDir, 'test.db'));
    applyMigrations(handle);
    repo = new CareerSignalsRepository(handle);
    oppRepo = new OpportunityRepository(handle);
    evalRepo = new EvaluationRepository(handle);
    searchRepo = new SearchTargetRepository(handle);
    candRepo = new CandidateRepository(handle);
    sourceRepo = new SourceListingRepository(handle);
  });

  afterEach(() => {
    handle.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('returns empty signals when candidate has no active discovered opportunities', () => {
    const res = repo.getCareerSignals(candidateId('cand-empty'));
    expect(res.activeOpportunityCount).toBe(0);
    expect(res.repeatedGaps).toHaveLength(0);
    expect(res.strongAlignments).toHaveLength(0);
  });

  it('INVARIANT 1: READ-ONLY NON-INTERFERENCE - query executes with zero mutations or side-effects', () => {
    const cand = candidateId('cand-readonly');
    candRepo.createCandidate(cand);
    const opp = opportunityId('opp-ro');
    oppRepo.createOpportunity(opp);
    const snap = snapshotId('snap-ro');
    oppRepo.appendSnapshot({
      id: snap,
      opportunityId: opp,
      title: 'Engineer',
      organization: 'Acme',
      content: 'Rust',
      fingerprint: 'fp-ro',
    });
    const sl = 'sl-ro';
    sourceRepo.persistListing(
      sl,
      { sourceSystem: 'greenhouse', sourceExternalId: 'ext-ro' },
      opp,
    );
    const target = searchTargetId('t-ro');
    searchRepo.createSearchTarget(cand, { name: 'T' }, target);
    const run = discoveryRunId('r-ro');
    searchRepo.createDiscoveryRun(run, cand, target);
    searchRepo.recordDiscoveryMatch({
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
    evalRepo.persistEvaluation({
      id: ev,
      candidateId: cand,
      snapshotId: snap,
      eligibilityState: 'eligible',
    });

    const countBeforeClaims = handle.db
      .select()
      .from(candidateClaims)
      .all().length;
    const countBeforeDecisions = handle.db
      .select()
      .from(decisions)
      .all().length;
    const countBeforeEvals = handle.db.select().from(evaluations).all().length;

    // Execute signals query
    const res = repo.getCareerSignals(cand);
    expect(res.activeOpportunityCount).toBe(1);

    const countAfterClaims = handle.db
      .select()
      .from(candidateClaims)
      .all().length;
    const countAfterDecisions = handle.db.select().from(decisions).all().length;
    const countAfterEvals = handle.db.select().from(evaluations).all().length;

    expect(countAfterClaims).toBe(countBeforeClaims);
    expect(countAfterDecisions).toBe(countBeforeDecisions);
    expect(countAfterEvals).toBe(countBeforeEvals);
  });

  it('INVARIANT 2: UNKNOWN / NO_EVIDENCE SEMANTICS - evidence not recorded wording', () => {
    const cand = candidateId('cand-semantics');
    candRepo.createCandidate(cand);

    for (let i = 1; i <= 2; i++) {
      const opp = opportunityId(`opp-sem-${i}`);
      const snap = snapshotId(`snap-sem-${i}`);
      oppRepo.createOpportunity(opp);
      oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: `Role ${i}`,
        organization: 'Acme',
        content: 'Docker',
        fingerprint: `fp-sem-${i}`,
      });
      const sl = `sl-sem-${i}`;
      sourceRepo.persistListing(
        sl,
        { sourceSystem: 'greenhouse', sourceExternalId: `ext-sem-${i}` },
        opp,
      );
      const target = searchTargetId(`t-sem-${i}`);
      searchRepo.createSearchTarget(cand, { name: 'T' }, target);
      const run = discoveryRunId(`r-sem-${i}`);
      searchRepo.createDiscoveryRun(run, cand, target);
      searchRepo.recordDiscoveryMatch({
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
      evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snap,
        eligibilityState: 'eligible',
      });
      evalRepo.persistFinding({
        id: findingId(`f-sem-${i}`),
        evaluationId: ev,
        category: 'fit',
        dimensionKey: 'tech:docker',
        label: 'Docker',
        state: 'NO_EVIDENCE',
        summary: 'No Docker evidence in memory',
        modality: 'required',
      });
    }

    const res = repo.getCareerSignals(cand);
    const gapSignal = res.repeatedGaps.find(
      (g) => g.dimensionKey === 'tech:docker',
    );
    expect(gapSignal).toBeDefined();
    // Must use evidence not established wording, never "lacks" or "cannot"
    expect(gapSignal?.summary).toContain(
      'Career Memory does not currently establish Docker evidence',
    );
    expect(gapSignal?.summary).not.toContain('candidate lacks');
    expect(gapSignal?.summary).not.toContain('cannot');

    const evGapSignal = res.evidenceGaps.find(
      (g) => g.dimensionKey === 'tech:docker',
    );
    expect(evGapSignal).toBeDefined();
    expect(evGapSignal?.summary).toContain(
      'Evidence not recorded in Career Memory for Docker',
    );
    expect(evGapSignal?.summary).not.toContain('lacks');
  });

  it('INVARIANT 3: ALTERNATIVE GROUP SAFETY - satisfied AWS alternative does not emit Azure/GCP gaps', () => {
    const cand = candidateId('cand-alt-group');
    candRepo.createCandidate(cand);

    for (let i = 1; i <= 2; i++) {
      const opp = opportunityId(`opp-alt-${i}`);
      const snap = snapshotId(`snap-alt-${i}`);
      oppRepo.createOpportunity(opp);
      oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: `Cloud Role ${i}`,
        organization: 'Acme',
        content: 'AWS or Azure or GCP',
        fingerprint: `fp-alt-${i}`,
      });
      const sl = `sl-alt-${i}`;
      sourceRepo.persistListing(
        sl,
        { sourceSystem: 'lever', sourceExternalId: `ext-alt-${i}` },
        opp,
      );
      const target = searchTargetId(`t-alt-${i}`);
      searchRepo.createSearchTarget(cand, { name: 'T' }, target);
      const run = discoveryRunId(`r-alt-${i}`);
      searchRepo.createDiscoveryRun(run, cand, target);
      searchRepo.recordDiscoveryMatch({
        id: discoveryMatchId(`m-alt-${i}`),
        discoveryRunId: run,
        searchTargetId: target,
        candidateId: cand,
        opportunityId: opp,
        sourceListingId: sl,
        matchReasons: ['query'],
        retainedUnresolved: [],
      });
      const ev = evaluationId(`ev-alt-${i}`);
      evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snap,
        eligibilityState: 'eligible',
      });
      // Single satisfied alternative finding persisted by Fit V1
      evalRepo.persistFinding({
        id: findingId(`f-aws-${i}`),
        evaluationId: ev,
        category: 'fit',
        dimensionKey: 'tech:aws',
        label: 'AWS (Cloud Provider)',
        state: 'STRONG_MATCH',
        summary: 'AWS satisfies cloud provider requirement',
        modality: 'required',
      });
    }

    const res = repo.getCareerSignals(cand);
    // AWS strong alignment emitted
    expect(
      res.strongAlignments.find((a) => a.dimensionKey === 'tech:aws'),
    ).toBeDefined();
    // Azure or GCP gap MUST NOT be emitted
    expect(
      res.repeatedGaps.find((g) => g.dimensionKey === 'tech:azure'),
    ).toBeUndefined();
    expect(
      res.repeatedGaps.find((g) => g.dimensionKey === 'tech:gcp'),
    ).toBeUndefined();
  });

  it('INVARIANT 7: ELIGIBILITY SCOPE PRESERVATION - US vs Germany work auth aggregate separately', () => {
    const cand = candidateId('cand-elig-scope');
    candRepo.createCandidate(cand);

    for (let i = 1; i <= 2; i++) {
      const opp = opportunityId(`opp-scope-${i}`);
      const snap = snapshotId(`snap-scope-${i}`);
      oppRepo.createOpportunity(opp);
      oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: `Role ${i}`,
        organization: 'Acme',
        content: 'Work Auth',
        fingerprint: `fp-scope-${i}`,
      });
      const sl = `sl-scope-${i}`;
      sourceRepo.persistListing(
        sl,
        { sourceSystem: 'ashby', sourceExternalId: `ext-scope-${i}` },
        opp,
      );
      const target = searchTargetId(`t-scope-${i}`);
      searchRepo.createSearchTarget(cand, { name: 'T' }, target);
      const run = discoveryRunId(`r-scope-${i}`);
      searchRepo.createDiscoveryRun(run, cand, target);
      searchRepo.recordDiscoveryMatch({
        id: discoveryMatchId(`m-scope-${i}`),
        discoveryRunId: run,
        searchTargetId: target,
        candidateId: cand,
        opportunityId: opp,
        sourceListingId: sl,
        matchReasons: ['query'],
        retainedUnresolved: [],
      });
      const ev = evaluationId(`ev-scope-${i}`);
      evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snap,
        eligibilityState: 'investigate',
      });
      evalRepo.persistFinding({
        id: findingId(`f-us-${i}`),
        evaluationId: ev,
        category: 'eligibility',
        dimensionKey: 'req:work_authorization:us',
        label: 'US Work Authorization',
        state: 'INVESTIGATE',
        summary: 'US work auth unresolved',
      });
      evalRepo.persistFinding({
        id: findingId(`f-de-${i}`),
        evaluationId: ev,
        category: 'eligibility',
        dimensionKey: 'req:work_authorization:de',
        label: 'Germany Work Authorization',
        state: 'INVESTIGATE',
        summary: 'Germany work auth unresolved',
      });
    }

    const res = repo.getCareerSignals(cand);
    const usSig = res.eligibilityUncertainties.find(
      (u) => u.dimensionKey === 'req:work_authorization:us',
    );
    const deSig = res.eligibilityUncertainties.find(
      (u) => u.dimensionKey === 'req:work_authorization:de',
    );

    expect(usSig).toBeDefined();
    expect(deSig).toBeDefined();
    expect(usSig?.label).toBe('US Work Authorization');
    expect(deSig?.label).toBe('Germany Work Authorization');
  });

  it('INVARIANT 9 & 13: SOURCE NEUTRALITY & BOUNDED SAMPLES', () => {
    const cand = candidateId('cand-src-bound');
    candRepo.createCandidate(cand);

    const sources = ['greenhouse', 'lever', 'ashby', 'greenhouse', 'lever'];

    for (let i = 0; i < 5; i++) {
      const opp = opportunityId(`opp-sb-${i}`);
      const snap = snapshotId(`snap-sb-${i}`);
      oppRepo.createOpportunity(opp);
      oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: `Role ${i}`,
        organization: 'Acme',
        content: 'K8s',
        fingerprint: `fp-sb-${i}`,
      });
      const sl = `sl-sb-${i}`;
      sourceRepo.persistListing(
        sl,
        { sourceSystem: sources[i]!, sourceExternalId: `ext-sb-${i}` },
        opp,
      );
      const target = searchTargetId(`t-sb-${i}`);
      searchRepo.createSearchTarget(cand, { name: 'T' }, target);
      const run = discoveryRunId(`r-sb-${i}`);
      searchRepo.createDiscoveryRun(run, cand, target);
      searchRepo.recordDiscoveryMatch({
        id: discoveryMatchId(`m-sb-${i}`),
        discoveryRunId: run,
        searchTargetId: target,
        candidateId: cand,
        opportunityId: opp,
        sourceListingId: sl,
        matchReasons: ['query'],
        retainedUnresolved: [],
      });
      const ev = evaluationId(`ev-sb-${i}`);
      evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snap,
        eligibilityState: 'eligible',
      });
      evalRepo.persistFinding({
        id: findingId(`f-sb-${i}`),
        evaluationId: ev,
        category: 'fit',
        dimensionKey: 'tech:kubernetes',
        label: 'Kubernetes',
        state: 'NO_EVIDENCE',
        summary: 'No K8s evidence',
      });
    }

    const res = repo.getCareerSignals(cand);
    const k8sSignal = res.repeatedGaps.find(
      (g) => g.dimensionKey === 'tech:kubernetes',
    );
    expect(k8sSignal).toBeDefined();

    // Source Neutrality: All 3 sources merged into one signal with source breakdown metadata
    expect(k8sSignal?.sourceBreakdown).toEqual({
      greenhouse: 2,
      lever: 2,
      ashby: 1,
    });

    // Bounded Samples: Exactly 3 sample opportunities returned while total count is 5
    expect(k8sSignal?.affectedOpportunityCount).toBe(5);
    expect(k8sSignal?.sampleOpportunities).toHaveLength(3);
  });

  it('INVARIANT 15: COMPREHENSIVE E2E DETERMINISTIC FIXTURE (9 Opportunities across Greenhouse, Lever, Ashby)', () => {
    const cand = candidateId('cand-fixture-e2e');
    candRepo.createCandidate(cand);

    // 9 Opportunities: 3 Greenhouse, 3 Lever, 3 Ashby
    // Opp 1-3: Greenhouse
    // Opp 4-6: Lever
    // Opp 7-9: Ashby
    // Opp 9 is closed -> active count = 8
    // Opp 1 has duplicate search target match -> deduplicated to 1
    // Opp 2 has superseded evaluation -> only current eval counts

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
    searchRepo.createSearchTarget(cand, { name: 'Main Target' }, target1);
    const run1 = discoveryRunId('r-main');
    searchRepo.createDiscoveryRun(run1, cand, target1);

    for (let i = 1; i <= 9; i++) {
      const opp = opportunityId(`opp-fix-${i}`);
      const snap = snapshotId(`snap-fix-${i}`);
      oppIds.push(opp);
      snapIds.push(snap);

      oppRepo.createOpportunity(opp);
      oppRepo.appendSnapshot({
        id: snap,
        opportunityId: opp,
        title: `Role ${i}`,
        organization: `Company ${((i - 1) % 3) + 1}`,
        content: `Content ${i}`,
        fingerprint: `fp-fix-${i}`,
      });

      const sl = `sl-fix-${i}`;
      sourceRepo.persistListing(
        sl,
        { sourceSystem: sources[i - 1]!, sourceExternalId: `ext-fix-${i}` },
        opp,
      );

      searchRepo.recordDiscoveryMatch({
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

    // Duplicate search target match for Opp 1
    const target2 = searchTargetId('t-dupe');
    searchRepo.createSearchTarget(cand, { name: 'Dupe Target' }, target2);
    const run2 = discoveryRunId('r-dupe');
    searchRepo.createDiscoveryRun(run2, cand, target2);
    searchRepo.recordDiscoveryMatch({
      id: discoveryMatchId('m-fix-1-dupe'),
      discoveryRunId: run2,
      searchTargetId: target2,
      candidateId: cand,
      opportunityId: oppIds[0]!,
      sourceListingId: 'sl-fix-1',
      matchReasons: ['query'],
      retainedUnresolved: [],
    });

    // Mark Opp 9 explicitly CLOSED via Decision
    const evClosed = evaluationId('ev-fix-9');
    evalRepo.persistEvaluation({
      id: evClosed,
      candidateId: cand,
      snapshotId: snapIds[8]!,
      eligibilityState: 'ineligible',
    });
    handle.db
      .insert(decisions)
      .values({
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
      })
      .run();

    // Opp 2 Superseded Evaluation vs Current Evaluation
    const evOld2 = evaluationId('ev-fix-2-old');
    evalRepo.persistEvaluation({
      id: evOld2,
      candidateId: cand,
      snapshotId: snapIds[1]!,
      eligibilityState: 'eligible',
    });
    evalRepo.persistFinding({
      id: findingId('f-fix-2-old'),
      evaluationId: evOld2,
      category: 'fit',
      dimensionKey: 'tech:python',
      label: 'Python',
      state: 'GAP',
      summary: 'Old Python gap',
    });
    handle.db
      .update(evaluations)
      .set({ supersededAt: new Date() })
      .where(eq(evaluations.id, evOld2))
      .run();

    // Persist current evaluations for active Opps 1 to 8:
    // Pattern:
    // Node.js strong = 7 roles (Opps 1..7)
    // AWS strong = 6 roles (Opps 1..6) - Satisfied alternative group AWS OR Azure OR GCP
    // Kubernetes evidence/gap = 5 roles (Opps 1..5)
    // Terraform = 3 roles (Opps 6..8)
    // US work auth unresolved = 3 roles (Opps 1..3)
    // German language unresolved = 2 roles (Opps 4..5)

    for (let i = 1; i <= 8; i++) {
      const ev = evaluationId(`ev-fix-${i}`);
      evalRepo.persistEvaluation({
        id: ev,
        candidateId: cand,
        snapshotId: snapIds[i - 1]!,
        eligibilityState: i <= 5 ? 'investigate' : 'eligible',
      });

      // Node.js (1..7)
      if (i <= 7) {
        evalRepo.persistFinding({
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

      // AWS (1..6)
      if (i <= 6) {
        evalRepo.persistFinding({
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

      // Kubernetes gap (1..5)
      if (i <= 5) {
        evalRepo.persistFinding({
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

      // Terraform gap (6..8)
      if (i >= 6 && i <= 8) {
        evalRepo.persistFinding({
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

      // US work auth (1..3)
      if (i <= 3) {
        evalRepo.persistFinding({
          id: findingId(`f-us-${i}`),
          evaluationId: ev,
          category: 'eligibility',
          dimensionKey: 'req:work_authorization:us',
          label: 'US Work Authorization',
          state: 'INVESTIGATE',
          summary: 'US work auth unresolved',
        });
      }

      // German language (4..5)
      if (i >= 4 && i <= 5) {
        evalRepo.persistFinding({
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

    const res = repo.getCareerSignals(cand);

    // Exact count assertions:
    // Active open roles: Opp 9 closed -> 8 active roles
    expect(res.activeOpportunityCount).toBe(8);

    // Node.js strong = 7
    const nodeSignal = res.strongAlignments.find(
      (a) => a.dimensionKey === 'tech:nodejs',
    );
    expect(nodeSignal).toBeDefined();
    expect(nodeSignal?.affectedOpportunityCount).toBe(7);

    // AWS strong = 6
    const awsSignal = res.strongAlignments.find(
      (a) => a.dimensionKey === 'tech:aws',
    );
    expect(awsSignal).toBeDefined();
    expect(awsSignal?.affectedOpportunityCount).toBe(6);

    // Kubernetes gap = 5
    const k8sSignal = res.repeatedGaps.find(
      (g) => g.dimensionKey === 'tech:kubernetes',
    );
    expect(k8sSignal).toBeDefined();
    expect(k8sSignal?.affectedOpportunityCount).toBe(5);

    // Terraform gap = 3
    const tfSignal = res.repeatedGaps.find(
      (g) => g.dimensionKey === 'tech:terraform',
    );
    expect(tfSignal).toBeDefined();
    expect(tfSignal?.affectedOpportunityCount).toBe(3);
    expect(tfSignal?.preferredCount).toBe(3);

    // US work auth unresolved = 3
    const usSig = res.eligibilityUncertainties.find(
      (u) => u.dimensionKey === 'req:work_authorization:us',
    );
    expect(usSig).toBeDefined();
    expect(usSig?.affectedOpportunityCount).toBe(3);

    // German language unresolved = 2
    const deSig = res.eligibilityUncertainties.find(
      (u) => u.dimensionKey === 'req:language:de',
    );
    expect(deSig).toBeDefined();
    expect(deSig?.affectedOpportunityCount).toBe(2);

    // Python from superseded eval MUST NOT appear anywhere
    expect(
      res.repeatedGaps.find((g) => g.dimensionKey === 'tech:python'),
    ).toBeUndefined();

    // Azure/GCP from alternative group MUST NOT appear as gaps
    expect(
      res.repeatedGaps.find((g) => g.dimensionKey === 'tech:azure'),
    ).toBeUndefined();
    expect(
      res.repeatedGaps.find((g) => g.dimensionKey === 'tech:gcp'),
    ).toBeUndefined();
  });
});
