import {
  BackgroundTaskLedger,
  OpportunityRepository,
  RequirementSetRepository,
  type BackgroundTask,
  type DatabaseHandle,
} from '@oca/database';
import { snapshotId } from '@oca/domain';
import {
  ASSISTED_REQUIREMENT_PIPELINE_VERSION,
  buildV2RequirementSet,
  fingerprintAssistedRequirementRequest,
  runAssistedRequirementProposal,
  selectAssistedRequirementFragments,
  type RequirementProposalProvider,
  V2_2_PIPELINE_VERSION,
  V2_3_1_DETERMINISTIC_EXTRACTOR_VERSION,
} from '@oca/intelligence';
import { getSourceNormalizer, type SourceOpportunity } from '@oca/sources';

import type { BackgroundTaskHandler } from '../worker.js';

export function createRequirementHandlers(deps: {
  readonly db: DatabaseHandle;
  readonly pipelineVersion?: string;
  readonly deterministicExtractorVersion?: string;
  readonly proposalProvider?: RequirementProposalProvider;
  readonly proposalTimeoutMs?: number;
}): Record<string, BackgroundTaskHandler> {
  const opportunities = new OpportunityRepository(deps.db);
  const requirements = new RequirementSetRepository(deps.db);
  const ledger = new BackgroundTaskLedger(deps.db);
  const pipelineVersion =
    deps.pipelineVersion ??
    (deps.proposalProvider
      ? ASSISTED_REQUIREMENT_PIPELINE_VERSION
      : V2_2_PIPELINE_VERSION);
  const deterministicExtractorVersion =
    deps.deterministicExtractorVersion ??
    V2_3_1_DETERMINISTIC_EXTRACTOR_VERSION;

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

      const normalizedObservations = observations.map((observation) => {
        const sourceRecord: SourceOpportunity = {
          sourceSystem: observation.sourceSystem,
          sourceExternalId: observation.sourceExternalId,
          ...(observation.sourceUrl
            ? { sourceUrl: observation.sourceUrl }
            : {}),
          rawPayload: observation.rawPayload,
          observedAt: new Date(observation.observedAt),
          ...(observation.sourceUpdatedAt
            ? { updatedAt: new Date(observation.sourceUpdatedAt) }
            : {}),
        };
        return {
          id: observation.id,
          fingerprint: observation.fingerprint,
          document: getSourceNormalizer(observation.sourceSystem).normalize(
            sourceRecord,
          ).document,
        };
      });
      let artifact = buildV2RequirementSet(snapshot, normalizedObservations, {
        pipelineVersion,
        deterministicExtractorVersion,
      });
      if (deps.proposalProvider) {
        const fragments = selectAssistedRequirementFragments({
          observations: normalizedObservations,
          deterministic: artifact,
        });
        const assistanceFingerprint = fingerprintAssistedRequirementRequest({
          snapshotFingerprint: snapshot.fingerprint,
          provider: deps.proposalProvider,
          fragments,
        });
        artifact = buildV2RequirementSet(snapshot, normalizedObservations, {
          pipelineVersion,
          deterministicExtractorVersion,
          identityContext: assistanceFingerprint,
        });
        artifact = await runAssistedRequirementProposal({
          artifact,
          snapshotFingerprint: snapshot.fingerprint,
          fragments,
          provider: deps.proposalProvider,
          ...(deps.proposalTimeoutMs
            ? { timeoutMs: deps.proposalTimeoutMs }
            : {}),
        });
      }
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
