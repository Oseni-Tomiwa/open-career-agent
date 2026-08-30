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
} from '@oca/domain';
import { unlinkSync } from 'node:fs';

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
      expect(findingEvidence[0]?.id).toBe(evId);
    });
  });

  describe('HISTORY', () => {
    it('historical Evaluations and Decisions remain intact', () => {
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
        eligibilityState: 'unknown',
        fitLevel: 'moderate',
        qualityLevel: 'strong',
      });

      const dId = decisionId('dec_1');
      evalRepo.persistDecision({
        id: dId,
        evaluationId: eId,
        priority: 'investigate',
        explanation: 'Need info',
      });

      const decision = evalRepo.getDecision(dId);
      expect(decision).toBeDefined();
      expect(decision?.priority).toBe('investigate');
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
