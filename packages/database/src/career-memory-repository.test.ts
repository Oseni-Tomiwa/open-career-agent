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
});
