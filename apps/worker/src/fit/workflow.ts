import { createHash, randomUUID } from 'node:crypto';

import {
  BackgroundTaskLedger,
  CandidateRepository,
  EvaluationRepository,
  EvidenceRepository,
  OpportunityRepository,
  RequirementSetRepository,
  type BackgroundTask,
  type DatabaseHandle,
} from '@oca/database';
import type {
  CandidateId,
  ClaimId,
  EvaluationId,
  EvidenceId,
  FindingId,
  SnapshotId,
  RequirementId,
} from '@oca/domain';
import {
  CANONICAL_FIT_ENGINE_VERSION,
  canonicalFitRequirements,
  evaluateFitRequirements,
  FitEngine,
  REQUIREMENT_EVALUATION_POLICY_VERSION,
} from '@oca/intelligence';
import { requirementSetId } from '@oca/domain';

import type { BackgroundTaskHandler } from '../worker.js';

export interface FitFingerprintClaim {
  readonly id?: string;
  readonly kind: string;
  readonly value: string;
  readonly scope?: string | null;
  readonly state: string;
  readonly confidence: string | null;
  readonly updatedAt?: Date;
  readonly evidence: readonly {
    readonly id?: string;
    readonly evidenceType: string;
    readonly state: string;
    readonly sourceReference: string;
    readonly excerpt: string;
    readonly createdAt?: Date;
  }[];
}

export function fingerprintFitInputs(input: {
  engineVersion: string;
  snapshotFingerprint: string;
  claims: readonly FitFingerprintClaim[];
  requirementInputMode?: string;
  requirementInputFingerprint?: string;
  policyVersion?: string;
}): string {
  const canonical = input.claims
    .map((claim) => {
      const evidence = claim.evidence
        .map((item) => ({
          evidenceType: item.evidenceType,
          state: item.state,
          sourceReference: item.sourceReference,
          excerpt: item.excerpt,
        }))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
      return {
        kind: claim.kind,
        value: claim.value,
        scope: claim.scope ?? null,
        state: claim.state,
        confidence: claim.confidence,
        evidence,
      };
    })
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  return createHash('sha256')
    .update(
      JSON.stringify({
        engineVersion: input.engineVersion,
        requirementInputMode: input.requirementInputMode ?? null,
        requirementInputFingerprint: input.requirementInputFingerprint ?? null,
        policyVersion: input.policyVersion ?? null,
        snapshotFingerprint: input.snapshotFingerprint,
        claims: canonical,
      }),
    )
    .digest('hex');
}

