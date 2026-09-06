import { and, desc, eq } from 'drizzle-orm';
import type {
  CanonicalRequirement,
  CompleteRequirementSet,
  RequirementId,
  RequirementProvenance,
  RequirementSet,
  RequirementSetId,
  RequirementWithProvenance,
  SnapshotId,
} from '@oca/domain';
import { isRequirementSetArtifact } from '@oca/schemas';

import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';

export class RequirementSetConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RequirementSetConflictError';
  }
}

function contractValue(input: CompleteRequirementSet) {
  return {
    set: { ...input.set, createdAt: input.set.createdAt.toISOString() },
    requirements: input.requirements.map((item) => ({
      requirement: {
        ...item.requirement,
        createdAt: item.requirement.createdAt.toISOString(),
      },
      provenance: item.provenance,
    })),
  };
}

function signature(input: CompleteRequirementSet): string {
  return JSON.stringify(
    input.requirements
      .map((item) => ({
        hash: item.requirement.canonicalHash,
        provenance: item.provenance
          .map((provenance) => ({
            observation: provenance.sourceObservationId,
            sourceFieldPath: provenance.sourceFieldPath ?? null,
            normalizedFragmentId: provenance.normalizedFragmentId ?? null,
            excerptHash: provenance.excerptHash,
            locatorVersion: provenance.locatorVersion,
          }))
          .sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right)),
          ),
      }))
      .sort((left, right) => left.hash.localeCompare(right.hash)),
  );
}

export class RequirementSetRepository {
  public constructor(private readonly handle: DatabaseHandle) {}

  public async createAtomic(artifact: CompleteRequirementSet): Promise<{
    readonly created: boolean;
    readonly artifact: CompleteRequirementSet;
  }> {
    if (!isRequirementSetArtifact(contractValue(artifact))) {
      throw new TypeError('Invalid Requirement Set artifact');
    }
    this.assertInternalLineage(artifact);

    const {
      requirementSets,
      canonicalRequirements,
      requirementProvenance,
      opportunitySnapshotSources,
    } = getTables(this.handle);
    const database = this.handle.db as any;

    const persist = async (transaction: any): Promise<boolean> => {
      for (const item of artifact.requirements) {
        for (const provenance of item.provenance) {
          const links = await transaction
            .select()
            .from(opportunitySnapshotSources)
            .where(
              and(
                eq(
                  opportunitySnapshotSources.snapshotId,
                  artifact.set.snapshotId,
                ),
                eq(
                  opportunitySnapshotSources.sourceObservationId,
                  provenance.sourceObservationId,
                ),
              ),
            );
          if (links.length === 0) {
            throw new TypeError(
              'Requirement provenance observation is not linked to its snapshot',
            );
          }
        }
      }

      const inserted = await transaction
        .insert(requirementSets)
        .values({
          ...artifact.set,
          createdAt: artifact.set.createdAt,
        })
        .onConflictDoNothing()
        .returning({ id: requirementSets.id });

      if (inserted.length === 0) return false;

      for (const item of artifact.requirements) {
        await transaction.insert(canonicalRequirements).values({
          ...item.requirement,
          valueJson: JSON.stringify(item.requirement.value),
          createdAt: item.requirement.createdAt,
        });
        for (const provenance of item.provenance) {
          await transaction.insert(requirementProvenance).values(provenance);
        }
      }
      return true;
    };

    let created: boolean;
    if (this.handle.engine === 'sqlite') {
      this.handle.sqlite!.exec('BEGIN IMMEDIATE');
      try {
        created = await persist(database);
        this.handle.sqlite!.exec('COMMIT');
      } catch (error) {
        this.handle.sqlite!.exec('ROLLBACK');
        throw error;
      }
    } else {
      created = await database.transaction(persist);
    }

    const persisted = await this.findCompatible({
      snapshotId: artifact.set.snapshotId,
      extractorPipelineVersion: artifact.set.extractorPipelineVersion,
      inputFingerprint: artifact.set.inputFingerprint,
    });
    if (!persisted) {
      throw new Error('Persisted Requirement Set could not be reloaded');
    }
    if (signature(persisted) !== signature(artifact)) {
      throw new RequirementSetConflictError(
        'Compatible Requirement Set identity was reused with different content',
      );
    }
    return { created, artifact: persisted };
  }

  public async getById(
    id: RequirementSetId,
  ): Promise<CompleteRequirementSet | null> {
    const { requirementSets } = getTables(this.handle);
    const rows = await (this.handle.db as any)
      .select()
      .from(requirementSets)
      .where(eq(requirementSets.id, id));
    return rows[0] ? this.load(rows[0]) : null;
  }

