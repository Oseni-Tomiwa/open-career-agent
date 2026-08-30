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
import { backgroundTasks } from './schema.js';

describe('Career Memory repository', () => {
  let directory: string;
  let database: DatabaseHandle;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'oca-career-memory-'));
    database = openDatabase(join(directory, 'test.sqlite'));
    applyMigrations(database);
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('round-trips state, scope, confidence, and candidate-confirmed Evidence', () => {
    const candidate = candidateId('candidate-memory-roundtrip');
    new CandidateRepository(database).createCandidate(candidate);
    const repository = new CareerMemoryRepository(database);
    repository.createClaim({
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

    expect(repository.getProfile(candidate)).toMatchObject({
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

  it('preserves historical Evidence and contradiction state', () => {
    const candidate = candidateId('candidate-memory-conflict');
    new CandidateRepository(database).createCandidate(candidate);
    const repository = new CareerMemoryRepository(database);
    const created = repository.createClaim({
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
    repository.attachEvidence({
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

    expect(repository.getProfile(candidate)?.claims[0]).toMatchObject({
      state: 'CONFLICTING',
      evidence: [{ state: 'candidate-confirmed' }, { state: 'disputed' }],
    });
    expect(() =>
      repository.updateClaim({
        candidateId: candidate,
        claimId: claimId(created.id),
        state: 'SUPPORTED',
      }),
    ).toThrow(CareerMemoryError);
  });

  it('prevents cross-candidate linkage and supported content rewriting', () => {
    const first = candidateId('candidate-memory-first');
    const second = candidateId('candidate-memory-second');
    const candidates = new CandidateRepository(database);
    candidates.createCandidate(first);
    candidates.createCandidate(second);
    const repository = new CareerMemoryRepository(database);
    const created = repository.createClaim({
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

    expect(() =>
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
    ).toThrow(CareerMemoryError);
    expect(() =>
      repository.updateClaim({
        candidateId: first,
        claimId: claimId(created.id),
        value: 'Kubernetes',
      }),
    ).toThrow(CareerMemoryError);
    expect(repository.getProfile(second)?.claims).toEqual([]);
  });

  it('enqueues semantic reevaluation idempotently', () => {
    const candidate = candidateId('candidate-memory-tasks');
    new CandidateRepository(database).createCandidate(candidate);
    const opportunities = new OpportunityRepository(database);
    const opportunity = opportunityId('opportunity-memory-tasks');
    opportunities.createOpportunity(opportunity);
    opportunities.appendSnapshot({
      id: snapshotId('snapshot-memory-tasks'),
      opportunityId: opportunity,
      title: 'Backend Engineer',
      organization: 'Example',
      content: 'Node.js required.',
      fingerprint: 'memory-task-snapshot',
    });
    const repository = new CareerMemoryRepository(database);
    const created = repository.createClaim({
      candidateId: candidate,
      kind: 'skill',
      value: 'Node.js',
      state: 'UNKNOWN',
    });
    expect(database.db.select().from(backgroundTasks).all()).toHaveLength(1);

    const evidence = {
      evidenceType: 'user-confirmed statement',
      excerpt: 'I have delivered Node.js services.',
      state: 'candidate-confirmed' as const,
    };
    repository.attachEvidence({
      candidateId: candidate,
      claimId: claimId(created.id),
      evidence,
      transitionTo: 'SUPPORTED',
    });
    expect(database.db.select().from(backgroundTasks).all()).toHaveLength(2);
    repository.attachEvidence({
      candidateId: candidate,
      claimId: claimId(created.id),
      evidence,
      transitionTo: 'SUPPORTED',
    });
    expect(database.db.select().from(backgroundTasks).all()).toHaveLength(2);
  });
});