export function createFitHandlers(deps: {
  db: DatabaseHandle;
}): Record<string, BackgroundTaskHandler> {
  const opportunityRepository = new OpportunityRepository(deps.db);
  const candidateRepository = new CandidateRepository(deps.db);
  const evaluationRepository = new EvaluationRepository(deps.db);
  const evidenceRepository = new EvidenceRepository(deps.db);
  const taskLedger = new BackgroundTaskLedger(deps.db);
  const engine = new FitEngine();
  const requirementSets = new RequirementSetRepository(deps.db);

  return {
    'fit.evaluate': async (task: BackgroundTask) => {
      const payload = task.payload as {
        evaluationId?: string;
        snapshotId?: string;
        candidateId?: string;
        profileReevaluationId?: string;
      };
      if (
        !payload.evaluationId ||
        !payload.snapshotId ||
        !payload.candidateId
      ) {
        throw new Error(
          'fit.evaluate requires evaluationId, snapshotId, and candidateId',
        );
      }

      const evaluationId = payload.evaluationId as EvaluationId;
      const snapshotId = payload.snapshotId as SnapshotId;
      const candidateId = payload.candidateId as CandidateId;
      const evaluation = await evaluationRepository.getEvaluation(evaluationId);
      if (!evaluation)
        throw new Error(`Evaluation not found: ${payload.evaluationId}`);
      if (
        evaluation.snapshotId !== snapshotId ||
        evaluation.candidateId !== candidateId
      ) {
        throw new Error('Fit task input does not match its Evaluation');
      }

      const snapshot = await opportunityRepository.getSnapshot(snapshotId);
      if (!snapshot)
        throw new Error(`Snapshot not found: ${payload.snapshotId}`);
      const claims = await candidateRepository.getClaims(candidateId);
      const linkedSet = evaluation.requirementSetId
        ? await requirementSets.getById(
            requirementSetId(evaluation.requirementSetId),
          )
        : null;
      if (evaluation.requirementSetId && !linkedSet) {
        throw new Error('Fit Evaluation Requirement Set lineage is invalid');
      }
      if (
        linkedSet &&
        (linkedSet.set.snapshotId !== snapshotId ||
          linkedSet.set.inputFingerprint !==
            evaluation.requirementInputFingerprint)
      ) {
        throw new Error('Fit Evaluation Requirement Set lineage is invalid');
      }
      const claimsWithEvidence = await Promise.all(
        claims.map(async (claim: any) => {
          const evList = await evidenceRepository.getClaimEvidence(
            claim.id as ClaimId,
          );
          return {
            id: claim.id,
            kind: claim.kind,
            value: claim.value,
            scope: claim.scope,
            state: claim.state,
            confidence: claim.confidence,
            updatedAt: claim.updatedAt,
            evidence: evList.map((item: any) => ({
              id: item.id,
              evidenceType: item.evidenceType,
              state: item.state,
              sourceReference: item.sourceReference,
              excerpt: item.excerpt,
              createdAt: item.createdAt,
            })),
          };
        }),
      );

      const engineVersion = linkedSet
        ? CANONICAL_FIT_ENGINE_VERSION
        : engine.version;
      const inputFingerprint = fingerprintFitInputs({
        engineVersion,
        snapshotFingerprint: snapshot.fingerprint,
        claims: claimsWithEvidence,
        requirementInputMode: linkedSet ? 'CANONICAL' : 'FALLBACK_TRANSIENT_V1',
        ...(linkedSet
          ? { requirementInputFingerprint: linkedSet.set.inputFingerprint }
          : {}),
        policyVersion: REQUIREMENT_EVALUATION_POLICY_VERSION,
      });

      const existing = await evaluationRepository.findFitEvaluation({
        candidateId,
        snapshotId,
        engineVersion,
        inputFingerprint,
      });
      if (existing) {
        if (existing.id !== evaluationId) {
          await evaluationRepository.copyAssessment({
            sourceEvaluationId: existing.id as EvaluationId,
            targetEvaluationId: evaluationId,
            category: 'fit',
          });
        }
        await taskLedger.enqueue({
          taskType: 'quality.evaluate',
          payload: {
            evaluationId,
            snapshotId,
            candidateId,
            ...(payload.profileReevaluationId
              ? { profileReevaluationId: payload.profileReevaluationId }
              : {}),
          },
          idempotencyKey: `quality-${evaluationId}`,
        });
        return;
      }

      const canonicalRequirements = linkedSet
        ? canonicalFitRequirements(linkedSet)
        : [];
      const result = linkedSet
        ? evaluateFitRequirements(
            canonicalRequirements,
            claimsWithEvidence,
            CANONICAL_FIT_ENGINE_VERSION,
          )
        : engine.evaluate(snapshot, claimsWithEvidence);

      await evaluationRepository.persistFitResult({
        evaluationId,
        fit: {
          assessmentStatus: result.assessmentStatus,
          level: result.overallLevel,
          engineVersion: result.version,
          inputFingerprint,
          summary: result.summary,
        },
        findings: result.findings.map((item) => ({
          id: randomUUID() as FindingId,
          dimensionKey: item.requirementId,
          label: item.label,
          state: item.state,
          summary: item.explanation,
          confidence: item.confidence,
          modality: item.modality,
          requirementText: item.requirement,
          explanation: item.explanation,
          ...(linkedSet
            ? {
                canonicalRequirementId: item.requirementId as RequirementId,
              }
            : {}),
          opportunityEvidence: linkedSet
            ? (
                canonicalRequirements.find(
                  (requirement) => requirement.id === item.requirementId,
                )?.provenance ?? []
              ).map((provenance) => ({
                id: randomUUID() as EvidenceId,
                evidenceType: 'canonical-requirement-provenance',
                sourceReference: `Listing requirement · ${provenance.sourceFieldPath ?? provenance.normalizedSection ?? 'listing content'}`,
                excerpt: provenance.excerpt,
                state: 'source-verified' as const,
              }))
            : [
                {
                  id: randomUUID() as EvidenceId,
                  evidenceType: 'opportunity-requirement',
                  sourceReference: item.opportunityEvidenceReference,
                  excerpt: item.requirement,
                  state: 'source-verified' as const,
                },
              ],
          candidateEvidenceIds: item.candidateEvidenceReferences.flatMap(
            (reference) => {
              if (!reference.startsWith('claim:')) return [];
              const claimId = reference.slice('claim:'.length);
              return (
                claimsWithEvidence.find((claim: any) => claim.id === claimId)
                  ?.evidence ?? []
              ).map(
                (candidateEvidence: any) => candidateEvidence.id as EvidenceId,
              );
            },
          ),
        })),
      });

      await taskLedger.enqueue({
        taskType: 'quality.evaluate',
        payload: {
          evaluationId,
          snapshotId,
          candidateId,
          ...(payload.profileReevaluationId
            ? { profileReevaluationId: payload.profileReevaluationId }
            : {}),
        },
        idempotencyKey: `quality-${evaluationId}`,
      });
    },
  };
}
