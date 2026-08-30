import { randomUUID } from 'node:crypto';

import {
  EvaluationRepository,
  type BackgroundTask,
  type DatabaseHandle,
} from '@oca/database';
import {
  decisionId,
  evaluationId,
  candidateId,
  snapshotId,
  findingId,
} from '@oca/domain';
import {
  DecisionEngine,
  DECISION_ENGINE_VERSION,
  type DecisionEvaluationInput,
} from '@oca/intelligence';

import type { BackgroundTaskHandler } from '../worker.js';
import { fingerprintDecisionInputs } from './fingerprint.js';

export function createDecisionHandlers(
  database: DatabaseHandle,
): Record<string, BackgroundTaskHandler> {
  const evaluationRepository = new EvaluationRepository(database);
  const decisionEngine = new DecisionEngine();

  const handleDecisionEvaluate: BackgroundTaskHandler = async (
    task: BackgroundTask,
  ) => {
    await Promise.resolve();
    const payload = task.payload as {
      evaluationId: string;
      snapshotId: string;
      candidateId?: string;
    };

    const evalId = evaluationId(payload.evaluationId);
    const evaluation = evaluationRepository.getEvaluation(evalId);

    if (!evaluation) {
      throw new Error(`Evaluation ${payload.evaluationId} not found`);
    }
    if (
      evaluation.snapshotId !== payload.snapshotId ||
      (payload.candidateId && evaluation.candidateId !== payload.candidateId)
    ) {
      throw new Error('Decision task input does not match its Evaluation');
    }

    const eligibilityFindings =
      evaluationRepository.getEligibilityFindings(evalId);
    const fitFindings = evaluationRepository.getFitFindings(evalId);
    const qualityFindings = evaluationRepository.getQualityFindings(evalId);

    const inputFingerprint = fingerprintDecisionInputs({
      engineVersion: DECISION_ENGINE_VERSION,
      eligibilityState: evaluation.eligibilityState,
      eligibilityInputFingerprint: evaluation.eligibilityInputFingerprint,
      eligibilityFindings: eligibilityFindings.map((f) => ({
        dimension: f.dimensionKey,
        state: f.state,
        summary: f.summary,
      })),
      fitLevel: evaluation.fitLevel,
      fitInputFingerprint: evaluation.fitInputFingerprint,
      qualityLevel: evaluation.qualityLevel,
      qualityFreshnessBucket: evaluation.qualityFreshnessBucket,
      qualityInputFingerprint: evaluation.qualityInputFingerprint,
    });

    // A Decision becomes durable only for a coherent completed Evaluation.
    if (
      !evaluation.eligibilityInputFingerprint ||
      !evaluation.fitInputFingerprint ||
      !evaluation.qualityInputFingerprint ||
      !evaluation.fitLevel ||
      !evaluation.qualityLevel
    ) {
      return;
    }

    const evalDate = new Date();

    const decisionInput: DecisionEvaluationInput = {
      evaluatedAt: evalDate,
      eligibility: evaluation.eligibilityState
        ? {
            state: evaluation.eligibilityState,
            engineVersion: evaluation.eligibilityEngineVersion,
            inputFingerprint: evaluation.eligibilityInputFingerprint,
            findings: eligibilityFindings.map((f) => ({
              dimension: f.dimensionKey,
              state: f.state,
              summary: f.summary,
              confidence: f.confidence ?? undefined,
            })),
          }
        : null,
      fit: evaluation.fitLevel
        ? {
            level: evaluation.fitLevel,
            engineVersion: evaluation.fitEngineVersion,
            inputFingerprint: evaluation.fitInputFingerprint,
            summary: evaluation.fitSummary,
            findings: fitFindings.map((f) => ({
              dimensionKey: f.dimensionKey,
              label: f.label ?? undefined,
              state: f.state,
              modality: f.modality ?? undefined,
              requirementText: f.requirementText ?? undefined,
              explanation: f.explanation ?? undefined,
            })),
          }
        : null,
      quality: evaluation.qualityLevel
        ? {
            level: evaluation.qualityLevel,
            engineVersion: evaluation.qualityEngineVersion,
            inputFingerprint: evaluation.qualityInputFingerprint,
            freshnessBucket: evaluation.qualityFreshnessBucket,
            summary: evaluation.qualitySummary,
            findings: qualityFindings.map((f) => ({
              dimension: f.dimensionKey,
              label: f.label ?? undefined,
              state: f.state,
              importance: f.confidence ?? undefined,
              explanation: f.explanation ?? undefined,
            })),
          }
        : null,
    };

    const decisionResult = decisionEngine.evaluate(decisionInput);

    const allFindings = [
      ...eligibilityFindings.map((finding) => ({
        category: 'eligibility',
        finding,
      })),
      ...fitFindings.map((finding) => ({ category: 'fit', finding })),
      ...qualityFindings.map((finding) => ({ category: 'quality', finding })),
    ] as const;
    const reasonFindingIds = decisionResult.decisiveFindings.flatMap(
      (reference) =>
        allFindings
          .filter(
            ({ category, finding }) =>
              category === reference.category &&
              finding.dimensionKey === reference.dimensionKey &&
              finding.state === reference.state &&
              (finding.summary === reference.summary ||
                finding.explanation === reference.summary),
          )
          .flatMap(({ finding }) =>
            decisionResult.reasonCodes
              .filter(
                (code) =>
                  (code === 'ELIGIBILITY_BLOCKER' &&
                    reference.category === 'eligibility') ||
                  (code === 'LISTING_CLOSED' &&
                    reference.category === 'quality') ||
                  (code === 'LISTING_STALE' &&
                    reference.category === 'quality') ||
                  (code === 'QUALITY_RISK' &&
                    reference.category === 'quality') ||
                  (code === 'QUALITY_UNCERTAINTY' &&
                    reference.category === 'quality') ||
                  (code === 'STRONG_REQUIRED_FIT' &&
                    reference.category === 'fit') ||
                  (code === 'MODERATE_FIT' && reference.category === 'fit') ||
                  (code === 'MATERIAL_FIT_GAPS' &&
                    reference.category === 'fit'),
              )
              .map((reasonCode) => ({ reasonCode, findingId: finding.id })),
          ),
    );

    const dId = decisionId(`dec-${randomUUID()}`);
    evaluationRepository.persistDecision({
      id: dId,
      evaluationId: evalId,
      candidateId: candidateId(evaluation.candidateId),
      snapshotId: snapshotId(evaluation.snapshotId),
      priority: decisionResult.state,
      action: decisionResult.action,
      explanation: decisionResult.explanation,
      engineVersion: decisionResult.version,
      inputFingerprint,
      eligibilityInputFingerprint: evaluation.eligibilityInputFingerprint,
      fitInputFingerprint: evaluation.fitInputFingerprint,
      qualityInputFingerprint: evaluation.qualityInputFingerprint,
      reasonCodes: decisionResult.reasonCodes,
      reasonFindingIds: reasonFindingIds.map((reason) => ({
        ...reason,
        findingId: findingId(reason.findingId),
      })),
      evaluatedAt: evalDate,
    });
  };

  return {
    'decision.evaluate': handleDecisionEvaluate,
  };
}
