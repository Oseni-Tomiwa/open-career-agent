import type { DatabaseHandle } from '@oca/database';
import {
  OpportunityRepository,
  CandidateRepository,
  EvaluationRepository,
  BackgroundTaskLedger,
} from '@oca/database';
import type { BackgroundTaskHandler } from '../worker.js';
import type { BackgroundTask } from '@oca/database';
import type {
  SnapshotId,
  CandidateId,
  EvaluationId,
  FindingId,
} from '@oca/domain';
import { EligibilityEngine } from '@oca/intelligence';
import { createHash, randomUUID } from 'node:crypto';

function fingerprintEligibilityInputs(input: {
  snapshotFingerprint: string;
  claims: readonly {
    kind: string;
    value: string;
    state: string;
    scope: string | null;
  }[];
  engineVersion: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        engineVersion: input.engineVersion,
        snapshotFingerprint: input.snapshotFingerprint,
        claims: [...input.claims].sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b)),
        ),
      }),
    )
    .digest('hex');
}

export function createEligibilityHandlers(deps: {
  db: DatabaseHandle;
}): Record<string, BackgroundTaskHandler> {
  const oppRepo = new OpportunityRepository(deps.db);
  const candidateRepo = new CandidateRepository(deps.db);
  const evalRepo = new EvaluationRepository(deps.db);
  const engine = new EligibilityEngine();
  const ledger = new BackgroundTaskLedger(deps.db);

  return {
    'eligibility.evaluate': async (task: BackgroundTask) => {
      const payload = task.payload as {
        snapshotId: string;
        candidateId?: string;
        profileReevaluationId?: string;
      };
      const snapId = payload.snapshotId;

      if (!payload.candidateId) {
        throw new Error('eligibility.evaluate payload missing candidateId');
      }

      const snapshot = await oppRepo.getSnapshot(
        snapId as unknown as SnapshotId,
      );
      if (!snapshot) {
        throw new Error(`Snapshot not found: ${snapId}`);
      }

      const candId = payload.candidateId;
      const claims = await candidateRepo.getClaims(
        candId as unknown as CandidateId,
      );

      const result = engine.evaluate(
        snapshot,
        claims.map((claim) => ({
          ...claim,
          state:
            claim.state === 'CONFLICTING'
              ? 'conflict'
              : claim.state.toLowerCase(),
        })),
      );

      const evalId = randomUUID();
      const inputFingerprint = fingerprintEligibilityInputs({
        engineVersion: result.version,
        snapshotFingerprint: snapshot.fingerprint,
        claims: claims.map((claim) => ({
          kind: claim.kind,
          value: claim.value,
          state: claim.state,
          scope: claim.scope,
        })),
      });

      const db = deps.db.db as any;
      await db.transaction(async () => {
        await evalRepo.supersedeCurrentEvaluation({
          candidateId: candId as CandidateId,
          snapshotId: snapId as SnapshotId,
        });
        await evalRepo.persistEvaluation({
          id: evalId as unknown as EvaluationId,
          candidateId: candId as unknown as CandidateId,
          snapshotId: snapId as unknown as SnapshotId,
          eligibilityState: result.overallState,
          eligibilityEngineVersion: result.version,
          eligibilityInputFingerprint: inputFingerprint,
        });

        for (const finding of result.findings) {
          await evalRepo.persistFinding({
            id: randomUUID() as unknown as FindingId,
            evaluationId: evalId as unknown as EvaluationId,
            category: 'eligibility',
            dimensionKey: finding.dimension,
            state: finding.state,
            summary: finding.summary,
            confidence: finding.confidence,
          });
        }
      });

      await ledger.enqueue({
        taskType: 'fit.evaluate',
        payload: {
          evaluationId: evalId,
          snapshotId: snapId,
          candidateId: candId,
          ...(payload.profileReevaluationId
            ? { profileReevaluationId: payload.profileReevaluationId }
            : {}),
        },
        idempotencyKey: `fit-${evalId}`,
      });
    },
  };
}
