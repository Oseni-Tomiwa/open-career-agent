import { eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import {
  opportunities,
  opportunitySnapshots,
  opportunitySnapshotSources,
  sourceListings,
  sourceObservations,
} from '../schema.js';
import type { OpportunityId, SnapshotId } from '@oca/domain';

export class OpportunityRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public createOpportunity(
    id: OpportunityId,
    timestamp: number = Date.now(),
  ): void {
    this.db.db
      .insert(opportunities)
      .values({
        id,
        createdAt: new Date(timestamp),
      })
      .run();
  }

  public appendSnapshot(
    snapshot: {
      id: SnapshotId;
      opportunityId: OpportunityId;
      title: string;
      organization: string;
      content: string;
      fingerprint: string;
      location?: string;
      workModel?: string;
      employmentType?: string;
      compensation?: string;
      sourceObservationId?: string;
    },
    timestamp: number = Date.now(),
  ): void {
    this.db.db.transaction((tx) => {
      tx.insert(opportunitySnapshots)
        .values({
          id: snapshot.id,
          opportunityId: snapshot.opportunityId,
          title: snapshot.title,
          organization: snapshot.organization,
          location: snapshot.location,
          workModel: snapshot.workModel,
          employmentType: snapshot.employmentType,
          compensation: snapshot.compensation,
          content: snapshot.content,
          fingerprint: snapshot.fingerprint,
          observedAt: new Date(timestamp),
          createdAt: new Date(timestamp),
        })
        .run();

      if (snapshot.sourceObservationId) {
        tx.insert(opportunitySnapshotSources)
          .values({
            snapshotId: snapshot.id,
            sourceObservationId: snapshot.sourceObservationId,
          })
          .run();
      }
    });
  }

  public getLatestSnapshot(opportunityId: OpportunityId) {
    const result = this.db.db
      .select()
      .from(opportunitySnapshots)
      .where(eq(opportunitySnapshots.opportunityId, opportunityId))
      .orderBy(opportunitySnapshots.observedAt)
      .all();
    return result[result.length - 1] ?? null;
  }

  public getSnapshot(snapshotId: SnapshotId) {
    return (
      this.db.db
        .select()
        .from(opportunitySnapshots)
        .where(eq(opportunitySnapshots.id, snapshotId))
        .get() ?? null
    );
  }

  public getSnapshots(opportunityId: OpportunityId) {
    return this.db.db
      .select()
      .from(opportunitySnapshots)
      .where(eq(opportunitySnapshots.opportunityId, opportunityId))
      .all();
  }

  public getSnapshotSources(snapshotId: SnapshotId) {
    return this.db.db
      .select()
      .from(opportunitySnapshotSources)
      .where(eq(opportunitySnapshotSources.snapshotId, snapshotId))
      .all();
  }

  public getObservationsForSnapshot(snapshotId: SnapshotId) {
    const direct = this.db.db
      .select({
        id: sourceObservations.id,
        sourceListingId: sourceObservations.sourceListingId,
        rawPayload: sourceObservations.rawPayload,
        fingerprint: sourceObservations.fingerprint,
        observedAt: sourceObservations.observedAt,
        sourceUpdatedAt: sourceObservations.sourceUpdatedAt,
        sourceSystem: sourceListings.sourceSystem,
        sourceExternalId: sourceListings.sourceExternalId,
        sourceUrl: sourceListings.sourceUrl,
      })
      .from(opportunitySnapshotSources)
      .innerJoin(
        sourceObservations,
        eq(
          opportunitySnapshotSources.sourceObservationId,
          sourceObservations.id,
        ),
      )
      .innerJoin(
        sourceListings,
        eq(sourceObservations.sourceListingId, sourceListings.id),
      )
      .where(eq(opportunitySnapshotSources.snapshotId, snapshotId))
      .all();

    if (direct.length > 0) return direct;

    const snapshot = this.getSnapshot(snapshotId);
    if (!snapshot) return [];

    return this.getObservationsForOpportunity(
      snapshot.opportunityId as OpportunityId,
    );
  }

  public getObservationsForOpportunity(opportunityId: OpportunityId) {
    return this.db.db
      .select({
        id: sourceObservations.id,
        sourceListingId: sourceObservations.sourceListingId,
        rawPayload: sourceObservations.rawPayload,
        fingerprint: sourceObservations.fingerprint,
        observedAt: sourceObservations.observedAt,
        sourceUpdatedAt: sourceObservations.sourceUpdatedAt,
        sourceSystem: sourceListings.sourceSystem,
        sourceExternalId: sourceListings.sourceExternalId,
        sourceUrl: sourceListings.sourceUrl,
      })
      .from(sourceListings)
      .innerJoin(
        sourceObservations,
        eq(sourceObservations.sourceListingId, sourceListings.id),
      )
      .where(eq(sourceListings.opportunityId, opportunityId))
      .all();
  }

  public getOpportunities() {
    return this.db.db.select().from(opportunities).all();
  }

  public getOpportunitySummaries() {
    const opps = this.getOpportunities();
    return opps.map((opp) => {
      const latest = this.getLatestSnapshot(opp.id as OpportunityId);
      const sourceSystems: string[] = [];
      if (latest) {
        sourceSystems.push(
          ...new Set(
            this.getObservationsForSnapshot(latest.id as SnapshotId).map(
              (observation) => observation.sourceSystem,
            ),
          ),
        );
      }
      return {
        id: opp.id,
        latestTitle: latest?.title,
        latestOrganization: latest?.organization,
        latestLocation: latest?.location,
        latestWorkModel: latest?.workModel,
        latestCompensation: latest?.compensation,
        latestObservedAt: latest?.observedAt,
        latestSnapshotId: latest?.id,
        sourceSystems: sourceSystems,
      };
    });
  }

  public getOpportunity(id: OpportunityId) {
    const result = this.db.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();
    return result ?? null;
  }
}
