import { createHash, randomUUID } from 'node:crypto';

import type { WorkerConfig } from '@oca/config/server';
import {
  BackgroundTaskLedger,
  OpportunityRepository,
  SearchTargetRepository,
  SourceListingRepository,
  type BackgroundTask,
  type DatabaseHandle,
} from '@oca/database';
import {
  candidateId,
  discoveryMatchId,
  discoveryRunId,
  evaluateDiscoveryMatch,
  opportunityId,
  searchTargetId,
  snapshotId,
  type DiscoveryRunId,
} from '@oca/domain';
import { GreenhouseAdapter, GreenhouseNormalizer } from '@oca/sources';

import type { BackgroundTaskHandler } from '../worker.js';

export function createDiscoveryHandlers(deps: {
  db: DatabaseHandle;
  config?: WorkerConfig;
}): Record<string, BackgroundTaskHandler> {
  const searchTargetRepo = new SearchTargetRepository(deps.db);
  const sourceRepo = new SourceListingRepository(deps.db);
  const oppRepo = new OpportunityRepository(deps.db);
  const taskLedger = new BackgroundTaskLedger(deps.db);

  return {
    'discovery.run': async (task: BackgroundTask) => {
      const payload = (task.payload ?? {}) as {
        candidateId?: string;
        searchTargetId?: string;
        discoveryRunId?: string;
      };

      if (!payload.candidateId || !payload.searchTargetId) {
        throw new Error(
          'discovery.run payload missing candidateId or searchTargetId',
        );
      }

      const cId = candidateId(payload.candidateId);
      const tId = searchTargetId(payload.searchTargetId);

      const target = searchTargetRepo.getSearchTarget(cId, tId);
      let runId: DiscoveryRunId;

      if (payload.discoveryRunId) {
        runId = discoveryRunId(payload.discoveryRunId);
      } else {
        runId = discoveryRunId(`dr_${randomUUID()}`);
        searchTargetRepo.createDiscoveryRun(
          runId,
          cId,
          tId,
          target?.sources[0]?.sourceSystem ?? 'greenhouse',
        );
      }

      if (!target || !target.enabled) {
        searchTargetRepo.updateDiscoveryRun(runId, {
          status: 'FAILED',
          errorSummary: !target
            ? 'Search target not found'
            : 'Search target is disabled',
          completedAt: new Date(),
        });
        return;
      }

      searchTargetRepo.updateDiscoveryRun(runId, {
        status: 'RUNNING',
      });

      const adapter = new GreenhouseAdapter();
      const normalizer = new GreenhouseNormalizer();

      let discoveredCount = 0;
      let acceptedCount = 0;
      let rejectedCount = 0;
      const rejectedByReason: Record<string, number> = {};

      const boardsToScan =
        target.sources.length > 0
          ? target.sources.map((s) => s.boardId)
          : (deps.config?.greenhouseBoards ?? ['figma']);

      for (const boardId of boardsToScan) {
        try {
          for await (const record of adapter.discover(boardId)) {
            discoveredCount++;

            let normalized;
            try {
              normalized = normalizer.normalize(record);
            } catch {
              rejectedCount++;
              rejectedByReason['MALFORMED_PAYLOAD'] =
                (rejectedByReason['MALFORMED_PAYLOAD'] ?? 0) + 1;
              continue;
            }

            const matchResult = evaluateDiscoveryMatch(target, normalized);

            if (!matchResult.isMatch) {
              rejectedCount++;
              const reasonKey =
                matchResult.rejectionReason ?? 'UNSPECIFIED_REJECT';
              rejectedByReason[reasonKey] =
                (rejectedByReason[reasonKey] ?? 0) + 1;
              continue;
            }

            // ACCEPTED MATCH
            acceptedCount++;

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

            let snapId: ReturnType<typeof snapshotId> | undefined =
              latestSnapshot?.id ? snapshotId(latestSnapshot.id) : undefined;

            if (
              !latestSnapshot ||
              latestSnapshot.fingerprint !== snapshotFingerprint
            ) {
              snapId = snapshotId(`snap_${randomUUID()}`);
              oppRepo.appendSnapshot({
                id: snapId,
                opportunityId: opportunityId(oppId),
                title: normalized.title,
                organization: normalized.organization,
                content: normalized.content,
                fingerprint: snapshotFingerprint,
                ...(normalized.location
                  ? { location: normalized.location }
                  : {}),
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
            }

            // Record Candidate Discovery Match
            searchTargetRepo.recordDiscoveryMatch({
              id: discoveryMatchId(`dm_${randomUUID()}`),
              candidateId: cId,
              searchTargetId: tId,
              discoveryRunId: runId,
              opportunityId: opportunityId(oppId),
              sourceListingId: listingId,
              matchReasons: matchResult.matchReasons,
              retainedUnresolved: matchResult.retainedUnresolved,
            });

            // Enqueue eligibility evaluation if snapshot exists
            if (snapId) {
              taskLedger.enqueue({
                taskType: 'eligibility.evaluate',
                payload: { snapshotId: snapId, candidateId: cId },
                idempotencyKey: `eligibility-${cId}-${snapId}`,
              });
            }
          }
        } catch (error) {
          const errMessage =
            error instanceof Error ? error.message : 'Source discovery error';
          searchTargetRepo.updateDiscoveryRun(runId, {
            errorSummary: `Source ${boardId} failed: ${errMessage}`,
          });
        }
      }

      searchTargetRepo.updateDiscoveryRun(runId, {
        status: 'COMPLETED',
        discoveredCount,
        acceptedCount,
        rejectedCount,
        rejectedByReason,
        completedAt: new Date(),
      });
    },
  };
}
