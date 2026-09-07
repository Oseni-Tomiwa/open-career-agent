import type { DatabaseHandle } from '@oca/database';
import {
  OpportunityRepository,
  CandidateRepository,
  EvaluationRepository,
  BackgroundTaskLedger,
  EvidenceRepository,
  RequirementSetRepository,
} from '@oca/database';
import type { BackgroundTaskHandler } from '../worker.js';
import type { BackgroundTask } from '@oca/database';
import type {
  SnapshotId,
  CandidateId,
  EvaluationId,
  FindingId,
  EvidenceId,
  RequirementId,
} from '@oca/domain';
import { requirementSetId } from '@oca/domain';
import {
  EligibilityEngine,
  CANONICAL_ELIGIBILITY_ENGINE_VERSION,
  canonicalEligibilityConstraints,
  REQUIREMENT_EVALUATION_POLICY_VERSION,
  V2_3_1_DETERMINISTIC_EXTRACTOR_VERSION,
  V2_2_PIPELINE_VERSION,
} from '@oca/intelligence';
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
  requirementInputFingerprint?: string;
  policyVersion?: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        engineVersion: input.engineVersion,
        policyVersion: input.policyVersion ?? null,
        ...(input.requirementInputFingerprint
          ? { requirementInputFingerprint: input.requirementInputFingerprint }
          : {}),
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
  const requirementSets = new RequirementSetRepository(deps.db);
  const evidenceRepo = new EvidenceRepository(deps.db);

  return {
    'eligibility.evaluate': async (task: BackgroundTask) => {
      const payload = task.payload as {
        snapshotId: string;
        candidateId?: string;
        profileReevaluationId?: string;
        requirementSetId?: string;
        requirementInputFingerprint?: string;
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
      const linkedSet = payload.requirementSetId
        ? await requirementSets.getById(
            requirementSetId(payload.requirementSetId),
          )
        : await requirementSets.getLatestCompatible({
            snapshotId: snapId as SnapshotId,
            extractorPipelineVersion: V2_2_PIPELINE_VERSION,
            deterministicExtractorVersion:
              V2_3_1_DETERMINISTIC_EXTRACTOR_VERSION,
          });
      if (
        payload.requirementSetId &&
        (!linkedSet ||
          linkedSet.set.snapshotId !== snapId ||
          linkedSet.set.inputFingerprint !==
            payload.requirementInputFingerprint)
      ) {
        throw new Error('Eligibility task Requirement Set lineage is invalid');
      }
      const claims = await candidateRepo.getClaims(
        candId as unknown as CandidateId,
      );

      const normalizedClaims = claims.map((claim) => ({
        ...claim,
        state:
          claim.state === 'CONFLICTING'
            ? 'conflict'
            : claim.state.toLowerCase(),
      }));
      const canonicalConstraints = linkedSet
        ? canonicalEligibilityConstraints(linkedSet)
        : [];
      const result = linkedSet
        ? engine.evaluateConstraints(
            canonicalConstraints,
            normalizedClaims,
            CANONICAL_ELIGIBILITY_ENGINE_VERSION,
          )
        : engine.evaluate(snapshot, normalizedClaims);

      const evalId = randomUUID();
      const inputFingerprint = fingerprintEligibilityInputs({
        engineVersion: result.version,
        policyVersion: REQUIREMENT_EVALUATION_POLICY_VERSION,
        ...(linkedSet
          ? { requirementInputFingerprint: linkedSet.set.inputFingerprint }
          : {}),
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
          ...(linkedSet
            ? {
                requirementSetId: linkedSet.set.id,
                requirementInputFingerprint: linkedSet.set.inputFingerprint,
                requirementInputMode: 'CANONICAL' as const,
              }
            : { requirementInputMode: 'FALLBACK_TRANSIENT_V1' as const }),
          eligibilityState: result.overallState,
          eligibilityEngineVersion: result.version,
          eligibilityInputFingerprint: inputFingerprint,
        });

        for (const finding of result.findings) {
          const findingId = randomUUID() as unknown as FindingId;
          await evalRepo.persistFinding({
            id: findingId,
            evaluationId: evalId as unknown as EvaluationId,
            category: 'eligibility',
            dimensionKey: finding.dimension,
            state: finding.state,
            summary: finding.summary,
            confidence: finding.confidence,
            ...(finding.canonicalRequirementId
              ? {
                  canonicalRequirementId:
                    finding.canonicalRequirementId as RequirementId,
                }
              : {}),
          });
          const constraint = canonicalConstraints.find(
            (item) =>
              item.canonicalRequirementId === finding.canonicalRequirementId,
          );
          for (const provenance of constraint?.provenance ?? []) {
            await evidenceRepo.attachToFinding(findingId, {
              id: randomUUID() as EvidenceId,
              evidenceType: 'canonical-requirement-provenance',
              sourceReference: `Listing requirement · ${provenance.sourceFieldPath ?? provenance.normalizedSection ?? 'listing content'}`,
              excerpt: provenance.excerpt,
              state: 'source-verified',
            });
          }
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
