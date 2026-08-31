import { eq, and } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';
import type { OpportunityId } from '@oca/domain';

export class SourceListingRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public async persistListing(
    id: string,
    listing: {
      sourceSystem: string;
      sourceExternalId: string;
      sourceUrl?: string;
    },
    opportunityId?: string,
    observedAt: number = Date.now(),
  ): Promise<void> {
    const { sourceListings } = getTables(this.db);
    const db = this.db.db as any;

    await db
      .insert(sourceListings)
      .values({
        id,
        opportunityId: opportunityId ?? null,
        sourceSystem: listing.sourceSystem,
        sourceExternalId: listing.sourceExternalId,
        sourceUrl: listing.sourceUrl,
        createdAt: new Date(observedAt),
        updatedAt: new Date(observedAt),
      })
      .onConflictDoUpdate({
        target: [sourceListings.sourceSystem, sourceListings.sourceExternalId],
        set: {
          sourceUrl: listing.sourceUrl,
          updatedAt: new Date(observedAt),
        },
      });
  }

  public async findListingByExternalId(
    sourceSystem: string,
    sourceExternalId: string,
  ): Promise<any | null> {
    const { sourceListings } = getTables(this.db);
    const db = this.db.db as any;
    const rows = await db
      .select()
      .from(sourceListings)
      .where(
        and(
          eq(sourceListings.sourceSystem, sourceSystem),
          eq(sourceListings.sourceExternalId, sourceExternalId),
        ),
      );
    return rows[0] ?? null;
  }

  public async associateListingWithOpportunity(
    id: string,
    opportunityId: OpportunityId,
  ): Promise<void> {
    const { sourceListings } = getTables(this.db);
    const db = this.db.db as any;
    await db
      .update(sourceListings)
      .set({ opportunityId, updatedAt: new Date() })
      .where(eq(sourceListings.id, id));
  }

  public async persistObservation(
    id: string,
    sourceListingId: string,
    observation: {
      rawPayload: string;
      fingerprint: string;
    },
    observedAt: number = Date.now(),
  ): Promise<void> {
    const { sourceObservations } = getTables(this.db);
    const db = this.db.db as any;

    await db
      .insert(sourceObservations)
      .values({
        id,
        sourceListingId,
        rawPayload: observation.rawPayload,
        fingerprint: observation.fingerprint,
        observedAt: new Date(observedAt),
        createdAt: new Date(observedAt),
      })
      .onConflictDoNothing({
        target: [
          sourceObservations.sourceListingId,
          sourceObservations.fingerprint,
        ],
      });
  }

  public async findObservationByFingerprint(
    sourceListingId: string,
    fingerprint: string,
  ): Promise<any | null> {
    const { sourceObservations } = getTables(this.db);
    const db = this.db.db as any;
    const rows = await db
      .select()
      .from(sourceObservations)
      .where(
        and(
          eq(sourceObservations.sourceListingId, sourceListingId),
          eq(sourceObservations.fingerprint, fingerprint),
        ),
      );
    return rows[0] ?? null;
  }

  public async getListing(id: string): Promise<any | null> {
    const { sourceListings } = getTables(this.db);
    const db = this.db.db as any;
    const rows = await db
      .select()
      .from(sourceListings)
      .where(eq(sourceListings.id, id));
    return rows[0] ?? null;
  }

  public async findListingByOpportunityId(
    opportunityId: string,
  ): Promise<any | null> {
    const { sourceListings } = getTables(this.db);
    const db = this.db.db as any;
    const rows = await db
      .select()
      .from(sourceListings)
      .where(eq(sourceListings.opportunityId, opportunityId));
    return rows[0] ?? null;
  }

  public async listObservationsForListing(
    sourceListingId: string,
  ): Promise<readonly any[]> {
    const { sourceObservations } = getTables(this.db);
    const db = this.db.db as any;
    return await db
      .select()
      .from(sourceObservations)
      .where(eq(sourceObservations.sourceListingId, sourceListingId));
  }
}
