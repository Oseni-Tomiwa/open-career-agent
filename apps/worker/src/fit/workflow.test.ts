import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  BackgroundTaskLedger,
  CandidateRepository,
  EvaluationRepository,
  EvidenceRepository,
  openDatabase,
  OpportunityRepository,
  type BackgroundTask,
  type DatabaseHandle,
} from '@oca/database';
import {
  candidateId,
  claimId,
  evaluationId,
  evidenceId,
  findingId,
  opportunityId,
  snapshotId,
} from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFitHandlers } from './workflow.js';
import { createEligibilityHandlers } from '../eligibility/workflow.js';

function task(payload: BackgroundTask['payload']): BackgroundTask {
  const now = new Date();
  return {
    id: 'fit-task',
    taskType: 'fit.evaluate',
    payload,
    state: 'RUNNING',
    attempts: 1,
    maxAttempts: 3,
    availableAt: now,
    leaseOwner: 'test',
    leaseExpiresAt: new Date(now.getTime() + 30_000),
    idempotencyKey: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('fit.evaluate durable workflow', () => {
  let directory: string;
  let database: DatabaseHandle;
  const candidate = candidateId('candidate-fit');
  const opportunity = opportunityId('opportunity-fit');
  const snapshot = snapshotId('snapshot-fit');

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-fit-worker-'));
    database = openDatabase(join(directory, 'fit.sqlite'));
    await applyMigrations(database);

    const candidateRepository = new CandidateRepository(database);
    await candidateRepository.createCandidate(candidate);
    await candidateRepository.addClaim({
      id: claimId('claim-node'),
      candidateId: candidate,
      kind: 'skill',
      value: 'Node.js',
      state: 'SUPPORTED',
    });
    await new EvidenceRepository(database).attachToClaim(
      claimId('claim-node'),
      {
        id: evidenceId('evidence-node'),
        evidenceType: 'work',
        sourceReference: 'fictional-resume',
        excerpt: 'Built Node.js services.',
        state: 'candidate-confirmed',
      },
    );

    const opportunityRepository = new OpportunityRepository(database);
    await opportunityRepository.createOpportunity(opportunity);
    await opportunityRepository.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Backend Engineer',
      organization: 'Example',
      content: 'Node.js experience required. Kubernetes is a plus.',
      fingerprint: 'snapshot-hash',
    });
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function createEvaluation(id: string) {
    const repository = new EvaluationRepository(database);
    await repository.persistEvaluation({
      id: evaluationId(id),
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'ineligible',
      eligibilityEngineVersion: 'eligibility-v1',
    });
    return evaluationId(id);
  }

  it('populates Fit without overwriting Eligibility or inventing Quality', async () => {
    const evaluation = await createEvaluation('evaluation-fit');
    await new EvaluationRepository(database).persistFinding({
      id: findingId('eligibility-finding'),
      evaluationId: evaluation,
      category: 'eligibility',
      dimensionKey: 'work_authorization',
      state: 'ineligible',
      summary: 'Fictional eligibility blocker.',
      confidence: 'high',
    });
    await createFitHandlers({ db: database })['fit.evaluate']!(
      task({
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const repository = new EvaluationRepository(database);
    const evalData = await repository.getEvaluation(evaluation);
    expect(evalData).toMatchObject({
      eligibilityState: 'ineligible',
      eligibilityEngineVersion: 'eligibility-v1',
      fitLevel: 'strong',
      fitEngineVersion: 'fit-v1',
      qualityLevel: null,
    });
    const findings = await repository.getFitFindings(evaluation);
    expect(findings).toHaveLength(2);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: 'STRONG_MATCH',
          modality: 'required',
        }),
        expect.objectContaining({
          state: 'NO_EVIDENCE',
          modality: 'preferred',
        }),
      ]),
    );
    const node = findings.find((item) => item.label === 'node.js');
    const evidence = await new EvidenceRepository(database).getFindingEvidence(
      findingId(node!.id),
    );
    expect(evidence.map((item) => item.sourceReference)).toEqual(
      expect.arrayContaining(['snapshot:snapshot-fit', 'fictional-resume']),
    );
    const allFindings = await repository.getFindings(evaluation);
    expect(allFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'eligibility',
          state: 'ineligible',
        }),
      ]),
    );
  });

  it('treats a completed Fit dimension as write-once against stale tasks', async () => {
    const evaluation = await createEvaluation('evaluation-write-once');
    const handler = createFitHandlers({ db: database })['fit.evaluate']!;
    await handler(
      task({
        evaluationId: evaluation,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const repository = new EvaluationRepository(database);
    const before = await repository.getEvaluation(evaluation);
    const findingCount = (await repository.getFitFindings(evaluation)).length;
    const staleWriteAccepted = await repository.persistFitResult({
      evaluationId: evaluation,
      fit: {
        level: 'weak',
        engineVersion: 'fit-stale',
        inputFingerprint: 'stale-input',
        summary: 'This stale result must not win.',
      },
      findings: [],
    });

    expect(staleWriteAccepted).toBe(false);
    const after = await repository.getEvaluation(evaluation);
    expect(after).toMatchObject({
      eligibilityState: before?.eligibilityState,
      eligibilityEngineVersion: before?.eligibilityEngineVersion,
      fitLevel: before?.fitLevel,
      fitEngineVersion: before?.fitEngineVersion,
      fitInputFingerprint: before?.fitInputFingerprint,
      fitSummary: before?.fitSummary,
    });
    expect(await repository.getFitFindings(evaluation)).toHaveLength(
      findingCount,
    );
  });

  it('does not append a duplicate Fit result for identical knowledge inputs', async () => {
    const first = await createEvaluation('evaluation-first');
    const second = await createEvaluation('evaluation-second');
    const handler = createFitHandlers({ db: database })['fit.evaluate']!;
    await handler(
      task({
        evaluationId: first,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );
    await handler(
      task({
        evaluationId: second,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const repository = new EvaluationRepository(database);
    expect((await repository.getEvaluation(first))?.fitEngineVersion).toBe(
      'fit-v1',
    );
    expect((await repository.getEvaluation(second))?.fitEngineVersion).toBe(
      'fit-v1',
    );
    expect(await repository.getFitFindings(second)).not.toHaveLength(0);
  });

  it('permits a new historical Fit result after candidate evidence changes', async () => {
    const first = await createEvaluation('evaluation-before-change');
    const handler = createFitHandlers({ db: database })['fit.evaluate']!;
    await handler(
      task({
        evaluationId: first,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    await new CandidateRepository(database).addClaim({
      id: claimId('claim-kubernetes'),
      candidateId: candidate,
      kind: 'project_skill',
      value: 'Kubernetes',
      state: 'SUPPORTED',
    });
    const second = await createEvaluation('evaluation-after-change');
    await handler(
      task({
        evaluationId: second,
        snapshotId: snapshot,
        candidateId: candidate,
      }),
    );

    const repository = new EvaluationRepository(database);
    expect((await repository.getEvaluation(second))?.fitEngineVersion).toBe(
      'fit-v1',
    );
    expect(
      (await repository.getEvaluation(second))?.fitInputFingerprint,
    ).not.toBe((await repository.getEvaluation(first))?.fitInputFingerprint);
  });

  it('is scheduled after Eligibility regardless of Eligibility outcome', async () => {
    await createEligibilityHandlers({ db: database })['eligibility.evaluate']!(
      task({ snapshotId: snapshot, candidateId: candidate }),
    );

    const scheduled = await new BackgroundTaskLedger(database).claimNext({
      leaseOwner: 'test-worker',
      leaseDurationMs: 30_000,
    });
    expect(scheduled).toMatchObject({
      taskType: 'fit.evaluate',
      payload: { snapshotId: snapshot, candidateId: candidate },
    });
  });
});
