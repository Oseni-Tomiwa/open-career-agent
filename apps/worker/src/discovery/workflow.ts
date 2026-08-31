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
import {
  deriveOpportunityIdentityEvidence,
  getSourceAdapter,
  getSourceNormalizer,
} from '@oca/sources';

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

      const target = await searchTargetRepo.getSearchTarget(cId, tId);
      let runId: DiscoveryRunId;

      if (payload.discoveryRunId) {
        runId = discoveryRunId(payload.discoveryRunId);
      } else {
        runId = discoveryRunId(`dr_${randomUUID()}`);
        await searchTargetRepo.createDiscoveryRun(
          runId,
          cId,
          tId,
          target
            ? [
                ...new Set(target.sources.map((source) => source.sourceSystem)),
              ].join(', ') || 'unconfigured'
            : 'unconfigured',
        );
      }

      if (!target || !target.enabled) {
        await searchTargetRepo.updateDiscoveryRun(runId, {
          status: 'FAILED',
          errorSummary: !target
            ? 'Search target not found'
            : 'Search target is disabled',
          completedAt: new Date(),
        });
        return;
      }

      if (target.sources.length === 0) {
        await searchTargetRepo.updateDiscoveryRun(runId, {
          status: 'FAILED',
          errorSummary: 'No job sources are configured for this search target',
          completedAt: new Date(),
        });
        return;
      }

      await searchTargetRepo.updateDiscoveryRun(runId, { status: 'RUNNING' });

      let discoveredCount = 0;
      let acceptedCount = 0;
      let rejectedCount = 0;
      const rejectedByReason: Record<string, number> = {};
      let sourceFailed = false;
      const errorSummaries: string[] = [];

      for (const sourceConfig of target.sources) {
        let adapter;
        let normalizer;
        try {
          adapter = getSourceAdapter(sourceConfig.sourceSystem);
          normalizer = getSourceNormalizer(sourceConfig.sourceSystem);
        } catch (err) {
          sourceFailed = true;
          const msg =
            err instanceof Error ? err.message : 'Invalid source adapter';
          errorSummaries.push(
            `Source ${sourceConfig.sourceSystem}:${sourceConfig.boardId} failed: ${msg}`,
          );
          continue;
        }

        try {
          for await (const record of adapter.discover(sourceConfig.boardId)) {
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

            let snapId: ReturnType<typeof snapshotId> | undefined =
              latestSnapshot?.id ? snapshotId(latestSnapshot.id) : undefined;

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

            if (snapId) {
              await oppRepo.linkSnapshotSource(snapId, obsId);
            }

            // Record Candidate Discovery Match
            await searchTargetRepo.recordDiscoveryMatch({
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
              await taskLedger.enqueue({
                taskType: 'eligibility.evaluate',
                payload: { snapshotId: snapId, candidateId: cId },
                idempotencyKey: `eligibility-${cId}-${snapId}`,
              });
            }
          }
        } catch (error) {
          sourceFailed = true;
          const errMessage =
            error instanceof Error ? error.message : 'Source discovery error';
          errorSummaries.push(
            `Source ${sourceConfig.sourceSystem}:${sourceConfig.boardId} failed: ${errMessage}`,
          );
        }
      }

      await searchTargetRepo.updateDiscoveryRun(runId, {
        status: sourceFailed ? 'FAILED' : 'COMPLETED',
        discoveredCount,
        acceptedCount,
        rejectedCount,
        rejectedByReason,
        errorSummary:
          errorSummaries.length > 0 ? errorSummaries.join('; ') : null,
        completedAt: new Date(),
      });
    },
  };
}
