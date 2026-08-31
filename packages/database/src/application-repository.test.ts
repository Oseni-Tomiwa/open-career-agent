import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  candidateId,
  opportunityId,
  snapshotId,
  evaluationId,
  decisionId,
  type ApplicationId,
} from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from './client.js';
import { applyMigrations } from './migrate.js';
import { CandidateRepository } from './repositories/candidate-repository.js';
import { OpportunityRepository } from './repositories/opportunity-repository.js';
import { EvaluationRepository } from './repositories/evaluation-repository.js';
import {
  ApplicationError,
  ApplicationRepository,
  validateTransition,
} from './repositories/application-repository.js';
import type { ApplicationStatus } from '@oca/schemas';

describe('ApplicationRepository & State Machine Matrix', () => {
  let directory: string;
  let database: DatabaseHandle;
  let appRepo: ApplicationRepository;
  let candRepo: CandidateRepository;
  let oppRepo: OpportunityRepository;
  let evalRepo: EvaluationRepository;

  const candidateA = candidateId('cand_app_a');
  const candidateB = candidateId('cand_app_b');
  const opp1 = opportunityId('opp-app-1');
  const snap1 = snapshotId('snap-app-1');

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'oca-app-repo-test-'));
    database = openDatabase(join(directory, 'test.sqlite'));
    applyMigrations(database);

    candRepo = new CandidateRepository(database);
    oppRepo = new OpportunityRepository(database);
    evalRepo = new EvaluationRepository(database);
    appRepo = new ApplicationRepository(database);

    candRepo.createCandidate(candidateA);
    candRepo.createCandidate(candidateB);
    oppRepo.createOpportunity(opp1);
    oppRepo.appendSnapshot({
      id: snap1,
      opportunityId: opp1,
      title: 'Senior Distributed Systems Engineer',
      organization: 'Orbit Cloud',
      content: 'Cloud platform role',
      fingerprint: 'fp-snap-app-1',
    });
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  describe('State Machine Matrix', () => {
    const validMatrix: Array<[ApplicationStatus, ApplicationStatus]> = [
      ['Saved', 'Preparing'],
      ['Saved', 'Applied'],
      ['Saved', 'Withdrawn'],
      ['Saved', 'Closed'],
      ['Preparing', 'Applied'],
      ['Preparing', 'Withdrawn'],
      ['Preparing', 'Closed'],
      ['Applied', 'Assessment'],
      ['Applied', 'Interview'],
      ['Applied', 'Offer'],
      ['Applied', 'Rejected'],
      ['Applied', 'Withdrawn'],
      ['Applied', 'Closed'],
      ['Assessment', 'Interview'],
      ['Assessment', 'Offer'],
      ['Assessment', 'Rejected'],
      ['Assessment', 'Withdrawn'],
      ['Assessment', 'Closed'],
      ['Interview', 'Offer'],
      ['Interview', 'Rejected'],
      ['Interview', 'Withdrawn'],
      ['Interview', 'Closed'],
      ['Offer', 'Closed'],
      ['Offer', 'Withdrawn'],
    ];

    it.each(validMatrix)('allows valid transition: %s -> %s', (from, to) => {
      expect(() => validateTransition(from, to)).not.toThrow();
    });

    const forbiddenMatrix: Array<[ApplicationStatus, ApplicationStatus]> = [
      ['Saved', 'Interview'],
      ['Saved', 'Offer'],
      ['Saved', 'Rejected'],
      ['Preparing', 'Interview'],
      ['Preparing', 'Offer'],
      ['Preparing', 'Rejected'],
      ['Rejected', 'Interview'],
      ['Rejected', 'Applied'],
      ['Withdrawn', 'Applied'],
      ['Withdrawn', 'Interview'],
      ['Closed', 'Assessment'],
      ['Closed', 'Applied'],
      ['Offer', 'Preparing'],
      ['Offer', 'Applied'],
    ];

    it.each(forbiddenMatrix)(
      'rejects invalid transition: %s -> %s',
      (from, to) => {
        expect(() => validateTransition(from, to)).toThrowError(
          ApplicationError,
        );
      },
    );

    const terminalResurrections = (
      ['Rejected', 'Withdrawn', 'Closed'] as const
    ).flatMap((from) =>
      (
        [
          'Saved',
          'Preparing',
          'Applied',
          'Assessment',
          'Interview',
          'Offer',
          'Rejected',
          'Withdrawn',
          'Closed',
        ] as const
      )
        .filter((to) => to !== from)
        .map((to) => [from, to] as const),
    );

    it.each(terminalResurrections)(
      'does not resurrect terminal state: %s -> %s',
      (from, to) => {
        expect(() => validateTransition(from, to)).toThrowError(
          ApplicationError,
        );
      },
    );
  });

  it('treats Interview -> Interview as an idempotent no-op', () => {
    const app = appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
      status: 'Interview',
    });
    const beforeEvents = appRepo.getEvents(candidateA, app.id as ApplicationId);
    const repeated = appRepo.updateApplication({
      id: app.id as ApplicationId,
      candidateId: candidateA,
      expectedUpdatedAt: app.updatedAt,
      status: 'Interview',
    });

    expect(repeated.updatedAt).toEqual(app.updatedAt);
    expect(appRepo.getEvents(candidateA, app.id as ApplicationId)).toEqual(
      beforeEvents,
    );
  });

  it('creates an application and logs initial creation event', () => {
    const app = appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
      status: 'Preparing',
      note: 'Tailoring résumé for Cloud platform role',
    });

    expect(app.status).toBe('Preparing');
    expect(app.candidateId).toBe(candidateA);
    expect(app.opportunityId).toBe(opp1);
    expect(app.note).toBe('Tailoring résumé for Cloud platform role');

    const events = appRepo.getEvents(candidateA, app.id as ApplicationId);
    expect(events).toHaveLength(2);
    expect(events[0]!.eventType).toBe('application_created');
    expect(events[1]!.eventType).toBe('note_added');
  });

  it('enforces uniqueness per (candidateId, opportunityId)', () => {
    appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
      status: 'Saved',
    });

    expect(() =>
      appRepo.createApplication({
        candidateId: candidateA,
        opportunityId: opp1,
        status: 'Preparing',
      }),
    ).toThrowError(/already exists/i);
  });

  it('allows Candidate A and Candidate B to track applications to the same Opportunity independently', () => {
    const appA = appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
      status: 'Applied',
    });

    const appB = appRepo.createApplication({
      candidateId: candidateB,
      opportunityId: opp1,
      status: 'Saved',
    });

    expect(appA.candidateId).toBe(candidateA);
    expect(appA.status).toBe('Applied');

    expect(appB.candidateId).toBe(candidateB);
    expect(appB.status).toBe('Saved');

    const listA = appRepo.listApplications(candidateA);
    expect(listA).toHaveLength(1);
    expect(listA[0]!.id).toBe(appA.id);

    const listB = appRepo.listApplications(candidateB);
    expect(listB).toHaveLength(1);
    expect(listB[0]!.id).toBe(appB.id);
  });

  it('atomically updates status and appends status_changed event', () => {
    const app = appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
      status: 'Preparing',
    });

    const updated = appRepo.updateApplication({
      id: app.id as ApplicationId,
      candidateId: candidateA,
      status: 'Applied',
    });

    expect(updated.status).toBe('Applied');
    expect(updated.submittedAt).not.toBeNull();

    const events = appRepo.getEvents(candidateA, app.id as ApplicationId);
    expect(events.map((e) => e.eventType)).toContain('status_changed');
    expect(events.map((e) => e.eventType)).toContain('application_submitted');
  });

  it('prevents stale-write race conditions with expectedUpdatedAt optimistic locking', () => {
    const app = appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
      status: 'Preparing',
    });

    const staleTimestamp = new Date(Date.now() - 100000).toISOString();

    expect(() =>
      appRepo.updateApplication({
        id: app.id as ApplicationId,
        candidateId: candidateA,
        status: 'Applied',
        expectedUpdatedAt: staleTimestamp,
      }),
    ).toThrowError(ApplicationError);
  });

  it('keeps exactly one valid sequence when two stale views attempt updates', () => {
    const app = appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
      status: 'Preparing',
    });
    const staleVersion = app.updatedAt.toISOString();

    appRepo.updateApplication(
      {
        id: app.id as ApplicationId,
        candidateId: candidateA,
        status: 'Applied',
        expectedUpdatedAt: staleVersion,
      },
      app.updatedAt.getTime(),
    );

    expect(() =>
      appRepo.updateApplication({
        id: app.id as ApplicationId,
        candidateId: candidateA,
        status: 'Withdrawn',
        expectedUpdatedAt: staleVersion,
      }),
    ).toThrowError(/stale write conflict/i);
    expect(
      appRepo.getApplication(candidateA, app.id as ApplicationId)?.status,
    ).toBe('Applied');
    expect(
      appRepo
        .getEvents(candidateA, app.id as ApplicationId)
        .filter((event) => event.eventType === 'status_changed'),
    ).toHaveLength(1);
  });

  it('completes a follow-up idempotently and removes its due state', () => {
    const app = appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
      status: 'Applied',
    });
    const dueAt = new Date('2026-09-01T09:00:00.000Z');
    const scheduled = appRepo.updateApplication({
      id: app.id as ApplicationId,
      candidateId: candidateA,
      followUpDueAt: dueAt,
      followUpNote: 'Email the recruiter',
    });
    const completedAt = new Date('2026-09-01T10:00:00.000Z');
    const completed = appRepo.updateApplication({
      id: app.id as ApplicationId,
      candidateId: candidateA,
      expectedUpdatedAt: scheduled.updatedAt,
      followUpCompletedAt: completedAt,
    });
    const repeated = appRepo.updateApplication({
      id: app.id as ApplicationId,
      candidateId: candidateA,
      expectedUpdatedAt: completed.updatedAt,
      followUpCompletedAt: new Date('2026-09-01T11:00:00.000Z'),
    });

    const current = appRepo.getApplication(candidateA, app.id as ApplicationId);
    expect(current?.followUpCompletedAt).toEqual(completedAt);
    expect(repeated.updatedAt).toEqual(completed.updatedAt);
    expect(
      appRepo
        .getEvents(candidateA, app.id as ApplicationId)
        .filter((event) => event.eventType === 'follow_up_completed'),
    ).toHaveLength(1);
  });

  it('enforces candidate ownership for detail, history, and appended events', () => {
    const app = appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
    });
    expect(
      appRepo.getApplication(candidateB, app.id as ApplicationId),
    ).toBeNull();
    expect(() =>
      appRepo.getEvents(candidateB, app.id as ApplicationId),
    ).toThrowError(/not found for candidate/i);
    expect(() =>
      appRepo.appendEvent({
        candidateId: candidateB,
        applicationId: app.id as ApplicationId,
        eventType: 'candidate_activity',
        detail: 'Must not be appended',
      }),
    ).toThrowError(/not found for candidate/i);
    expect(appRepo.getEvents(candidateA, app.id as ApplicationId)).toHaveLength(
      1,
    );
  });

  it('keeps Decision and intelligence records unchanged across lifecycle and notes', () => {
    const evalId = evaluationId('eval-reverse-non-interference');
    const decId = decisionId('dec-reverse-non-interference');
    evalRepo.persistEvaluation({
      id: evalId,
      candidateId: candidateA,
      snapshotId: snap1,
      eligibilityState: 'eligible',
      eligibilityInputFingerprint: 'elig-reverse',
      fitLevel: 'strong',
      fitInputFingerprint: 'fit-reverse',
      qualityLevel: 'strong',
      qualityInputFingerprint: 'quality-reverse',
    });
    evalRepo.persistDecision({
      id: decId,
      evaluationId: evalId,
      candidateId: candidateA,
      snapshotId: snap1,
      priority: 'high-priority',
      action: 'apply',
      explanation: 'Apply now.',
      engineVersion: 'decision-v1',
      inputFingerprint: 'decision-reverse',
      eligibilityInputFingerprint: 'elig-reverse',
      fitInputFingerprint: 'fit-reverse',
      qualityInputFingerprint: 'quality-reverse',
      reasonCodes: [],
      reasonFindingIds: [],
      evaluatedAt: new Date('2026-08-31T10:00:00.000Z'),
    });
    const before = {
      evaluation: evalRepo.getEvaluation(evalId),
      decision: evalRepo.getLatestDecisionForEvaluation(evalId),
      claims: database.sqlite.prepare('select * from candidate_claims').all(),
      evidence: database.sqlite.prepare('select * from evidence').all(),
    };

    let app = appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
      status: 'Preparing',
      originatingDecisionId: decId,
    });
    app = appRepo.updateApplication({
      id: app.id as ApplicationId,
      candidateId: candidateA,
      expectedUpdatedAt: app.updatedAt,
      status: 'Applied',
      note: 'Candidate-authored private note',
    });
    appRepo.updateApplication({
      id: app.id as ApplicationId,
      candidateId: candidateA,
      expectedUpdatedAt: app.updatedAt,
      status: 'Assessment',
    });

    expect(evalRepo.getEvaluation(evalId)).toEqual(before.evaluation);
    expect(evalRepo.getLatestDecisionForEvaluation(evalId)).toEqual(
      before.decision,
    );
    expect(
      database.sqlite.prepare('select * from candidate_claims').all(),
    ).toEqual(before.claims);
    expect(database.sqlite.prepare('select * from evidence').all()).toEqual(
      before.evidence,
    );
  });

  it('rejects cross-candidate originating Decision provenance', () => {
    const evalId = evaluationId('eval-candidate-b-origin');
    const decId = decisionId('dec-candidate-b-origin');
    evalRepo.persistEvaluation({
      id: evalId,
      candidateId: candidateB,
      snapshotId: snap1,
      eligibilityState: 'eligible',
      eligibilityInputFingerprint: 'elig-b',
      fitInputFingerprint: 'fit-b',
      qualityInputFingerprint: 'quality-b',
    });
    evalRepo.persistDecision({
      id: decId,
      evaluationId: evalId,
      candidateId: candidateB,
      snapshotId: snap1,
      priority: 'consider',
      action: 'review',
      explanation: 'Candidate B decision.',
      engineVersion: 'decision-v1',
      inputFingerprint: 'decision-b',
      eligibilityInputFingerprint: 'elig-b',
      fitInputFingerprint: 'fit-b',
      qualityInputFingerprint: 'quality-b',
      reasonCodes: [],
      reasonFindingIds: [],
      evaluatedAt: new Date('2026-08-31T11:00:00.000Z'),
    });

    expect(() =>
      appRepo.createApplication({
        candidateId: candidateA,
        opportunityId: opp1,
        originatingDecisionId: decId,
      }),
    ).toThrowError(/does not belong to this candidate/i);
    expect(appRepo.listApplications(candidateA)).toEqual([]);
  });

  it('verifies Decision state changes do NOT mutate Application status', () => {
    const app = appRepo.createApplication({
      candidateId: candidateA,
      opportunityId: opp1,
      status: 'Applied',
    });

    // Evaluate Decision to BLOCKED
    const evalId = evaluationId('eval-app-1');
    evalRepo.persistEvaluation({
      id: evalId,
      candidateId: candidateA,
      snapshotId: snap1,
      eligibilityState: 'ineligible',
    });

    evalRepo.persistDecision({
      id: decisionId('dec-app-1'),
      evaluationId: evalId,
      candidateId: candidateA,
      snapshotId: snap1,
      priority: 'blocked',
      action: 'do_not_apply',
      explanation: 'Listing closed by employer',
      engineVersion: '1.0.0',
      inputFingerprint: 'fp-dec-app-1',
      eligibilityInputFingerprint: 'fp-elig-app-1',
      fitInputFingerprint: 'fp-fit-app-1',
      qualityInputFingerprint: 'fp-qual-app-1',
      reasonCodes: ['LISTING_CLOSED'],
      reasonFindingIds: [],
      evaluatedAt: new Date(),
    });

    // Application status must remain APPLIED
    const currentApp = appRepo.getApplication(
      candidateA,
      app.id as ApplicationId,
    );
    expect(currentApp?.status).toBe('Applied');
  });
});