  public async findCompatible(input: {
    readonly snapshotId: SnapshotId;
    readonly extractorPipelineVersion: string;
    readonly inputFingerprint: string;
  }): Promise<CompleteRequirementSet | null> {
    const { requirementSets } = getTables(this.handle);
    const rows = await (this.handle.db as any)
      .select()
      .from(requirementSets)
      .where(
        and(
          eq(requirementSets.snapshotId, input.snapshotId),
          eq(
            requirementSets.extractorPipelineVersion,
            input.extractorPipelineVersion,
          ),
          eq(requirementSets.inputFingerprint, input.inputFingerprint),
        ),
      );
    return rows[0] ? this.load(rows[0]) : null;
  }

  public async getLatestCompatible(input: {
    readonly snapshotId: SnapshotId;
    readonly extractorPipelineVersion: string;
    readonly deterministicExtractorVersion: string;
  }): Promise<CompleteRequirementSet | null> {
    const { requirementSets } = getTables(this.handle);
    const rows = await (this.handle.db as any)
      .select()
      .from(requirementSets)
      .where(
        and(
          eq(requirementSets.snapshotId, input.snapshotId),
          eq(
            requirementSets.extractorPipelineVersion,
            input.extractorPipelineVersion,
          ),
          eq(
            requirementSets.deterministicExtractorVersion,
            input.deterministicExtractorVersion,
          ),
        ),
      )
      .orderBy(desc(requirementSets.createdAt));
    return rows[0] ? this.load(rows[0]) : null;
  }

  private assertInternalLineage(artifact: CompleteRequirementSet): void {
    for (const item of artifact.requirements) {
      if (item.requirement.requirementSetId !== artifact.set.id) {
        throw new TypeError(
          'Requirement belongs to a different Requirement Set',
        );
      }
      if (item.provenance.length === 0) {
        throw new TypeError('Every canonical requirement requires provenance');
      }
      for (const provenance of item.provenance) {
        if (
          provenance.requirementId !== item.requirement.id ||
          provenance.snapshotId !== artifact.set.snapshotId
        ) {
          throw new TypeError('Requirement provenance lineage does not match');
        }
      }
    }
  }

  private async load(setRow: any): Promise<CompleteRequirementSet> {
    const { canonicalRequirements, requirementProvenance } = getTables(
      this.handle,
    );
    const database = this.handle.db as any;
    const requirementRows = await database
      .select()
      .from(canonicalRequirements)
      .where(eq(canonicalRequirements.requirementSetId, setRow.id));
    const requirements: RequirementWithProvenance[] = [];

    for (const row of requirementRows) {
      const provenanceRows = await database
        .select()
        .from(requirementProvenance)
        .where(eq(requirementProvenance.requirementId, row.id));
      const { valueJson, ...storedRequirement } = row;
      const requirement: CanonicalRequirement = {
        ...storedRequirement,
        id: row.id as RequirementId,
        requirementSetId: row.requirementSetId as RequirementSetId,
        value: JSON.parse(valueJson),
        createdAt: new Date(row.createdAt),
      };
      requirements.push({
        requirement,
        provenance: provenanceRows.map((provenance: any) => ({
          id: provenance.id,
          requirementId: provenance.requirementId,
          sourceObservationId: provenance.sourceObservationId,
          snapshotId: provenance.snapshotId,
          ...(provenance.sourceFieldPath
            ? { sourceFieldPath: provenance.sourceFieldPath }
            : {}),
          ...(provenance.normalizedSection
            ? { normalizedSection: provenance.normalizedSection }
            : {}),
          ...(provenance.normalizedFragmentId
            ? { normalizedFragmentId: provenance.normalizedFragmentId }
            : {}),
          ...(provenance.startOffset !== null
            ? { startOffset: provenance.startOffset }
            : {}),
          ...(provenance.endOffset !== null
            ? { endOffset: provenance.endOffset }
            : {}),
          excerpt: provenance.excerpt,
          excerptHash: provenance.excerptHash,
          locatorVersion: provenance.locatorVersion,
          extractorId: provenance.extractorId,
          extractorVersion: provenance.extractorVersion,
        })) as RequirementProvenance[],
      });
    }

    const set: RequirementSet = {
      ...setRow,
      id: setRow.id as RequirementSetId,
      snapshotId: setRow.snapshotId as SnapshotId,
      createdAt: new Date(setRow.createdAt),
    };
    return { set, requirements };
  }
}
