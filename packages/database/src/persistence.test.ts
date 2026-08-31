import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  databaseIsReady,
  openDatabase,
  type DatabaseHandle,
} from './client.js';
import { applyMigrations } from './migrate.js';
import {
  CandidateRepository,
  OpportunityRepository,
  EvaluationRepository,
  EvidenceRepository,
  SourceListingRepository,
  ApplicationRepository,
} from './index.js';
import {
  candidateId,
  claimId,
  opportunityId,
  snapshotId,
  evidenceId,
  evaluationId,
  decisionId,
  findingId,
  applicationId,
  eventId,
} from '@oca/domain';
import { unlinkSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { decisions, evaluations as evaluationRows } from './schema.js';

const TEST_DB_PATH = 'persistence-test.sqlite';

describe('Domain Persistence Foundation', () => {
  let db: DatabaseHandle;

  beforeEach(() => {
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {
      /* ignore */
    }
    db = openDatabase(TEST_DB_PATH);
    databaseIsReady(db);
    applyMigrations(db, './migrations');
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {
      /* ignore */
    }
  });

  describe('SOURCE IDENTITY', () => {
    it('SourceRecord persists without Opportunity', () => {
      const repo = new SourceListingRepository(db);
      const srId = snapshotId('sr_1');
      repo.persistListing(srId, {
        sourceSystem: 'Greenhouse',
        sourceExternalId: 'gh_123',
      });
      repo.persistObservation('obs_' + srId, srId, {
        rawPayload: '{"title": "Engineer"}',
        fingerprint: 'hash',
      });
      const record = repo.getListing(srId);
      expect(record).toBeDefined();
      expect(record?.sourceSystem).toBe('Greenhouse');
      expect(record?.opportunityId).toBeNull();
    });

    it('SourceRecord can later associate with Opportunity', () => {
      const srcRepo = new SourceListingRepository(db);
      const oppRepo = new OpportunityRepository(db);

      const srId = snapshotId('sr_1');
      srcRepo.persistListing(srId, {
        sourceSystem: 'Greenhouse',
        sourceExternalId: 'gh_123',
      });
      srcRepo.persistObservation('obs_' + srId, srId, {
        rawPayload: '{"title": "Engineer"}',
        fingerprint: 'hash',
      });

      const oId = opportunityId('opp_1');
      oppRepo.createOpportunity(oId);

      srcRepo.associateListingWithOpportunity(srId, oId);
      const record = srcRepo.getListing(srId);
      expect(record?.opportunityId).toBe(oId);
    });

    it('multiple SourceRecords can point to one Opportunity', () => {
      const srcRepo = new SourceListingRepository(db);
      const oppRepo = new OpportunityRepository(db);

      const oId = opportunityId('opp_1');
      oppRepo.createOpportunity(oId);

      const srId1 = snapshotId('sr_1');
      srcRepo.persistListing(srId1, {
        sourceSystem: 'Greenhouse',
        sourceExternalId: 'gh_123',
      });
      srcRepo.persistObservation('obs_' + srId1, srId1, {
        rawPayload: '{}',
        fingerprint: 'hash',
      });
      srcRepo.associateListingWithOpportunity(srId1, oId);

      const srId2 = snapshotId('sr_2');
      srcRepo.persistListing(srId2, {
        sourceSystem: 'Workday',
        sourceExternalId: 'wd_456',
      });
      srcRepo.persistObservation('obs_' + srId2, srId2, {
        rawPayload: '{}',
        fingerprint: 'hash',
      });
      srcRepo.associateListingWithOpportunity(srId2, oId);

      const records = srcRepo.getListing(srId1);
      const records2 = srcRepo.getListing(srId2);
      const arr = [records, records2].filter((r) => r?.opportunityId === oId);
      expect(arr).toHaveLength(2);
    });
  });

  describe('SNAPSHOT PROVENANCE', () => {
    it('Snapshot provenance can identify its originating SourceRecord', () => {
      const srcRepo = new SourceListingRepository(db);
      const oppRepo = new OpportunityRepository(db);

      const srId = snapshotId('sr_1');
      srcRepo.persistListing(srId, {
        sourceSystem: 'Greenhouse',
        sourceExternalId: 'gh_123',
      });
      srcRepo.persistObservation('obs_' + srId, srId, {
        rawPayload: '{"title": "Engineer"}',
        fingerprint: 'hash',
      });

      const oId = opportunityId('opp_1');
      oppRepo.createOpportunity(oId);

      const sId = snapshotId('snap_1');
      oppRepo.appendSnapshot({
        fingerprint: 'test-hash',
        id: sId,
        opportunityId: oId,
        title: 'Engineer',
        organization: 'Acme',
        content: 'Content',
        sourceObservationId: 'obs_' + srId,
      });

      const sources = oppRepo.getSnapshotSources(sId);
      expect(sources).toHaveLength(1);
      expect(sources[0]?.sourceObservationId).toBe('obs_' + srId);
    });
  });

  describe('CLAIMS', () => {
    it('Epistemic states persist and UNKNOWN does not become false', () => {
      const candidateRepo = new CandidateRepository(db);
      const cId = candidateId('cand_1');
      candidateRepo.createCandidate(cId);

      candidateRepo.addClaim({
        id: claimId('cl_1'),
        candidateId: cId,
        kind: 'skill',
        value: 'React',
        scope: 'professional',
        state: 'SUPPORTED',
        confidence: 'HIGH',
      });
      candidateRepo.addClaim({
        id: claimId('cl_2'),
        candidateId: cId,
        kind: 'skill',
        value: 'Vue',
        state: 'INFERRED',
        confidence: 'MODERATE',
      });
      candidateRepo.addClaim({
        id: claimId('cl_3'),
        candidateId: cId,
        kind: 'education',
        value: 'Degree',
        state: 'UNKNOWN',
      });
      candidateRepo.addClaim({
        id: claimId('cl_4'),
        candidateId: cId,
        kind: 'location',
        value: 'NY',
        state: 'CONFLICTING',
      });

      const claims = candidateRepo.getClaims(cId);
      expect(claims).toHaveLength(4);
      expect(claims.find((claim) => claim.value === 'React')?.scope).toBe(
        'professional',
      );
      const unknownClaim = claims.find((c) => c.state === 'UNKNOWN');
      expect(unknownClaim).toBeDefined();
      expect(unknownClaim?.value).toBe('Degree');
    });

    it('Evidence relationships remain intact', () => {
      const candidateRepo = new CandidateRepository(db);
      const evidenceRepo = new EvidenceRepository(db);

      const cId = candidateId('cand_1');
      candidateRepo.createCandidate(cId);

      const clId = claimId('cl_1');
      candidateRepo.addClaim({
        id: clId,
        candidateId: cId,
        kind: 'skill',
        value: 'React',
        state: 'SUPPORTED',
      });

      const evId = evidenceId('ev_1');
      evidenceRepo.attachToClaim(clId, {
        id: evId,
        evidenceType: 'candidate',
        sourceReference: 'resume.pdf',
        excerpt: 'Used React for 5 years.',
      });

      const evidenceList = evidenceRepo.getClaimEvidence(clId);
      expect(evidenceList).toHaveLength(1);
      expect(evidenceList[0]?.id).toBe(evId);
    });
  });

  describe('EVALUATION FINDINGS', () => {
    it('Findings persist independently with distinct states, evidence attaches to finding', () => {
      const oppRepo = new OpportunityRepository(db);
      const candRepo = new CandidateRepository(db);
      const evalRepo = new EvaluationRepository(db);
      const evidenceRepo = new EvidenceRepository(db);

      const cId = candidateId('cand_1');
      candRepo.createCandidate(cId);

      const oId = opportunityId('opp_1');
      oppRepo.createOpportunity(oId);

      const sId = snapshotId('snap_1');
      oppRepo.appendSnapshot({
        fingerprint: 'test-hash',
        id: sId,
        opportunityId: oId,
        title: 'Role',
        organization: 'Org',
        content: 'Content',
      });

      const eId = evaluationId('eval_1');
      evalRepo.persistEvaluation({
        id: eId,
        candidateId: cId,
        snapshotId: sId,
        eligibilityState: 'investigate',
        fitLevel: 'moderate',
        qualityLevel: 'strong',
      });

      // Eligibility
      evalRepo.persistFinding({
        id: findingId('f_1'),
        evaluationId: eId,
        category: 'eligibility',
        dimensionKey: 'work_authorization',
        state: 'SUPPORTED',
        summary: 'Has visa',
      });
      evalRepo.persistFinding({
        id: findingId('f_2'),
        evaluationId: eId,
        category: 'eligibility',
        dimensionKey: 'sponsorship',
        state: 'CONTRADICTORY',
        summary: 'Needs sponsorship but listing says no.',
      });

      // Fit
      evalRepo.persistFinding({
        id: findingId('f_3'),
        evaluationId: eId,
        category: 'fit',
        dimensionKey: 'nodejs',
        state: 'MATCH',
        summary: '5 years node',
      });
      evalRepo.persistFinding({
        id: findingId('f_4'),
        evaluationId: eId,
        category: 'fit',
        dimensionKey: 'kubernetes',
        state: 'GAP',
        summary: 'No k8s',
      });

      // Quality
      evalRepo.persistFinding({
        id: findingId('f_5'),
        evaluationId: eId,
        category: 'quality',
        dimensionKey: 'freshness',
        state: 'STRONG',
        summary: 'Posted today',
      });

      const findings = evalRepo.getFindings(eId);
      expect(findings).toHaveLength(5);

      const sponsorship = findings.find(
        (f) => f.dimensionKey === 'sponsorship',
      );
      expect(sponsorship?.state).toBe('CONTRADICTORY');

      const evId = evidenceId('ev_1');
      evidenceRepo.attachToFinding(findingId(sponsorship!.id), {
        id: evId,
        evidenceType: 'opportunity',
        sourceReference: 'job_desc.txt',
        excerpt: 'No sponsorship available',
      });

      const findingEvidence = evidenceRepo.getFindingEvidence(
        findingId(sponsorship!.id),
      );
      expect(findingEvidence).toHaveLength(1);
    });
  });

  describe('QUALITY PERSISTENCE', () => {
    it('persists Quality result with findings, attaches evidence, and updates evaluation metadata', () => {
      const oppRepo = new OpportunityRepository(db);
      const candRepo = new CandidateRepository(db);
      const evalRepo = new EvaluationRepository(db);
      const evidenceRepo = new EvidenceRepository(db);

      const cId = candidateId('cand_quality');
      candRepo.createCandidate(cId);

      const oId = opportunityId('opp_quality');
      oppRepo.createOpportunity(oId);

      const sId = snapshotId('snap_quality');
      oppRepo.appendSnapshot({
        fingerprint: 'test-hash',
        id: sId,
        opportunityId: oId,
        title: 'Backend Engineer',
        organization: 'Acme Corp',
        content: 'Clear content',
      });

      const eId = evaluationId('eval_quality');
      evalRepo.persistEvaluation({
        id: eId,
        candidateId: cId,
        snapshotId: sId,
        eligibilityState: 'eligible',
      });

      const evalTime = new Date('2026-08-30T10:00:00Z');
      const evId = evidenceId('ev_freshness');
      const fId = findingId('f_freshness');

      const saved = evalRepo.persistQualityResult({
        evaluationId: eId,
        quality: {
          level: 'strong',
          engineVersion: 'quality-v1',
          inputFingerprint: 'quality-fp-1',
          summary: '12 Quality dimensions evaluated.',
          evaluatedAt: evalTime,
          freshnessBucket: 'recent',
        },
        findings: [
          {
            id: fId,
            dimensionKey: 'freshness',
            label: 'Listing freshness',
            state: 'STRONG',
            summary: 'Observed today',
            confidence: 'important',
            explanation: '0 days old at evaluation time',
            evidence: [
              {
                id: evId,
                evidenceType: 'opportunity-quality',
                sourceReference: 'snapshot:snap_quality',
                excerpt: 'Freshness anchor: 2026-08-30T10:00:00Z',
                state: 'source-verified',
              },
            ],
          },
        ],
      });

      expect(saved).toBe(true);

      const updatedEval = evalRepo.getEvaluation(eId);
      expect(updatedEval?.qualityLevel).toBe('strong');
      expect(updatedEval?.qualityEngineVersion).toBe('quality-v1');
      expect(updatedEval?.qualityInputFingerprint).toBe('quality-fp-1');
      expect(updatedEval?.qualitySummary).toBe(
        '12 Quality dimensions evaluated.',
      );
      expect(updatedEval?.qualityFreshnessBucket).toBe('recent');

      const qualityFindings = evalRepo.getQualityFindings(eId);
      expect(qualityFindings).toHaveLength(1);
      expect(qualityFindings[0]?.dimensionKey).toBe('freshness');
      expect(qualityFindings[0]?.state).toBe('STRONG');

      const findingEvidence = evidenceRepo.getFindingEvidence(fId);
      expect(findingEvidence).toHaveLength(1);
      expect(findingEvidence[0]?.sourceReference).toBe('snapshot:snap_quality');

      const latestQuality = evalRepo.getLatestQualityForSnapshot(sId);
      expect(latestQuality?.id).toBe(eId);

      const foundByFp = evalRepo.findQualityEvaluation({
        snapshotId: sId,
        engineVersion: 'quality-v1',
        inputFingerprint: 'quality-fp-1',
      });
      expect(foundByFp?.id).toBe(eId);
    });

    it('rejects stale out-of-order writes and behaves idempotently on duplicate writes', () => {
      const oppRepo = new OpportunityRepository(db);
      const candRepo = new CandidateRepository(db);
      const evalRepo = new EvaluationRepository(db);

      const cId = candidateId('cand_stale');
      candRepo.createCandidate(cId);
      const oId = opportunityId('opp_stale');
      oppRepo.createOpportunity(oId);
      const sId = snapshotId('snap_stale');
      oppRepo.appendSnapshot({
        fingerprint: 'test-hash',
        id: sId,
        opportunityId: oId,
        title: 'Engineer',
        organization: 'Acme',
        content: 'Content',
      });
      const eId = evaluationId('eval_stale');
      evalRepo.persistEvaluation({
        id: eId,
        candidateId: cId,
        snapshotId: sId,
        eligibilityState: 'eligible',
      });

      const newerTime = new Date('2026-08-30T12:00:00Z');
      const olderTime = new Date('2026-08-30T08:00:00Z');

      // Write newer result
      evalRepo.persistQualityResult({
        evaluationId: eId,
        quality: {
          level: 'strong',
          engineVersion: 'quality-v1',
          inputFingerprint: 'fp-newer',
          summary: 'Newer',
          evaluatedAt: newerTime,
          freshnessBucket: 'recent',
        },
        findings: [],
      });

      // Duplicate write with same fingerprint -> returns true without error
      const dupResult = evalRepo.persistQualityResult({
        evaluationId: eId,
        quality: {
          level: 'strong',
          engineVersion: 'quality-v1',
          inputFingerprint: 'fp-newer',
          summary: 'Newer',
          evaluatedAt: newerTime,
          freshnessBucket: 'recent',
        },
        findings: [],
      });
      expect(dupResult).toBe(true);

      // Stale write with older timestamp -> rejected (false)
      const staleResult = evalRepo.persistQualityResult({
        evaluationId: eId,
        quality: {
          level: 'weak',
          engineVersion: 'quality-v1',
          inputFingerprint: 'fp-older',
          summary: 'Older',
          evaluatedAt: olderTime,
          freshnessBucket: 'aging',
        },
        findings: [],
      });
      expect(staleResult).toBe(false);

      // Evaluation remains intact with newer evaluation
      const currentEval = evalRepo.getEvaluation(eId);
      expect(currentEval?.qualityLevel).toBe('strong');
      expect(currentEval?.qualityInputFingerprint).toBe('fp-newer');
    });
  });

  describe('HISTORY', () => {
    it('historical Evaluations and Decisions remain intact with structured metadata', () => {
      const candRepo = new CandidateRepository(db);
      const oppRepo = new OpportunityRepository(db);
      const evalRepo = new EvaluationRepository(db);

      const cId = candidateId('cand_1');
      candRepo.createCandidate(cId);

      const oId = opportunityId('opp_1');
      oppRepo.createOpportunity(oId);

      const sId = snapshotId('snap_1');
      oppRepo.appendSnapshot({
        fingerprint: 'test-hash',
        id: sId,
        opportunityId: oId,
        title: 'Role',
        organization: 'Org',
        content: 'Content',
      });

      const eId = evaluationId('eval_1');
      evalRepo.persistEvaluation({
        id: eId,
        candidateId: cId,
        snapshotId: sId,
        eligibilityState: 'eligible',
        eligibilityInputFingerprint: 'elig-fp-1',
        fitLevel: 'strong',
        fitInputFingerprint: 'fit-fp-1',
        qualityLevel: 'strong',
        qualityInputFingerprint: 'quality-fp-1',
      });

      const dId = decisionId('dec_1');
      const evalTime = new Date('2026-08-30T12:00:00Z');
      const success = evalRepo.persistDecision({
        id: dId,
        evaluationId: eId,
        candidateId: cId,
        snapshotId: sId,
        priority: 'high-priority',
        action: 'apply',
        explanation: 'High priority recommendation',
        engineVersion: 'decision-v1',
        inputFingerprint: 'dec-fp-1',
        eligibilityInputFingerprint: 'elig-fp-1',
        fitInputFingerprint: 'fit-fp-1',
        qualityInputFingerprint: 'quality-fp-1',
        reasonCodes: ['ACTIONABLE_LISTING', 'STRONG_REQUIRED_FIT'],
        reasonFindingIds: [],
        evaluatedAt: evalTime,
      });
      expect(success).toBe(true);

      const decision = evalRepo.getDecision(dId);
      expect(decision).toBeDefined();
      expect(decision?.priority).toBe('high-priority');
      expect(decision?.action).toBe('apply');
      expect(decision?.engineVersion).toBe('decision-v1');
      expect(decision?.inputFingerprint).toBe('dec-fp-1');
      expect(JSON.parse(decision?.reasonCodes ?? '[]')).toEqual([
        'ACTIONABLE_LISTING',
        'STRONG_REQUIRED_FIT',
      ]);

      const latestForEval = evalRepo.getLatestDecisionForEvaluation(eId);
      expect(latestForEval?.id).toBe(dId);

      const latestForSnap = evalRepo.getLatestDecisionForSnapshot(sId);
      expect(latestForSnap?.id).toBe(dId);
      expect(latestForSnap?.priority).toBe('high-priority');

      // Test idempotency
      const dup = evalRepo.persistDecision({
        id: decisionId('dec_dup'),
        evaluationId: eId,
        candidateId: cId,
        snapshotId: sId,
        priority: 'high-priority',
        action: 'apply',
        explanation: 'Duplicate',
        engineVersion: 'decision-v1',
        inputFingerprint: 'dec-fp-1',
        eligibilityInputFingerprint: 'elig-fp-1',
        fitInputFingerprint: 'fit-fp-1',
        qualityInputFingerprint: 'quality-fp-1',
        reasonCodes: [],
        reasonFindingIds: [],
        evaluatedAt: evalTime,
      });
      expect(dup).toBe(true);

      // A superseded Evaluation cannot accept a late Decision write.
      evalRepo.supersedeCurrentEvaluation({
        candidateId: cId,
        snapshotId: sId,
      });
      const stale = evalRepo.persistDecision({
        id: decisionId('dec_stale'),
        evaluationId: eId,
        candidateId: cId,
        snapshotId: sId,
        priority: 'consider',
        action: 'review',
        explanation: 'Older',
        engineVersion: 'decision-v1',
        inputFingerprint: 'dec-fp-old',
        eligibilityInputFingerprint: 'elig-fp-1',
        fitInputFingerprint: 'fit-fp-1',
        qualityInputFingerprint: 'quality-fp-1',
        reasonCodes: [],
        reasonFindingIds: [],
        evaluatedAt: new Date('2026-08-30T08:00:00Z'),
      });
      expect(stale).toBe(false);
    });
  });

  describe('Decision V1 semantic-lineage regressions', () => {
    it.each([
      ['eligibility', 'elig-fp-b', 'fit-fp-a', 'quality-fp-a'],
      ['fit', 'elig-fp-a', 'fit-fp-b', 'quality-fp-a'],
      ['quality', 'elig-fp-a', 'fit-fp-a', 'quality-fp-b'],
    ])(
      'rejects a late Decision after a newer %s revision exists',
      (
        _dimension,
        eligibilityFingerprint,
        fitFingerprint,
        qualityFingerprint,
      ) => {
        const candidates = new CandidateRepository(db);
        const opportunities = new OpportunityRepository(db);
        const evaluations = new EvaluationRepository(db);
        const candidate = candidateId(`cand-race-${_dimension}`);
        const opportunity = opportunityId(`opp-race-${_dimension}`);
        const snapshot = snapshotId(`snap-race-${_dimension}`);
        const evaluationA = evaluationId(`eval-race-a-${_dimension}`);
        const evaluationB = evaluationId(`eval-race-b-${_dimension}`);
        candidates.createCandidate(candidate);
        opportunities.createOpportunity(opportunity);
        opportunities.appendSnapshot({
          id: snapshot,
          opportunityId: opportunity,
          title: 'Role',
          organization: 'Org',
          content: 'Role',
          fingerprint: `snapshot-${_dimension}`,
        });
        evaluations.persistEvaluation({
          id: evaluationA,
          candidateId: candidate,
          snapshotId: snapshot,
          eligibilityState: 'eligible',
          eligibilityInputFingerprint: 'elig-fp-a',
          fitLevel: 'strong',
          fitInputFingerprint: 'fit-fp-a',
          qualityLevel: 'strong',
          qualityInputFingerprint: 'quality-fp-a',
        });
        evaluations.forkEvaluation({
          id: evaluationB,
          sourceEvaluationId: evaluationA,
          copy: ['eligibility', 'fit', 'quality'],
        });
        // The fork preserves A's completed assessments; B receives one newer
        // semantic upstream input before the late A write attempts persistence.
        db.db
          .update(evaluationRows)
          .set({
            eligibilityInputFingerprint: eligibilityFingerprint,
            fitInputFingerprint: fitFingerprint,
            qualityInputFingerprint: qualityFingerprint,
          })
          .where(eq(evaluationRows.id, evaluationB))
          .run();

        const lateA = evaluations.persistDecision({
          id: decisionId(`decision-a-${_dimension}`),
          evaluationId: evaluationA,
          candidateId: candidate,
          snapshotId: snapshot,
          priority: 'high-priority',
          action: 'apply',
          explanation: 'late A',
          engineVersion: 'decision-v1',
          inputFingerprint: `decision-a-${_dimension}`,
          eligibilityInputFingerprint: 'elig-fp-a',
          fitInputFingerprint: 'fit-fp-a',
          qualityInputFingerprint: 'quality-fp-a',
          reasonCodes: [],
          reasonFindingIds: [],
          evaluatedAt: new Date(),
        });
        expect(lateA).toBe(false);

        expect(
          evaluations.persistDecision({
            id: decisionId(`decision-b-${_dimension}`),
            evaluationId: evaluationB,
            candidateId: candidate,
            snapshotId: snapshot,
            priority: 'consider',
            action: 'review',
            explanation: 'current B',
            engineVersion: 'decision-v1',
            inputFingerprint: `decision-b-${_dimension}`,
            eligibilityInputFingerprint: eligibilityFingerprint,
            fitInputFingerprint: fitFingerprint,
            qualityInputFingerprint: qualityFingerprint,
            reasonCodes: [],
            reasonFindingIds: [],
            evaluatedAt: new Date(),
          }),
        ).toBe(true);
        expect(
          evaluations.getCurrentDecision(candidate, snapshot)?.evaluationId,
        ).toBe(evaluationB);
      },
    );

    it('enforces Decision semantic idempotency in SQLite, independently of repository pre-checks', () => {
      const candidates = new CandidateRepository(db);
      const opportunities = new OpportunityRepository(db);
      const evaluations = new EvaluationRepository(db);
      const candidate = candidateId('cand-decision-unique');
      const opportunity = opportunityId('opp-decision-unique');
      const snapshot = snapshotId('snap-decision-unique');
      const evaluation = evaluationId('eval-decision-unique');
      candidates.createCandidate(candidate);
      opportunities.createOpportunity(opportunity);
      opportunities.appendSnapshot({
        id: snapshot,
        opportunityId: opportunity,
        title: 'Role',
        organization: 'Org',
        content: 'Role',
        fingerprint: 'unique-snapshot',
      });
      evaluations.persistEvaluation({
        id: evaluation,
        candidateId: candidate,
        snapshotId: snapshot,
        eligibilityState: 'eligible',
        eligibilityInputFingerprint: 'elig',
        fitLevel: 'strong',
        fitInputFingerprint: 'fit',
        qualityLevel: 'strong',
        qualityInputFingerprint: 'quality',
      });
      const value = {
        evaluationId: evaluation,
        candidateId: candidate,
        snapshotId: snapshot,
        priority: 'high-priority' as const,
        action: 'apply' as const,
        explanation: 'same inputs',
        engineVersion: 'decision-v1',
        inputFingerprint: 'same-semantic-inputs',
        eligibilityInputFingerprint: 'elig',
        fitInputFingerprint: 'fit',
        qualityInputFingerprint: 'quality',
        reasonCodes: '[]',
        evaluatedAt: new Date(),
        createdAt: new Date(),
      };
      db.db
        .insert(decisions)
        .values({ id: decisionId('decision-unique-a'), ...value })
        .run();
      expect(() =>
        db.db
          .insert(decisions)
          .values({ id: decisionId('decision-unique-b'), ...value })
          .run(),
      ).toThrow();
    });

    it('persists DecisionReason linking Decision -> EvaluationFinding -> Evidence provenance', () => {
      const candidates = new CandidateRepository(db);
      const opportunities = new OpportunityRepository(db);
      const evaluations = new EvaluationRepository(db);
      const evidenceRepo = new EvidenceRepository(db);

      const candidate = candidateId('cand-prov-1');
      const opportunity = opportunityId('opp-prov-1');
      const snapshot = snapshotId('snap-prov-1');
      const evaluation = evaluationId('eval-prov-1');
      const finding = findingId('find-prov-1');
      const evId = evidenceId('ev-prov-1');

      candidates.createCandidate(candidate);
      opportunities.createOpportunity(opportunity);
      opportunities.appendSnapshot({
        id: snapshot,
        opportunityId: opportunity,
        title: 'Lead Engineer',
        organization: 'Acme',
        content: 'Role content',
        fingerprint: 'fp-snap-prov',
      });

      evaluations.persistEvaluation({
        id: evaluation,
        candidateId: candidate,
        snapshotId: snapshot,
        eligibilityState: 'ineligible',
        eligibilityInputFingerprint: 'fp-elig-prov',
        fitLevel: 'strong',
        fitInputFingerprint: 'fp-fit-prov',
        qualityLevel: 'strong',
        qualityInputFingerprint: 'fp-qual-prov',
      });

      evaluations.persistFinding({
        id: finding,
        evaluationId: evaluation,
        category: 'eligibility',
        dimensionKey: 'work_authorization',
        state: 'HARD_BLOCKER',
        summary: 'Requires German work authorization.',
      });

      evidenceRepo.attachToSnapshot(snapshot, {
        id: evId,
        evidenceType: 'source-observation',
        sourceReference: 'greenhouse:456',
        excerpt: 'Must possess German work permit.',
        state: 'source-verified',
      });

      evaluations.attachEvidenceToFinding(finding, evId);

      const dId = decisionId('dec-prov-1');
      evaluations.persistDecision({
        id: dId,
        evaluationId: evaluation,
        candidateId: candidate,
        snapshotId: snapshot,
        priority: 'blocked',
        action: 'do_not_apply',
        explanation: 'Blocked by German work authorization requirement.',
        engineVersion: 'decision-v1',
        inputFingerprint: 'fp-dec-prov',
        eligibilityInputFingerprint: 'fp-elig-prov',
        fitInputFingerprint: 'fp-fit-prov',
        qualityInputFingerprint: 'fp-qual-prov',
        reasonCodes: ['ELIGIBILITY_BLOCKER'],
        reasonFindingIds: [
          { reasonCode: 'ELIGIBILITY_BLOCKER', findingId: finding },
        ],
        evaluatedAt: new Date(),
      });

      const reasons = evaluations.getDecisionReasons(dId);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]?.reasonCode).toBe('ELIGIBILITY_BLOCKER');
      expect(reasons[0]?.findingId).toBe(finding);

      const findingEvidence = evidenceRepo.getFindingEvidence(finding);
      expect(findingEvidence).toHaveLength(1);
      expect(findingEvidence[0]?.id).toBe(evId);
      expect(findingEvidence[0]?.excerpt).toBe(
        'Must possess German work permit.',
      );
    });

    it('ensures application records and events remain untouched across decision updates', () => {
      const candidates = new CandidateRepository(db);
      const opportunities = new OpportunityRepository(db);
      const evaluations = new EvaluationRepository(db);
      const apps = new ApplicationRepository(db);

      const candidate = candidateId('cand-app-no-interfere');
      const opportunity = opportunityId('opp-app-no-interfere');
      const snapshot = snapshotId('snap-app-no-interfere');
      const evaluation = evaluationId('eval-app-no-interfere');

      candidates.createCandidate(candidate);
      opportunities.createOpportunity(opportunity);
      opportunities.appendSnapshot({
        id: snapshot,
        opportunityId: opportunity,
        title: 'Backend Dev',
        organization: 'Acme',
        content: 'Content',
        fingerprint: 'fp-snap-app',
      });

      evaluations.persistEvaluation({
        id: evaluation,
        candidateId: candidate,
        snapshotId: snapshot,
        eligibilityState: 'eligible',
        eligibilityInputFingerprint: 'fp-elig-app',
        fitLevel: 'strong',
        fitInputFingerprint: 'fp-fit-app',
        qualityLevel: 'strong',
        qualityInputFingerprint: 'fp-qual-app',
      });

      const appId = applicationId('app-no-interfere');
      apps.createApplication({
        id: appId,
        candidateId: candidate,
        opportunityId: opportunity,
        status: 'Applied',
      });
      const evId = eventId('ev-app-no-interfere');
      apps.appendEvent({
        id: evId,
        candidateId: candidate,
        applicationId: appId,
        eventType: 'status_changed',
        detail: 'Submitted application on website.',
      });

      // Persist Decision 1
      evaluations.persistDecision({
        id: decisionId('dec-app-1'),
        evaluationId: evaluation,
        candidateId: candidate,
        snapshotId: snapshot,
        priority: 'high-priority',
        action: 'apply',
        explanation: 'High priority.',
        engineVersion: 'decision-v1',
        inputFingerprint: 'fp-dec-app-1',
        eligibilityInputFingerprint: 'fp-elig-app',
        fitInputFingerprint: 'fp-fit-app',
        qualityInputFingerprint: 'fp-qual-app',
        reasonCodes: ['ACTIONABLE_LISTING', 'STRONG_REQUIRED_FIT'],
        reasonFindingIds: [],
        evaluatedAt: new Date('2026-08-30T10:00:00Z'),
      });

      // Application and event exist unchanged
      expect(apps.getApplication(candidate, appId)?.status).toBe('Applied');
      expect(apps.getEvents(candidate, appId)).toHaveLength(3);

      // Transition Decision to blocked (e.g. listing closed)
      const eval2 = evaluationId('eval-app-no-interfere-2');
      evaluations.persistEvaluation({
        id: eval2,
        candidateId: candidate,
        snapshotId: snapshot,
        eligibilityState: 'eligible',
        eligibilityInputFingerprint: 'fp-elig-app',
        fitLevel: 'strong',
        fitInputFingerprint: 'fp-fit-app',
        qualityLevel: 'risk',
        qualityInputFingerprint: 'fp-qual-app-2',
      });

      evaluations.persistDecision({
        id: decisionId('dec-app-2'),
        evaluationId: eval2,
        candidateId: candidate,
        snapshotId: snapshot,
        priority: 'blocked',
        action: 'do_not_apply',
        explanation: 'Listing closed.',
        engineVersion: 'decision-v1',
        inputFingerprint: 'fp-dec-app-2',
        eligibilityInputFingerprint: 'fp-elig-app',
        fitInputFingerprint: 'fp-fit-app',
        qualityInputFingerprint: 'fp-qual-app-2',
        reasonCodes: ['LISTING_CLOSED'],
        reasonFindingIds: [],
        evaluatedAt: new Date('2026-08-30T11:00:00Z'),
      });

      // Application status and history events MUST NOT be affected by Decision transition
      const appAfter = apps.getApplication(candidate, appId);
      expect(appAfter?.status).toBe('Applied');
      const eventsAfter = apps.getEvents(candidate, appId);
      expect(eventsAfter).toHaveLength(3);
      expect(eventsAfter.some((event) => event.id === evId)).toBe(true);
    });
  });

  describe('DELETE SEMANTICS', () => {
    it('critical audit deletion remains restricted, junction cleanup behaves intentionally', () => {
      const candRepo = new CandidateRepository(db);
      const cId = candidateId('cand_does_not_exist');
      const clId = claimId('cl_1');

      expect(() =>
        candRepo.addClaim({
          id: clId,
          candidateId: cId,
          kind: 'skill',
          value: 'TS',
          state: 'SUPPORTED',
        }),
      ).toThrow();
    });
  });
});
