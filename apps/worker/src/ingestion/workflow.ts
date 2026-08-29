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
import { GreenhouseAdapter, GreenhouseNormalizer } from '@oca/sources';

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
      const payload = (task.payload ?? {}) as { boardId?: string };
      if (payload.boardId) {
        boards = [payload.boardId];
      }

      const adapter = new GreenhouseAdapter();
      const normalizer = new GreenhouseNormalizer();

      for (const board of boards) {
        for await (const record of adapter.discover(board)) {
          let existingListing = sourceRepo.findListingByExternalId(
            record.sourceSystem,
            record.sourceExternalId,
          );

          const listingId = existingListing?.id ?? `sl_${randomUUID()}`;

          sourceRepo.persistListing(
            listingId,
            {
              sourceSystem: record.sourceSystem,
              sourceExternalId: record.sourceExternalId,
              ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}),
            },
            existingListing?.opportunityId ?? undefined,
            record.observedAt.getTime(),
          );

          // We do an immediate lookup to get the opportunity association if it just got generated elsewhere,
          // though typically it would be null here if new.
          existingListing = sourceRepo.getListing(listingId);
          let oppId = existingListing?.opportunityId ?? null;

          if (!oppId) {
            oppId = opportunityId(`opp_${randomUUID()}`);
            oppRepo.createOpportunity(opportunityId(oppId));
            sourceRepo.associateListingWithOpportunity(
              listingId,
              opportunityId(oppId),
            );
          }

          let normalized;
          try {
            normalized = normalizer.normalize(record);
          } catch {
            continue; // Skip malformed payloads
          }

          // Using same hash function for simplicity, or we could hash raw.
          // The prompt says "content fingerprint if useful... deterministic fingerprinting of raw payload". Let's hash raw payload.

          const rawHash = createHash('sha256')
            .update(record.rawPayload)
            .digest('hex');

          const existingObs = sourceRepo.findObservationByFingerprint(
            listingId,
            rawHash,
          );
          const obsId = existingObs?.id ?? `so_${randomUUID()}`;

          if (!existingObs) {
            sourceRepo.persistObservation(
              obsId,
              listingId,
              {
                rawPayload: record.rawPayload,
                fingerprint: rawHash,
              },
              record.observedAt.getTime(),
            );
          }

          const snapshotFingerprint = normalizer.hash(normalized);
          const latestSnapshot = oppRepo.getLatestSnapshot(
            opportunityId(oppId),
          );

          if (
            !latestSnapshot ||
            latestSnapshot.fingerprint !== snapshotFingerprint
          ) {
            const snapId = snapshotId(`snap_${randomUUID()}`);
            oppRepo.appendSnapshot({
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
            taskLedger.enqueue({
              taskType: 'eligibility.evaluate',
              payload: { snapshotId: snapId },
              idempotencyKey: `eligibility-${snapId}`,
            });
          }
        }
      }
    },
  };
}
