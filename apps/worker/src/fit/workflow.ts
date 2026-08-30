import { createHash, randomUUID } from 'node:crypto';

import {
  CandidateRepository,
  EvaluationRepository,
  EvidenceRepository,
  OpportunityRepository,
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
} from '@oca/domain';
import { FitEngine } from '@oca/intelligence';

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
  const engine = new FitEngine();

  return {
    'fit.evaluate': (task: BackgroundTask) => {
      const payload = task.payload as {
        evaluationId?: string;
        snapshotId?: string;
        candidateId?: string;
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
      const evaluation = evaluationRepository.getEvaluation(evaluationId);
      if (!evaluation)
        throw new Error(`Evaluation not found: ${payload.evaluationId}`);
      if (
        evaluation.snapshotId !== snapshotId ||
        evaluation.candidateId !== candidateId
      ) {
        throw new Error('Fit task input does not match its Evaluation');
      }

      const snapshot = opportunityRepository.getSnapshot(snapshotId);
      if (!snapshot)
        throw new Error(`Snapshot not found: ${payload.snapshotId}`);
      const claims = candidateRepository.getClaims(candidateId);
      const claimsWithEvidence = claims.map((claim) => ({
        id: claim.id,
        kind: claim.kind,
        value: claim.value,
        scope: claim.scope,
        state: claim.state,
        confidence: claim.confidence,
        updatedAt: claim.updatedAt,
        evidence: evidenceRepository
          .getClaimEvidence(claim.id as ClaimId)
          .map((item) => ({
            id: item.id,
            evidenceType: item.evidenceType,
            state: item.state,
            sourceReference: item.sourceReference,
            excerpt: item.excerpt,
            createdAt: item.createdAt,
          })),
      }));
      const inputFingerprint = fingerprintFitInputs({
        engineVersion: engine.version,
        snapshotFingerprint: snapshot.fingerprint,
        claims: claimsWithEvidence,
      });

      const existing = evaluationRepository.findFitEvaluation({
        candidateId,
        snapshotId,
        engineVersion: engine.version,
        inputFingerprint,
      });
      if (existing) return;

      const result = engine.evaluate(snapshot, claims);

      evaluationRepository.persistFitResult({
        evaluationId,
        fit: {
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
          opportunityEvidence: {
            id: randomUUID() as EvidenceId,
            evidenceType: 'opportunity-requirement',
            sourceReference: item.opportunityEvidenceReference,
            excerpt: item.requirement,
            state: 'source-verified' as const,
          },
          candidateEvidenceIds: item.candidateEvidenceReferences.flatMap(
            (reference) => {
              if (!reference.startsWith('claim:')) return [];
              const claimId = reference.slice('claim:'.length);
              return (
                claimsWithEvidence.find((claim) => claim.id === claimId)
                  ?.evidence ?? []
              ).map((candidateEvidence) => candidateEvidence.id as EvidenceId);
            },
          ),
        })),
      });
    },
  };
}
