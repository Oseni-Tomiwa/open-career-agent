import { eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';
import type { OpportunityId, SnapshotId } from '@oca/domain';

export class OpportunityRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public async createOpportunity(
    id: OpportunityId,
    timestamp: number = Date.now(),
  ): Promise<void> {
    const { opportunities } = getTables(this.db);
    const db = this.db.db as any;
    await db.insert(opportunities).values({
      id,
      createdAt: new Date(timestamp),
    });
  }

  public async appendSnapshot(
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
  ): Promise<void> {
    const { opportunitySnapshots, opportunitySnapshotSources } = getTables(
      this.db,
    );
    const db = this.db.db as any;

    await db.transaction(async (tx: any) => {
      await tx.insert(opportunitySnapshots).values({
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
      });

      if (snapshot.sourceObservationId) {
        await tx.insert(opportunitySnapshotSources).values({
          snapshotId: snapshot.id,
          sourceObservationId: snapshot.sourceObservationId,
        });
      }
    });
  }

  public async getLatestSnapshot(
    opportunityId: OpportunityId,
  ): Promise<any | null> {
    const { opportunitySnapshots } = getTables(this.db);
    const db = this.db.db as any;
    const result = await db
      .select()
      .from(opportunitySnapshots)
      .where(eq(opportunitySnapshots.opportunityId, opportunityId))
      .orderBy(opportunitySnapshots.observedAt);
    return result[result.length - 1] ?? null;
  }

  public async linkSnapshotSource(
    id: SnapshotId,
    sourceObservationId: string,
  ): Promise<void> {
    const { opportunitySnapshotSources } = getTables(this.db);
    await (this.db.db as any)
      .insert(opportunitySnapshotSources)
      .values({ snapshotId: id, sourceObservationId })
      .onConflictDoNothing();
  }

  public async getSnapshot(snapshotId: SnapshotId): Promise<any | null> {
    const { opportunitySnapshots } = getTables(this.db);
    const db = this.db.db as any;
    const rows = await db
      .select()
      .from(opportunitySnapshots)
      .where(eq(opportunitySnapshots.id, snapshotId));
    return rows[0] ?? null;
  }

  public async getSnapshots(
    opportunityId: OpportunityId,
  ): Promise<readonly any[]> {
    const { opportunitySnapshots } = getTables(this.db);
    const db = this.db.db as any;
    return await db
      .select()
      .from(opportunitySnapshots)
      .where(eq(opportunitySnapshots.opportunityId, opportunityId));
  }

  public async getSnapshotSources(
    snapshotId: SnapshotId,
  ): Promise<readonly any[]> {
    const { opportunitySnapshotSources } = getTables(this.db);
    const db = this.db.db as any;
    return await db
      .select()
      .from(opportunitySnapshotSources)
      .where(eq(opportunitySnapshotSources.snapshotId, snapshotId));
  }

  public async getObservationsForSnapshot(
    snapshotId: SnapshotId,
  ): Promise<readonly any[]> {
    const { opportunitySnapshotSources, sourceObservations, sourceListings } =
      getTables(this.db);
    const db = this.db.db as any;

    const direct = await db
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
      .where(eq(opportunitySnapshotSources.snapshotId, snapshotId));

    if (direct.length > 0) return direct;

    const snapshot = await this.getSnapshot(snapshotId);
    if (!snapshot) return [];

    return await this.getObservationsForOpportunity(
      snapshot.opportunityId as OpportunityId,
    );
  }

  public async getObservationsForOpportunity(
    opportunityId: OpportunityId,
  ): Promise<readonly any[]> {
    const { sourceListings, sourceObservations } = getTables(this.db);
    const db = this.db.db as any;

    return await db
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
      .where(eq(sourceListings.opportunityId, opportunityId));
  }

  public async getOpportunities(): Promise<readonly any[]> {
    const { opportunities } = getTables(this.db);
    const db = this.db.db as any;
    return await db.select().from(opportunities);
  }

  public async getOpportunitySummaries(): Promise<readonly any[]> {
    const opps = await this.getOpportunities();
    return await Promise.all(
      opps.map(async (opp: any) => {
        const latest = await this.getLatestSnapshot(opp.id as OpportunityId);
        const sourceSystems: string[] = [];
        if (latest) {
          const obsList = await this.getObservationsForSnapshot(
            latest.id as SnapshotId,
          );
          sourceSystems.push(
            ...new Set(obsList.map((observation) => observation.sourceSystem)),
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
      }),
    );
  }

  public async getOpportunity(id: OpportunityId): Promise<any | null> {
    const { opportunities } = getTables(this.db);
    const db = this.db.db as any;
    const rows = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, id));
    return rows[0] ?? null;
  }
}
