import { eq, and } from 'drizzle-orm';
import type { DatabaseHandle } from '../client.js';
import { sourceListings, sourceObservations } from '../schema.js';
import type { OpportunityId } from '@oca/domain'; // I will use SourceRecordId conceptually as ObservationId if needed, but the prompt says to use appropriate names.

// The prompt just said to have a dedicated source observation model. I'll just use string IDs.
export class SourceListingRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public persistListing(
    id: string,
    listing: {
      sourceSystem: string;
      sourceExternalId: string;
      sourceUrl?: string;
    },
    opportunityId?: string,
    observedAt: number = Date.now(),
  ): void {
    this.db.db.insert(sourceListings).values({
      id,
      opportunityId: opportunityId ?? null,
      sourceSystem: listing.sourceSystem,
      sourceExternalId: listing.sourceExternalId,
      sourceUrl: listing.sourceUrl,
      createdAt: new Date(observedAt),
      updatedAt: new Date(observedAt),
    }).onConflictDoUpdate({
      target: [sourceListings.sourceSystem, sourceListings.sourceExternalId],
      set: {
        sourceUrl: listing.sourceUrl,
        updatedAt: new Date(observedAt),
      }
    }).run();
  }

  public findListingByExternalId(sourceSystem: string, sourceExternalId: string) {
    const result = this.db.db.select()
      .from(sourceListings)
      .where(and(eq(sourceListings.sourceSystem, sourceSystem), eq(sourceListings.sourceExternalId, sourceExternalId)))
      .get();
    return result ?? null;
  }

  public associateListingWithOpportunity(id: string, opportunityId: OpportunityId): void {
    this.db.db.update(sourceListings)
      .set({ opportunityId, updatedAt: new Date() })
      .where(eq(sourceListings.id, id))
      .run();
  }

  public persistObservation(
    id: string,
    sourceListingId: string,
    observation: {
      rawPayload: string;
      fingerprint: string;
    },
    observedAt: number = Date.now(),
  ): void {
    this.db.db.insert(sourceObservations).values({
      id,
      sourceListingId,
      rawPayload: observation.rawPayload,
      fingerprint: observation.fingerprint,
      observedAt: new Date(observedAt),
      createdAt: new Date(observedAt),
    }).onConflictDoNothing({
      target: [sourceObservations.sourceListingId, sourceObservations.fingerprint]
    }).run();
  }

  public findObservationByFingerprint(sourceListingId: string, fingerprint: string) {
    const result = this.db.db.select()
      .from(sourceObservations)
      .where(and(eq(sourceObservations.sourceListingId, sourceListingId), eq(sourceObservations.fingerprint, fingerprint)))
      .get();
    return result ?? null;
  }

  public getListing(id: string) {
    const result = this.db.db.select()
      .from(sourceListings)
      .where(eq(sourceListings.id, id))
      .get();
    return result ?? null;
  }
}
