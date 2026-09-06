import {
  BackgroundTaskLedger,
  OpportunityRepository,
  RequirementSetRepository,
  type BackgroundTask,
  type DatabaseHandle,
} from '@oca/database';
import { snapshotId } from '@oca/domain';
import {
  buildV1CompatibilityRequirementSet,
  V1_COMPAT_DETERMINISTIC_EXTRACTOR_VERSION,
  V1_COMPAT_PIPELINE_VERSION,
} from '@oca/intelligence';

import type { BackgroundTaskHandler } from '../worker.js';

export function createRequirementHandlers(deps: {
  readonly db: DatabaseHandle;
  readonly pipelineVersion?: string;
  readonly deterministicExtractorVersion?: string;
}): Record<string, BackgroundTaskHandler> {
  const opportunities = new OpportunityRepository(deps.db);
  const requirements = new RequirementSetRepository(deps.db);
  const ledger = new BackgroundTaskLedger(deps.db);
  const pipelineVersion = deps.pipelineVersion ?? V1_COMPAT_PIPELINE_VERSION;
  const deterministicExtractorVersion =
    deps.deterministicExtractorVersion ??
    V1_COMPAT_DETERMINISTIC_EXTRACTOR_VERSION;

  return {
    'requirements.extract': async (task: BackgroundTask) => {
      const payload = (task.payload ?? {}) as {
        snapshotId?: string;
        candidateId?: string;
        profileReevaluationId?: string;
      };
      if (!payload.snapshotId) {
        throw new Error('requirements.extract payload missing snapshotId');
      }
      const snapId = snapshotId(payload.snapshotId);
      const snapshot = await opportunities.getSnapshot(snapId);
      if (!snapshot) {
        throw new Error(`Snapshot not found: ${payload.snapshotId}`);
      }
      const observations =
        await opportunities.getObservationsForSnapshot(snapId);
      if (observations.length === 0) {
        throw new Error(
          `Requirement extraction requires source provenance: ${payload.snapshotId}`,
        );
      }

      const artifact = buildV1CompatibilityRequirementSet(
        snapshot,
        observations,
        { pipelineVersion, deterministicExtractorVersion },
      );
      const persisted = await requirements.createAtomic(artifact);

      if (payload.candidateId) {
        await ledger.enqueue({
          taskType: 'eligibility.evaluate',
          payload: {
            snapshotId: payload.snapshotId,
            candidateId: payload.candidateId,
            requirementSetId: persisted.artifact.set.id,
            requirementInputFingerprint:
              persisted.artifact.set.inputFingerprint,
            ...(payload.profileReevaluationId
              ? { profileReevaluationId: payload.profileReevaluationId }
              : {}),
          },
          idempotencyKey: `eligibility-${payload.candidateId}-${payload.snapshotId}-${persisted.artifact.set.id}`,
        });
      }
    },
  };
}
