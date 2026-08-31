import { randomUUID } from 'node:crypto';

import {
  BackgroundTaskLedger,
  EvaluationRepository,
  OpportunityRepository,
  type BackgroundTask,
  type DatabaseHandle,
} from '@oca/database';
import type {
  EvaluationId,
  EvidenceId,
  FindingId,
  SnapshotId,
} from '@oca/domain';
import {
  QualityEngine,
  qualityFreshnessAnchor,
  freshnessBucket,
  nextFreshnessBoundary,
  type QualitySourceObservationInput,
} from '@oca/intelligence';

import type { BackgroundTaskHandler } from '../worker.js';
import { fingerprintQualityInputs } from './fingerprint.js';

const DAY_MS = 86_400_000;

function parsePayload(rawPayload: string): Record<string, unknown> | null {
  try {
    return JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapObservation(obs: {
  id: string;
  sourceSystem: string;
  sourceExternalId: string;
  sourceUrl: string | null;
  rawPayload: string;
  fingerprint: string;
  observedAt: Date;
  sourceUpdatedAt: Date | null;
}): QualitySourceObservationInput {
  const parsed = parsePayload(obs.rawPayload);

  let sourceUpdatedAt = obs.sourceUpdatedAt;
  if (!sourceUpdatedAt && typeof parsed?.updated_at === 'string') {
    const parsedDate = new Date(parsed.updated_at);
    if (!Number.isNaN(parsedDate.getTime())) {
      sourceUpdatedAt = parsedDate;
    }
  }

  let location: string | null = null;
  if (parsed?.location) {
    if (typeof parsed.location === 'string') {
      location = parsed.location;
    } else if (
      typeof parsed.location === 'object' &&
      parsed.location !== null &&
      'name' in parsed.location &&
      typeof (parsed.location as { name?: unknown }).name === 'string'
    ) {
      location = (parsed.location as { name: string }).name;
    }
  }

  const explicitStatus: 'active' | 'closed' | 'removed' =
    parsed?.status === 'closed' || parsed?.status === 'removed'
      ? parsed.status
      : 'active';

  return {
    id: obs.id,
    sourceSystem: obs.sourceSystem,
    sourceExternalId: obs.sourceExternalId,
    sourceUrl: obs.sourceUrl,
    observedAt: obs.observedAt,
    sourceUpdatedAt,
    fingerprint: obs.fingerprint,
    supportsSnapshot: true,
    title: typeof parsed?.title === 'string' ? parsed.title : null,
    organization:
      typeof parsed?.company_name === 'string' ? parsed.company_name : null,
    location,
    workModel:
      typeof parsed?.work_model === 'string' ? parsed.work_model : null,
    employmentType:
      typeof parsed?.employment_type === 'string'
        ? parsed.employment_type
        : null,
    compensation:
      typeof parsed?.compensation === 'string' ? parsed.compensation : null,
    explicitStatus,
  };
}

export function createQualityHandlers(deps: {
  db: DatabaseHandle;
}): Record<string, BackgroundTaskHandler> {
  const opportunityRepository = new OpportunityRepository(deps.db);
  const evaluationRepository = new EvaluationRepository(deps.db);
  const taskLedger = new BackgroundTaskLedger(deps.db);
  const engine = new QualityEngine();

  const handleEvaluate = async (task: BackgroundTask) => {
    const payload = task.payload as {
      evaluationId?: string;
      snapshotId?: string;
      candidateId?: string;
      evaluatedAt?: string | number;
    };

    if (!payload.evaluationId || !payload.snapshotId) {
      throw new Error('quality.evaluate requires evaluationId and snapshotId');
    }

    let evaluationId = payload.evaluationId as EvaluationId;
    const snapshotId = payload.snapshotId as SnapshotId;
    const evaluation = await evaluationRepository.getEvaluation(evaluationId);
    if (!evaluation) {
      throw new Error(`Evaluation not found: ${payload.evaluationId}`);
    }
    if (
      evaluation.snapshotId !== snapshotId ||
      (payload.candidateId && evaluation.candidateId !== payload.candidateId)
    ) {
      throw new Error('Quality task input does not match its Evaluation');
    }

    const snapshot = await opportunityRepository.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${payload.snapshotId}`);
    }

    const evalDate = payload.evaluatedAt
      ? new Date(payload.evaluatedAt)
      : new Date();

    const rawObservations =
      await opportunityRepository.getObservationsForSnapshot(snapshotId);
    const mappedObservations = rawObservations.map((obs: any) =>
      mapObservation({
        ...obs,
        observedAt:
          obs.observedAt instanceof Date
            ? obs.observedAt
            : new Date(obs.observedAt),
        sourceUpdatedAt: obs.sourceUpdatedAt
          ? obs.sourceUpdatedAt instanceof Date
            ? obs.sourceUpdatedAt
            : new Date(obs.sourceUpdatedAt)
          : null,
      }),
    );

    const anchor = qualityFreshnessAnchor({
      snapshot: {
        ...snapshot,
        observedAt:
          snapshot.observedAt instanceof Date
            ? snapshot.observedAt
            : new Date(snapshot.observedAt),
      },
      sourceObservations: mappedObservations,
      evaluatedAt: evalDate,
    });
    const ageDays = Math.max(
      0,
      Math.floor((evalDate.getTime() - anchor.getTime()) / DAY_MS),
    );
    const bucket = freshnessBucket(ageDays);

    const inputFingerprint = fingerprintQualityInputs({
      engineVersion: engine.version,
      snapshotFingerprint: snapshot.fingerprint,
      freshnessBucket: bucket,
      sourceObservations: mappedObservations,
    });

    const existing = await evaluationRepository.findQualityEvaluation({
      snapshotId,
      engineVersion: engine.version,
      inputFingerprint,
    });

    if (
      evaluation.qualityInputFingerprint &&
      evaluation.qualityInputFingerprint !== inputFingerprint
    ) {
      const replacementId = randomUUID() as EvaluationId;
      await evaluationRepository.forkEvaluation({
        id: replacementId,
        sourceEvaluationId: evaluationId,
        copy: ['eligibility', 'fit'],
      });
      evaluationId = replacementId;
    }

    if (existing && existing.id !== evaluationId) {
      await evaluationRepository.copyAssessment({
        sourceEvaluationId: existing.id as EvaluationId,
        targetEvaluationId: evaluationId,
        category: 'quality',
      });
    } else if (!existing) {
      const result = engine.evaluate({
        snapshot: {
          id: snapshot.id,
          fingerprint: snapshot.fingerprint,
          observedAt:
            snapshot.observedAt instanceof Date
              ? snapshot.observedAt
              : new Date(snapshot.observedAt),
          title: snapshot.title,
          organization: snapshot.organization,
          content: snapshot.content,
          location: snapshot.location,
          workModel: snapshot.workModel,
          employmentType: snapshot.employmentType,
          compensation: snapshot.compensation,
        },
        sourceObservations: mappedObservations,
        evaluatedAt: evalDate,
      });

      await evaluationRepository.persistQualityResult({
        evaluationId,
        quality: {
          level: result.overallLevel,
          engineVersion: result.version,
          inputFingerprint,
          summary: result.summary,
          evaluatedAt: evalDate,
          freshnessBucket: result.freshnessBucket,
        },
        findings: result.findings.map((item) => ({
          id: randomUUID() as FindingId,
          dimensionKey: item.dimension,
          label: item.label,
          state: item.state,
          summary: item.explanation,
          confidence: item.importance,
          explanation: item.explanation,
          evidence: item.evidenceReferences.map((ref) => ({
            id: randomUUID() as EvidenceId,
            evidenceType: 'opportunity-quality',
            sourceReference: ref.sourceReference,
            excerpt: ref.excerpt,
            state: 'source-verified' as const,
          })),
        })),
      });
    }

    await taskLedger.enqueue({
      taskType: 'decision.evaluate',
      payload: {
        evaluationId,
        snapshotId,
        candidateId: payload.candidateId,
      },
      idempotencyKey: `decision-${evaluationId}-${inputFingerprint}`,
    });

    const nextBoundary = nextFreshnessBoundary(anchor, evalDate);
    if (nextBoundary && nextBoundary.getTime() > evalDate.getTime()) {
      await taskLedger.enqueue({
        taskType: 'quality.evaluate',
        payload: {
          evaluationId,
          snapshotId,
          candidateId: payload.candidateId,
        },
        availableAt: nextBoundary,
        idempotencyKey: `quality-boundary-${evaluationId}-${nextBoundary.getTime()}`,
      });
    }
  };

  return {
    'quality.evaluate': handleEvaluate,
    'quality.reevaluate': handleEvaluate,
  };
}
