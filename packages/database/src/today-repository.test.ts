import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  candidateId,
  opportunityId,
  snapshotId,
  evaluationId,
  decisionId,
  searchTargetId,
  discoveryRunId,
  discoveryMatchId,
  applicationId,
} from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from './client.js';
import { applyMigrations } from './migrate.js';
import { CandidateRepository } from './repositories/candidate-repository.js';
import { EvaluationRepository } from './repositories/evaluation-repository.js';
import { OpportunityRepository } from './repositories/opportunity-repository.js';
import { SearchTargetRepository } from './repositories/search-target-repository.js';
import { TodayRepository } from './repositories/today-repository.js';
import { SourceListingRepository } from './repositories/source-listing-repository.js';
import { ApplicationRepository } from './repositories/application-repository.js';

describe('TodayRepository', () => {
  let directory: string;
  let database: DatabaseHandle;
  let todayRepo: TodayRepository;
  let candRepo: CandidateRepository;
  let oppRepo: OpportunityRepository;
  let evalRepo: EvaluationRepository;
  let searchRepo: SearchTargetRepository;

  const candidateAlex = candidateId('cand_alex');
  const candidateJordan = candidateId('cand_jordan');
  const opp1 = opportunityId('opp-1');
  const opp2 = opportunityId('opp-2');
  const snap1 = snapshotId('snap-1');
  const snap2 = snapshotId('snap-2');

  const now = new Date('2026-08-31T12:00:00.000Z');

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-today-repo-test-'));
    database = openDatabase(join(directory, 'test.sqlite'));
    await applyMigrations(database);

    candRepo = new CandidateRepository(database);
    oppRepo = new OpportunityRepository(database);
    evalRepo = new EvaluationRepository(database);
    searchRepo = new SearchTargetRepository(database);
    todayRepo = new TodayRepository(database);

    await candRepo.createCandidate(candidateAlex, now.getTime() - 86400000);
    await candRepo.createCandidate(candidateJordan, now.getTime() - 86400000);
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('returns an empty dashboard structure for candidate with no discovery targets or opportunities', async () => {
    const dashboard = await todayRepo.getTodayDashboard(candidateAlex, { now });

    expect(dashboard.greetingName).toBe('there');
    expect(dashboard.summaryText).toBe(
      'No high-priority opportunities right now.',
    );
    expect(dashboard.priorityOpportunities).toEqual([]);
    expect(dashboard.needsAttention).toEqual([]);
    expect(dashboard.recentChanges).toEqual([]);
    expect(dashboard.discoveryActivity).toEqual([]);
    expect(dashboard.applicationActivity).toEqual([]);
    expect(dashboard.careerMemoryAttention).toEqual([]);
  });

  it('surfaces an incomplete due follow-up and removes it after completion', async () => {
    await oppRepo.createOpportunity(opp1);
    await oppRepo.appendSnapshot({
      id: snap1,
      opportunityId: opp1,
      title: 'Platform Engineer',
      organization: 'Northstar',
      content: 'Role',
      fingerprint: 'fp-follow-up',
    });
    const applications = new ApplicationRepository(database);
    const app = await applications.createApplication({
      id: applicationId('app-follow-up'),
      candidateId: candidateAlex,
      opportunityId: opp1,
      status: 'Applied',
    });
    const scheduled = await applications.updateApplication({
      id: applicationId(app.id),
      candidateId: candidateAlex,
      expectedUpdatedAt: app.updatedAt,
      followUpDueAt: new Date('2026-08-31T09:00:00.000Z'),
      followUpNote: 'Email the recruiter',
    });

    const dashboardBefore = await todayRepo.getTodayDashboard(candidateAlex, {
      now,
    });
    expect(dashboardBefore.applicationActivity[0]).toMatchObject({
      applicationId: app.id,
      nextAction: 'Email the recruiter',
      dueDate: '2026-08-31T09:00:00.000Z',
    });

    await applications.updateApplication({
      id: applicationId(app.id),
      candidateId: candidateAlex,
      expectedUpdatedAt: scheduled.updatedAt,
      followUpCompletedAt: now,
    });
    const dashboardAfter = await todayRepo.getTodayDashboard(candidateAlex, {
      now,
    });
    expect(dashboardAfter.applicationActivity[0]?.dueDate).toBeNull();
  });

  it('aggregates priority opportunities and needs attention with strict candidate isolation', async () => {
    await oppRepo.createOpportunity(opp1, now.getTime() - 7200000);
    await oppRepo.appendSnapshot(
      {
        id: snap1,
        opportunityId: opp1,
        title: 'Senior Backend Engineer',
        organization: 'Acme Corp',
        content: 'Full time role',
        fingerprint: 'fp-snap-1',
      },
      now.getTime() - 7200000,
    );

    await oppRepo.createOpportunity(opp2, now.getTime() - 3600000);
    await oppRepo.appendSnapshot(
      {
        id: snap2,
        opportunityId: opp2,
        title: 'Staff Platform Engineer',
        organization: 'Beta Inc',
        content: 'Platform role',
        fingerprint: 'fp-snap-2',
      },
      now.getTime() - 3600000,
    );

    const sourceRepo = new SourceListingRepository(database);
    await sourceRepo.persistListing(
      'sl-1',
      { sourceSystem: 'greenhouse', sourceExternalId: 'gh-1' },
      opp1,
      now.getTime() - 7200000,
    );
    await sourceRepo.persistListing(
      'sl-2',
      { sourceSystem: 'greenhouse', sourceExternalId: 'gh-2' },
      opp2,
      now.getTime() - 3600000,
    );

    const targetA = await searchRepo.createSearchTarget(candidateAlex, {
      name: 'Backend Target',
      locations: ['Remote'],
    });

    const runA = discoveryRunId('dr-run-a');
    await searchRepo.createDiscoveryRun(
      runA,
      candidateAlex,
      searchTargetId(targetA.id),
      'greenhouse',
    );
    await searchRepo.recordDiscoveryMatch({
      id: discoveryMatchId('dm-1'),
      candidateId: candidateAlex,
      searchTargetId: searchTargetId(targetA.id),
      discoveryRunId: runA,
      opportunityId: opp1,
      sourceListingId: 'sl-1',
      matchReasons: [],
      retainedUnresolved: [],
    });
    await searchRepo.recordDiscoveryMatch({
      id: discoveryMatchId('dm-2'),
      candidateId: candidateAlex,
      searchTargetId: searchTargetId(targetA.id),
      discoveryRunId: runA,
      opportunityId: opp2,
      sourceListingId: 'sl-2',
      matchReasons: [],
      retainedUnresolved: [],
    });

    const eval1 = evaluationId('eval-1');
    await evalRepo.persistEvaluation(
      {
        id: eval1,
        candidateId: candidateAlex,
        snapshotId: snap1,
        eligibilityState: 'eligible',
        eligibilityInputFingerprint: 'fp-elig-1',
        fitInputFingerprint: 'fp-fit-1',
        qualityInputFingerprint: 'fp-qual-1',
      },
      now.getTime() - 3600000,
    );

    await evalRepo.persistDecision({
      id: decisionId('dec-1'),
      evaluationId: eval1,
      candidateId: candidateAlex,
      snapshotId: snap1,
      priority: 'high-priority',
      action: 'apply',
      explanation: 'Eligible with strong required skills',
      engineVersion: '1.0.0',
      inputFingerprint: 'fp-dec-1',
      eligibilityInputFingerprint: 'fp-elig-1',
      fitInputFingerprint: 'fp-fit-1',
      qualityInputFingerprint: 'fp-qual-1',
      reasonCodes: ['ACTIONABLE_LISTING', 'STRONG_FIT'],
      reasonFindingIds: [],
      evaluatedAt: new Date(now.getTime() - 3600000),
    });

    const eval2 = evaluationId('eval-2');
    await evalRepo.persistEvaluation(
      {
        id: eval2,
        candidateId: candidateAlex,
        snapshotId: snap2,
        eligibilityState: 'investigate',
        eligibilityInputFingerprint: 'fp-elig-2',
        fitInputFingerprint: 'fp-fit-2',
        qualityInputFingerprint: 'fp-qual-2',
      },
      now.getTime() - 1800000,
    );

    await evalRepo.persistDecision({
      id: decisionId('dec-2'),
      evaluationId: eval2,
      candidateId: candidateAlex,
      snapshotId: snap2,
      priority: 'investigate',
      action: 'investigate',
      explanation: 'Unresolved work authorization claim',
      engineVersion: '1.0.0',
      inputFingerprint: 'fp-dec-2',
      eligibilityInputFingerprint: 'fp-elig-2',
      fitInputFingerprint: 'fp-fit-2',
      qualityInputFingerprint: 'fp-qual-2',
      reasonCodes: ['ELIGIBILITY_UNRESOLVED'],
      reasonFindingIds: [],
      evaluatedAt: new Date(now.getTime() - 1800000),
    });

    const dashboardAlex = await todayRepo.getTodayDashboard(candidateAlex, {
      now,
    });

    expect(dashboardAlex.greetingName).toBe('there');
    expect(dashboardAlex.priorityOpportunities).toHaveLength(1);
    expect(dashboardAlex.priorityOpportunities[0]!.opportunityId).toBe('opp-1');
    expect(dashboardAlex.priorityOpportunities[0]!.decisionState).toBe(
      'high-priority',
    );

    expect(dashboardAlex.needsAttention).toHaveLength(1);
    expect(dashboardAlex.needsAttention[0]!.opportunityId).toBe('opp-2');
    expect(dashboardAlex.needsAttention[0]!.category).toBe('investigate');

    const dashboardJordan = await todayRepo.getTodayDashboard(candidateJordan, {
      now,
    });
    expect(dashboardJordan.greetingName).toBe('there');
    expect(dashboardJordan.priorityOpportunities).toHaveLength(0);
    expect(dashboardJordan.needsAttention).toHaveLength(0);
  });
});
