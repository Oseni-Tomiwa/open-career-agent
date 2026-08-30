import type { DatabaseHandle } from '@oca/database';
import {
  OpportunityRepository,
  CandidateRepository,
  EvaluationRepository,
  BackgroundTaskLedger,
  candidates,
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
    'eligibility.evaluate': (task: BackgroundTask) => {
      const payload = task.payload as {
        snapshotId: string;
        candidateId?: string;
      };
      const snapId = payload.snapshotId;

      const snapshot = oppRepo.getSnapshot(snapId as unknown as SnapshotId);
      if (!snapshot) {
        throw new Error(`Snapshot not found: ${snapId}`);
      }

      // For MVP, evaluate against ALL candidates, or if candidateId is provided, just that one.
      // Usually there's only one user candidate in a single-tenant agent context.
      // Let's assume we find a single default candidate for now if not provided
      let candId = payload.candidateId;
      if (!candId) {
        // Just hacky lookup for first candidate to evaluate
        const dbCandidates = deps.db.db.select().from(candidates).all();
        if (dbCandidates.length === 0) return;
        candId = dbCandidates[0]?.id;
        if (!candId) return;
      }

      if (!candId) return;
      const claims = candidateRepo.getClaims(candId as unknown as CandidateId);

      const result = engine.evaluate(
        snapshot,
        claims.map((claim) => ({
          ...claim,
          // Eligibility V1 predates the canonical persistence vocabulary.
          // Keep the frozen engine stable and adapt at its workflow boundary.
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

      deps.db.db.transaction(() => {
        evalRepo.supersedeCurrentEvaluation({
          candidateId: candId as CandidateId,
          snapshotId: snapId as SnapshotId,
        });
        evalRepo.persistEvaluation({
          id: evalId as unknown as EvaluationId,
          candidateId: candId as unknown as CandidateId,
          snapshotId: snapId as unknown as SnapshotId,
          eligibilityState: result.overallState,
          eligibilityEngineVersion: result.version,
          eligibilityInputFingerprint: inputFingerprint,
          // fitLevel and qualityLevel are omitted/null for now
        });

        for (const finding of result.findings) {
          evalRepo.persistFinding({
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

      ledger.enqueue({
        taskType: 'fit.evaluate',
        payload: {
          evaluationId: evalId,
          snapshotId: snapId,
          candidateId: candId,
        },
        idempotencyKey: `fit-${evalId}`,
      });
    },
  };
}
