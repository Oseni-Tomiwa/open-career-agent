import { eq, and, inArray } from 'drizzle-orm';
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

  public async resolveCanonicalOpportunity(input: {
    listingId: string;
    proposedOpportunityId: OpportunityId;
    identityEvidence: readonly { kind: string; key: string }[];
    title: string;
    location?: string;
    observedAt?: number;
  }): Promise<{ opportunityId: OpportunityId; resolution: string }> {
    const {
      opportunities,
      opportunityIdentityKeys,
      opportunitySnapshots,
      sourceListings,
    } = getTables(this.db);
    const db = this.db.db as any;
    const now = new Date(input.observedAt ?? Date.now());

    return await db.transaction(async (tx: any) => {
      const listingRows = await tx
        .select()
        .from(sourceListings)
        .where(eq(sourceListings.id, input.listingId));
      const linked = listingRows[0]?.opportunityId as string | null | undefined;
      if (linked) {
        for (const evidence of input.identityEvidence) {
          await tx
            .insert(opportunityIdentityKeys)
            .values({
              identityKey: evidence.key,
              kind: evidence.kind,
              opportunityId: linked,
              createdAt: now,
            })
            .onConflictDoNothing();
        }
        return {
          opportunityId: linked as OpportunityId,
          resolution: 'existing-source-listing',
        };
      }

      const keys = [
        ...new Map(
          input.identityEvidence.map((item) => [item.key, item]),
        ).values(),
      ];
      let resolved: string | null = null;
      let identityIsAmbiguous = false;
      let primaryKeyHandled = false;

      if (keys.length > 0) {
        const owners = await tx
          .select()
          .from(opportunityIdentityKeys)
          .where(
            inArray(
              opportunityIdentityKeys.identityKey,
              keys.map((item) => item.key),
            ),
          );
        const uniqueOwners: string[] = Array.from(
          new Set<string>(owners.map((row: any) => String(row.opportunityId))),
        );
        if (uniqueOwners.length === 1) {
          const snapshotRows = await tx
            .select()
            .from(opportunitySnapshots)
            .where(eq(opportunitySnapshots.opportunityId, uniqueOwners[0]!))
            .orderBy(opportunitySnapshots.observedAt);
          const latest = snapshotRows[snapshotRows.length - 1];
          const roleMatches =
            !latest ||
            normalizeIdentityText(latest.title) ===
              normalizeIdentityText(input.title);
          const existingLocation = normalizeIdentityText(
            latest?.location ?? '',
          );
          const incomingLocation = normalizeIdentityText(input.location ?? '');
          const locationMatches =
            !existingLocation ||
            !incomingLocation ||
            existingLocation === incomingLocation;
          if (roleMatches && locationMatches) resolved = uniqueOwners[0]!;
          else identityIsAmbiguous = true;
        } else if (uniqueOwners.length > 1) {
          identityIsAmbiguous = true;
        }
      }

      if (!resolved) {
        await tx.insert(opportunities).values({
          id: input.proposedOpportunityId,
          createdAt: now,
        });
        resolved = input.proposedOpportunityId;

        if (keys[0] && !identityIsAmbiguous) {
          primaryKeyHandled = true;
          await tx
            .insert(opportunityIdentityKeys)
            .values({
              identityKey: keys[0].key,
              kind: keys[0].kind,
              opportunityId: resolved,
              createdAt: now,
            })
            .onConflictDoNothing();
          const ownerRows = await tx
            .select()
            .from(opportunityIdentityKeys)
            .where(eq(opportunityIdentityKeys.identityKey, keys[0].key));
          const winner = ownerRows[0]?.opportunityId as string | undefined;
          if (winner && winner !== resolved) {
            await tx
              .delete(opportunities)
              .where(eq(opportunities.id, resolved));
            resolved = winner;
          }
        }
      }

      for (const evidence of identityIsAmbiguous
        ? []
        : keys.slice(primaryKeyHandled ? 1 : 0)) {
        await tx
          .insert(opportunityIdentityKeys)
          .values({
            identityKey: evidence.key,
            kind: evidence.kind,
            opportunityId: resolved,
            createdAt: now,
          })
          .onConflictDoNothing();
      }

      await tx
        .update(sourceListings)
        .set({ opportunityId: resolved, updatedAt: now })
        .where(eq(sourceListings.id, input.listingId));

      return {
        opportunityId: resolved as OpportunityId,
        resolution:
          resolved === input.proposedOpportunityId
            ? 'new-opportunity'
            : 'strong-identity-link',
      };
    });
  }

  public async listIdentityKeysForOpportunity(
    opportunityId: OpportunityId,
  ): Promise<readonly any[]> {
    const { opportunityIdentityKeys } = getTables(this.db);
    return await (this.db.db as any)
      .select()
      .from(opportunityIdentityKeys)
      .where(eq(opportunityIdentityKeys.opportunityId, opportunityId));
  }

  public async persistObservation(
    id: string,
    sourceListingId: string,
    observation: {
      rawPayload: string;
      fingerprint: string;
      sourceUpdatedAt?: Date;
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
        sourceUpdatedAt: observation.sourceUpdatedAt,
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

function normalizeIdentityText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
