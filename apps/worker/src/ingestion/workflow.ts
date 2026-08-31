import { randomUUID, createHash } from 'node:crypto';
import type { DatabaseHandle } from '@oca/database';
import {
  SourceListingRepository,
  OpportunityRepository,
  BackgroundTaskLedger,
} from '@oca/database';
import type { WorkerConfig } from '@oca/config/server';
import type { BackgroundTaskHandler } from '../worker.js';
import type { BackgroundTask } from '@oca/database';
import { opportunityId, snapshotId } from '@oca/domain';
import {
  deriveOpportunityIdentityEvidence,
  GreenhouseAdapter,
  GreenhouseNormalizer,
} from '@oca/sources';

export function createTaskHandlers(deps: {
  db: DatabaseHandle;
  config: WorkerConfig;
}): Record<string, BackgroundTaskHandler> {
  const sourceRepo = new SourceListingRepository(deps.db);
  const oppRepo = new OpportunityRepository(deps.db);
  const taskLedger = new BackgroundTaskLedger(deps.db);

  return {
    'system.noop': () => undefined,
    'source.greenhouse.discover': async (task: BackgroundTask) => {
      let boards = deps.config.greenhouseBoards;
      const payload = (task.payload ?? {}) as {
        boardId?: string;
        candidateId?: string;
      };
      if (payload.boardId) {
        boards = [payload.boardId];
      }

      const adapter = new GreenhouseAdapter();
      const normalizer = new GreenhouseNormalizer();

      for (const board of boards) {
        for await (const record of adapter.discover(board)) {
          let normalized;
          try {
            normalized = normalizer.normalize(record);
          } catch {
            continue; // Skip malformed payloads
          }

          const existingListing = await sourceRepo.findListingByExternalId(
            record.sourceSystem,
            record.sourceExternalId,
          );

          const listingId = existingListing?.id ?? `sl_${randomUUID()}`;

          await sourceRepo.persistListing(
            listingId,
            {
              sourceSystem: record.sourceSystem,
              sourceExternalId: record.sourceExternalId,
              ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}),
            },
            existingListing?.opportunityId ?? undefined,
            record.observedAt.getTime(),
          );

          const resolution = await sourceRepo.resolveCanonicalOpportunity({
            listingId,
            proposedOpportunityId: opportunityId(`opp_${randomUUID()}`),
            identityEvidence: deriveOpportunityIdentityEvidence(
              record,
              normalized,
            ),
            title: normalized.title,
            ...(normalized.location ? { location: normalized.location } : {}),
            observedAt: record.observedAt.getTime(),
          });
          const oppId = resolution.opportunityId;

          const rawHash = createHash('sha256')
            .update(record.rawPayload)
            .digest('hex');

          const existingObs = await sourceRepo.findObservationByFingerprint(
            listingId,
            rawHash,
          );
          const obsId = existingObs?.id ?? `so_${randomUUID()}`;

          if (!existingObs) {
            await sourceRepo.persistObservation(
              obsId,
              listingId,
              {
                rawPayload: record.rawPayload,
                fingerprint: rawHash,
                ...(record.updatedAt
                  ? { sourceUpdatedAt: record.updatedAt }
                  : {}),
              },
              record.observedAt.getTime(),
            );
          }

          const snapshotFingerprint = normalizer.hash(normalized);
          const latestSnapshot = await oppRepo.getLatestSnapshot(
            opportunityId(oppId),
          );

          let snapId = latestSnapshot?.id
            ? snapshotId(latestSnapshot.id)
            : undefined;
          if (
            !latestSnapshot ||
            latestSnapshot.fingerprint !== snapshotFingerprint
          ) {
            snapId = snapshotId(`snap_${randomUUID()}`);
            await oppRepo.appendSnapshot({
              id: snapId,
              opportunityId: opportunityId(oppId),
              title: normalized.title,
              organization: normalized.organization,
              content: normalized.content,
              fingerprint: snapshotFingerprint,
              ...(normalized.location ? { location: normalized.location } : {}),
              ...(normalized.workModel
                ? { workModel: normalized.workModel }
                : {}),
              ...(normalized.employmentType
                ? { employmentType: normalized.employmentType }
                : {}),
              ...(normalized.compensation
                ? { compensation: normalized.compensation }
                : {}),
              ...(obsId ? { sourceObservationId: obsId } : {}),
            });
            if (payload.candidateId) {
              await taskLedger.enqueue({
                taskType: 'eligibility.evaluate',
                payload: {
                  snapshotId: snapId,
                  candidateId: payload.candidateId,
                },
                idempotencyKey: `eligibility-${payload.candidateId}-${snapId}`,
              });
            }
          }
          if (snapId) {
            await oppRepo.linkSnapshotSource(snapId, obsId);
          }
        }
      }
    },
  };
}
