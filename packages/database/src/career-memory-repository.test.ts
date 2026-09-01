import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { candidateId, claimId, opportunityId, snapshotId } from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from './client.js';
import { applyMigrations } from './migrate.js';
import { CandidateRepository } from './repositories/candidate-repository.js';
import {
  CareerMemoryError,
  CareerMemoryRepository,
} from './repositories/career-memory-repository.js';
import { OpportunityRepository } from './repositories/opportunity-repository.js';
import { getTables } from './schema-helper.js';
import { BackgroundTaskLedger } from './task-ledger.js';

describe('Career Memory repository', () => {
  let directory: string;
  let database: DatabaseHandle;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-career-memory-'));
    database = openDatabase(join(directory, 'test.sqlite'));
    await applyMigrations(database);
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('round-trips state, scope, confidence, and candidate-confirmed Evidence', async () => {
    const candidate = candidateId('candidate-memory-roundtrip');
    await new CandidateRepository(database).createCandidate(candidate);
    const repository = new CareerMemoryRepository(database);
    await repository.createClaim({
      candidateId: candidate,
      kind: 'work_authorization',
      value: 'Authorized to work',
      scope: 'us',
      state: 'SUPPORTED',
      confidence: 'HIGH',
      evidence: {
        evidenceType: 'user-confirmed statement',
        excerpt: 'I am authorized to work in the United States.',
        state: 'candidate-confirmed',
      },
    });

    const profile = await repository.getProfile(candidate);
    expect(profile).toMatchObject({
      claims: [
        {
          kind: 'work_authorization',
          value: 'Authorized to work',
          scope: 'us',
          state: 'SUPPORTED',
          confidence: 'HIGH',
          evidence: [
            {
              sourceReference: 'candidate-confirmed/manual',
              state: 'candidate-confirmed',
            },
          ],
        },
      ],
    });
  });

  it('preserves historical Evidence and contradiction state', async () => {
    const candidate = candidateId('candidate-memory-conflict');
    await new CandidateRepository(database).createCandidate(candidate);
    const repository = new CareerMemoryRepository(database);
    const created = await repository.createClaim({
      candidateId: candidate,
      kind: 'work_authorization',
      value: 'Authorized to work',
      scope: 'us',
      state: 'SUPPORTED',
      evidence: {
        evidenceType: 'user-confirmed statement',
        excerpt: 'I am authorized to work in the United States.',
        state: 'candidate-confirmed',
      },
    });
    await repository.attachEvidence({
      candidateId: candidate,
      claimId: claimId(created.id),
      evidence: {
        evidenceType: 'candidate correction',
        sourceReference: 'manual:correction',
        excerpt: 'I do not currently possess this authorization.',
        state: 'disputed',
      },
      transitionTo: 'CONFLICTING',
    });

    const profile = await repository.getProfile(candidate);
    expect(profile?.claims[0]).toMatchObject({
      state: 'CONFLICTING',
      evidence: [{ state: 'candidate-confirmed' }, { state: 'disputed' }],
    });
    await expect(
      repository.updateClaim({
        candidateId: candidate,
        claimId: claimId(created.id),
        state: 'SUPPORTED',
      }),
    ).rejects.toThrow(CareerMemoryError);
  });

  it('prevents cross-candidate linkage and supported content rewriting', async () => {
    const first = candidateId('candidate-memory-first');
    const second = candidateId('candidate-memory-second');
    const candidates = new CandidateRepository(database);
    await candidates.createCandidate(first);
    await candidates.createCandidate(second);
    const repository = new CareerMemoryRepository(database);
    const created = await repository.createClaim({
      candidateId: first,
      kind: 'skill',
      value: 'Node.js',
      state: 'SUPPORTED',
      evidence: {
        evidenceType: 'user-confirmed statement',
        excerpt: 'I have delivered Node.js services.',
        state: 'candidate-confirmed',
      },
    });

    await expect(
      repository.attachEvidence({
        candidateId: second,
        claimId: claimId(created.id),
        evidence: {
          evidenceType: 'manual reference',
          sourceReference: 'project:wrong-candidate',
          excerpt: 'Must not be linked across candidates.',
          state: 'unreviewed',
        },
      }),
    ).rejects.toThrow(CareerMemoryError);
    await expect(
      repository.updateClaim({
        candidateId: first,
        claimId: claimId(created.id),
        value: 'Kubernetes',
      }),
    ).rejects.toThrow(CareerMemoryError);
    const secondProfile = await repository.getProfile(second);
    expect(secondProfile?.claims).toEqual([]);
  });

  it('enqueues semantic reevaluation idempotently', async () => {
    const candidate = candidateId('candidate-memory-tasks');
    await new CandidateRepository(database).createCandidate(candidate);
    const opportunities = new OpportunityRepository(database);
    const opportunity = opportunityId('opportunity-memory-tasks');
    await opportunities.createOpportunity(opportunity);
    await opportunities.appendSnapshot({
      id: snapshotId('snapshot-memory-tasks'),
      opportunityId: opportunity,
      title: 'Backend Engineer',
      organization: 'Example',
      content: 'Node.js required.',
      fingerprint: 'memory-task-snapshot',
    });
    const repository = new CareerMemoryRepository(database);
    const created = await repository.createClaim({
      candidateId: candidate,
      kind: 'skill',
      value: 'Node.js',
      state: 'UNKNOWN',
    });

    const { backgroundTasks } = getTables(database);
    const db = database.db as any;
    expect(await db.select().from(backgroundTasks)).toHaveLength(1);

    const evidence = {
      evidenceType: 'user-confirmed statement',
      excerpt: 'I have delivered Node.js services.',
      state: 'candidate-confirmed' as const,
    };
    await repository.attachEvidence({
      candidateId: candidate,
      claimId: claimId(created.id),
      evidence,
      transitionTo: 'SUPPORTED',
    });
    expect(await db.select().from(backgroundTasks)).toHaveLength(2);
    await repository.attachEvidence({
      candidateId: candidate,
      claimId: claimId(created.id),
      evidence,
      transitionTo: 'SUPPORTED',
    });
    expect(await db.select().from(backgroundTasks)).toHaveLength(2);
  });

  it('reevaluates only the latest snapshot of each canonical Opportunity', async () => {
    const candidate = candidateId('candidate-memory-current-snapshots');
    await new CandidateRepository(database).createCandidate(candidate);
    const opportunities = new OpportunityRepository(database);
    const firstOpportunity = opportunityId('opportunity-memory-current-first');
    const secondOpportunity = opportunityId(
      'opportunity-memory-current-second',
    );
    await opportunities.createOpportunity(firstOpportunity);
    await opportunities.createOpportunity(secondOpportunity);
    await opportunities.appendSnapshot(
      {
        id: snapshotId('snapshot-memory-current-old'),
        opportunityId: firstOpportunity,
        title: 'Backend Engineer',
        organization: 'Example',
        content: 'Node.js required.',
        fingerprint: 'memory-current-old',
      },
      Date.parse('2026-01-01T00:00:00.000Z'),
    );
    await opportunities.appendSnapshot(
      {
        id: snapshotId('snapshot-memory-current-new'),
        opportunityId: firstOpportunity,
        title: 'Backend Engineer',
        organization: 'Example',
        content: 'Node.js and PostgreSQL required.',
        fingerprint: 'memory-current-new',
      },
      Date.parse('2026-01-02T00:00:00.000Z'),
    );
    await opportunities.appendSnapshot(
      {
        id: snapshotId('snapshot-memory-current-other'),
        opportunityId: secondOpportunity,
        title: 'Frontend Engineer',
        organization: 'Example',
        content: 'React required.',
        fingerprint: 'memory-current-other',
      },
      Date.parse('2026-01-01T00:00:00.000Z'),
    );

    await new CareerMemoryRepository(database).createClaim({
      candidateId: candidate,
      kind: 'skill',
      value: 'Node.js',
      state: 'UNKNOWN',
    });

    const { backgroundTasks } = getTables(database);
    const tasks = await (database.db as any).select().from(backgroundTasks);
    expect(tasks).toHaveLength(2);
    expect(
      tasks.map((task: any) => JSON.parse(task.payload).snapshotId),
    ).toEqual(
      expect.arrayContaining([
        'snapshot-memory-current-new',
        'snapshot-memory-current-other',
      ]),
    );
    expect(
      tasks.map((task: any) => JSON.parse(task.payload).snapshotId),
    ).not.toContain('snapshot-memory-current-old');
  });

  it('creates a reviewed batch with one bounded reevaluation sweep', async () => {
    const candidate = candidateId('candidate-memory-batch');
    await new CandidateRepository(database).createCandidate(candidate);
    const opportunities = new OpportunityRepository(database);
    const opportunity = opportunityId('opportunity-memory-batch');
    await opportunities.createOpportunity(opportunity);
    await opportunities.appendSnapshot({
      id: snapshotId('snapshot-memory-batch'),
      opportunityId: opportunity,
      title: 'Platform Engineer',
      organization: 'Example',
      content: 'Node.js, PostgreSQL, and Linux.',
      fingerprint: 'memory-batch',
    });
    const canonicalBefore = await opportunities.getSnapshot(
      snapshotId('snapshot-memory-batch'),
    );

    const result = await new CareerMemoryRepository(database).createClaimsBatch(
      {
        candidateId: candidate,
        claims: [
          { kind: 'skill', value: 'Node.js', state: 'UNKNOWN' },
          { kind: 'skill', value: 'PostgreSQL', state: 'UNKNOWN' },
          { kind: 'capability', value: 'Linux', state: 'UNKNOWN' },
        ],
      },
    );

    expect(result.claims).toHaveLength(3);
    expect(result.reevaluation.taskCount).toBe(1);
    const { backgroundTasks } = getTables(database);
    expect(
      await (database.db as any).select().from(backgroundTasks),
    ).toHaveLength(1);
    expect(
      await opportunities.getSnapshot(snapshotId('snapshot-memory-batch')),
    ).toEqual(canonicalBefore);
  });

  it('preserves correction and development succession with Evidence on each historical state', async () => {
    const candidate = candidateId('candidate-memory-succession');
    await new CandidateRepository(database).createCandidate(candidate);
    const repository = new CareerMemoryRepository(database);
    const original = await repository.createClaim({
      candidateId: candidate,
      kind: 'skill',
      value: 'Python',
      scope: 'Beginner',
      state: 'SUPPORTED',
      evidence: {
        evidenceType: 'candidate statement',
        excerpt: 'I was a beginner when this was recorded.',
        state: 'candidate-confirmed',
      },
    });

    const developed = await repository.replaceClaim({
      candidateId: candidate,
      claimId: claimId(original.id),
      changeType: 'DEVELOPMENT',
      value: 'Python',
      scope: 'Intermediate',
      state: 'SUPPORTED',
      evidence: {
        evidenceType: 'candidate statement',
        excerpt: 'I have since progressed to intermediate proficiency.',
        state: 'candidate-confirmed',
      },
      note: 'Professional development update.',
    });

    const profile = await repository.getProfile(candidate);
    expect(profile?.claims).toHaveLength(1);
    expect(profile?.claims[0]).toMatchObject({
      id: developed.claim.id,
      scope: 'Intermediate',
      lifecycleState: 'CURRENT',
      predecessorClaimId: original.id,
      successionType: 'DEVELOPMENT',
      evidence: [
        { excerpt: 'I have since progressed to intermediate proficiency.' },
      ],
    });
    expect(profile?.historicalClaims).toHaveLength(1);
    expect(profile?.historicalClaims[0]).toMatchObject({
      id: original.id,
      scope: 'Beginner',
      lifecycleState: 'SUPERSEDED',
      evidence: [{ excerpt: 'I was a beginner when this was recorded.' }],
    });
    expect(
      await new CandidateRepository(database).getClaims(candidate),
    ).toEqual([expect.objectContaining({ id: developed.claim.id })]);
  });

  it('retires a current fact without asserting its opposite or deleting history', async () => {
    const candidate = candidateId('candidate-memory-retire');
    await new CandidateRepository(database).createCandidate(candidate);
    const repository = new CareerMemoryRepository(database);
    const created = await repository.createClaim({
      candidateId: candidate,
      kind: 'certification',
      value: 'Synthetic certification',
      state: 'SUPPORTED',
      evidence: {
        evidenceType: 'candidate statement',
        excerpt: 'Synthetic acceptance Evidence.',
        state: 'candidate-confirmed',
      },
    });
    await repository.retireClaim({
      candidateId: candidate,
      claimId: claimId(created.id),
      note: 'No longer current.',
    });
    const profile = await repository.getProfile(candidate);
    expect(profile?.claims).toEqual([]);
    expect(profile?.historicalClaims[0]).toMatchObject({
      id: created.id,
      state: 'SUPPORTED',
      lifecycleState: 'RETIRED',
      successionNote: 'No longer current.',
      evidence: [{ excerpt: 'Synthetic acceptance Evidence.' }],
    });
  });

  it('records a correction as a new current state without rewriting the mistaken state', async () => {
    const candidate = candidateId('candidate-memory-correction');
    await new CandidateRepository(database).createCandidate(candidate);
    const repository = new CareerMemoryRepository(database);
    const mistaken = await repository.createClaim({
      candidateId: candidate,
      kind: 'experience',
      value: 'React experience',
      scope: '8 years',
      state: 'SUPPORTED',
      evidence: {
        evidenceType: 'candidate statement',
        excerpt: 'Mistaken entry recorded as eight years.',
        state: 'candidate-confirmed',
      },
    });
    await repository.replaceClaim({
      candidateId: candidate,
      claimId: claimId(mistaken.id),
      changeType: 'CORRECTION',
      value: 'React experience',
      scope: '3 years',
      state: 'SUPPORTED',
      evidence: {
        evidenceType: 'candidate correction',
        excerpt: 'The correct duration is three years.',
        state: 'candidate-confirmed',
      },
      note: 'Corrected an entry mistake.',
    });
    const profile = await repository.getProfile(candidate);
    expect(profile?.claims[0]).toMatchObject({
      scope: '3 years',
      successionType: 'CORRECTION',
      successionNote: 'Corrected an entry mistake.',
      evidence: [{ excerpt: 'The correct duration is three years.' }],
    });
    expect(profile?.historicalClaims[0]).toMatchObject({
      scope: '8 years',
      evidence: [{ excerpt: 'Mistaken entry recorded as eight years.' }],
    });
  });

  it('rejects normalized duplicate current identity without fuzzy merging', async () => {
    const candidate = candidateId('candidate-memory-identity');
    await new CandidateRepository(database).createCandidate(candidate);
    const repository = new CareerMemoryRepository(database);
    await repository.createClaim({
      candidateId: candidate,
      kind: 'skill',
      value: 'Node.js',
      state: 'UNKNOWN',
    });
    await expect(
      repository.createClaim({
        candidateId: candidate,
        kind: 'SKILL',
        value: 'node js',
        state: 'UNKNOWN',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_CURRENT_CLAIM' });
  });

  it('serializes concurrent normalized duplicate authoring to one current fact', async () => {
    const candidate = candidateId('candidate-memory-identity-race');
    await new CandidateRepository(database).createCandidate(candidate);
    const repository = new CareerMemoryRepository(database);
    const results = await Promise.allSettled([
      repository.createClaim({
        candidateId: candidate,
        kind: 'skill',
        value: 'NodeJS',
        state: 'UNKNOWN',
      }),
      repository.createClaim({
        candidateId: candidate,
        kind: 'SKILL',
        value: 'node.js',
        state: 'UNKNOWN',
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect((await repository.getProfile(candidate))?.claims).toHaveLength(1);
  });

  it('keeps a 100-fact current profile query bounded and free of row-by-row Evidence queries', async () => {
    const candidate = candidateId('candidate-memory-large');
    await new CandidateRepository(database).createCandidate(candidate);
    const repository = new CareerMemoryRepository(database);
    await repository.createClaimsBatch({
      candidateId: candidate,
      claims: Array.from({ length: 100 }, (_, index) => ({
        kind: 'synthetic_skill',
        value: `Synthetic skill ${index + 1}`,
        state: 'UNKNOWN' as const,
      })),
    });
    const startedAt = performance.now();
    const profile = await repository.getProfile(candidate);
    expect(profile?.claims).toHaveLength(100);
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });

  it('derives failed reevaluation state from durable task failure', async () => {
    const candidate = candidateId('candidate-memory-reevaluation-failure');
    await new CandidateRepository(database).createCandidate(candidate);
    const opportunity = opportunityId(
      'opportunity-memory-reevaluation-failure',
    );
    const opportunities = new OpportunityRepository(database);
    await opportunities.createOpportunity(opportunity);
    await opportunities.appendSnapshot({
      id: snapshotId('snapshot-memory-reevaluation-failure'),
      opportunityId: opportunity,
      title: 'Synthetic role',
      organization: 'Synthetic organization',
      content: 'Synthetic content.',
      fingerprint: 'memory-reevaluation-failure',
    });
    const repository = new CareerMemoryRepository(database);
    const mutation = await repository.createClaimsBatch({
      candidateId: candidate,
      claims: [{ kind: 'skill', value: 'Synthetic skill', state: 'UNKNOWN' }],
    });
    const ledger = new BackgroundTaskLedger(database);
    const task = await ledger.claimNext({
      leaseOwner: 'failure-test',
      leaseDurationMs: 30_000,
    });
    await ledger.markFailed(task!.id, 'failure-test', 'Synthetic failure');
    expect(
      await repository.getReevaluation(candidate, mutation.reevaluation.id),
    ).toMatchObject({ state: 'FAILED', failedTaskCount: 1 });
  });
});
