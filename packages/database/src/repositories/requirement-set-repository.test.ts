import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CompleteRequirementSet } from '@oca/domain';
import {
  opportunityId,
  requirementId,
  requirementProvenanceId,
  requirementSetId,
  snapshotId,
  sourceObservationId,
} from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from '../client.js';
import { applyMigrations } from '../migrate.js';
import { OpportunityRepository } from './opportunity-repository.js';
import {
  RequirementSetConflictError,
  RequirementSetRepository,
} from './requirement-set-repository.js';
import { SourceListingRepository } from './source-listing-repository.js';

describe('RequirementSetRepository', () => {
  let directory: string;
  let database: DatabaseHandle;
  const snapshot = snapshotId('snap-requirements');
  const observation = 'so-requirements';

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-requirements-'));
    database = openDatabase(join(directory, 'requirements.sqlite'));
    await applyMigrations(database);

    const sources = new SourceListingRepository(database);
    const opportunities = new OpportunityRepository(database);
    await sources.persistListing('sl-requirements', {
      sourceSystem: 'synthetic',
      sourceExternalId: 'listing-requirements',
    });
    await sources.persistObservation(observation, 'sl-requirements', {
      rawPayload: '{"description":"TypeScript is required."}',
      fingerprint: 'observation-fingerprint',
    });
    const opportunity = opportunityId('opp-requirements');
    await opportunities.createOpportunity(opportunity);
    await opportunities.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Synthetic Engineer',
      organization: 'Synthetic Organization',
      content: 'TypeScript is required.',
      fingerprint: 'snapshot-fingerprint',
      sourceObservationId: observation,
    });
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function artifact(
    pipelineVersion = 'requirements-v2.1-v1-compat',
  ): CompleteRequirementSet {
    const setId = requirementSetId(`rqs-${pipelineVersion}`);
    const reqId = requirementId(`req-${pipelineVersion}`);
    return {
      set: {
        id: setId,
        snapshotId: snapshot,
        modelVersion: 'requirement-set-v1',
        inputFingerprint: `input-${pipelineVersion}`,
        extractorPipelineVersion: pipelineVersion,
        deterministicExtractorVersion: 'eligibility-v1+fit-v1.3',
        status: 'COMPLETE',
        deterministicStatus: 'SUCCEEDED',
        assistedStatus: 'NOT_REQUESTED',
        createdAt: new Date('2026-09-06T00:00:00.000Z'),
      },
      requirements: [
        {
          requirement: {
            id: reqId,
            requirementSetId: setId,
            category: 'TECHNICAL_SKILL',
            normalizedKey: 'fit:programming_language:typescript',
            value: { type: 'TERM', value: 'typescript' },
            statement: 'TypeScript is required.',
            strength: 'REQUIRED',
            polarity: 'REQUIRES',
            assertionBasis: 'EXPLICIT_TEXT',
            evaluationUse: 'FIT',
            actionability: 'FIT_SIGNAL_SAFE',
            extractionConfidence: 'HIGH',
            extractorId: 'fit-requirement-extractor',
            extractorVersion: 'fit-v1.3',
            canonicalHash: `canonical-${pipelineVersion}`,
            createdAt: new Date('2026-09-06T00:00:00.000Z'),
          },
          provenance: [
            {
              id: requirementProvenanceId(`rqp-${pipelineVersion}`),
              requirementId: reqId,
              sourceObservationId: sourceObservationId(observation),
              snapshotId: snapshot,
              sourceFieldPath: '$.lists[0].content',
              normalizedSection: 'content',
              normalizedFragmentId: 'fragment-synthetic-requirement',
              excerpt: 'TypeScript is required.',
              excerptHash: 'excerpt-hash',
              locatorVersion: 'normalized-snapshot-v1',
              extractorId: 'fit-requirement-extractor',
              extractorVersion: 'fit-v1.3',
            },
          ],
        },
      ],
    };
  }

  it('atomically persists and completely reloads requirements with provenance', async () => {
    const repository = new RequirementSetRepository(database);
    const result = await repository.createAtomic(artifact());

    expect(result.created).toBe(true);
    expect(result.artifact.requirements).toHaveLength(1);
    expect(result.artifact.requirements[0]?.provenance[0]).toMatchObject({
      sourceObservationId: observation,
      snapshotId: snapshot,
      excerpt: 'TypeScript is required.',
      sourceFieldPath: '$.lists[0].content',
      normalizedFragmentId: 'fragment-synthetic-requirement',
    });
    expect(await repository.getById(result.artifact.set.id)).toEqual(
      result.artifact,
    );
  });

  it('makes identical repeated writes idempotent', async () => {
    const repository = new RequirementSetRepository(database);
    const first = await repository.createAtomic(artifact());
    const second = await repository.createAtomic(artifact());

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.artifact.set.id).toBe(first.artifact.set.id);
    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_sets')
        .get(),
    ).toEqual({ count: 1 });
  });

  it('keeps historical V2.1 provenance without fragment locators readable', async () => {
    const repository = new RequirementSetRepository(database);
    const base = artifact();
    const original = base.requirements[0]!;
    const historicalProvenance = { ...original.provenance[0]! };
    delete (historicalProvenance as { normalizedFragmentId?: string })
      .normalizedFragmentId;
    const historical: CompleteRequirementSet = {
      ...base,
      requirements: [
        {
          requirement: original.requirement,
          provenance: [historicalProvenance],
        },
      ],
    };

    const result = await repository.createAtomic(historical);

    expect(result.artifact).toEqual(historical);
    expect(result.artifact.requirements[0]?.provenance[0]).not.toHaveProperty(
      'normalizedFragmentId',
    );
  });

  it('preserves the old set when an extractor pipeline version changes', async () => {
    const repository = new RequirementSetRepository(database);
    const first = await repository.createAtomic(artifact());
    const second = await repository.createAtomic(
      artifact('requirements-v2.1-v1-compat-next'),
    );

    expect(second.artifact.set.id).not.toBe(first.artifact.set.id);
    expect(await repository.getById(first.artifact.set.id)).not.toBeNull();
    expect(await repository.getById(second.artifact.set.id)).not.toBeNull();
    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_sets')
        .get(),
    ).toEqual({ count: 2 });
  });

  it('rolls back when provenance does not belong to the snapshot', async () => {
    const repository = new RequirementSetRepository(database);
    const base = artifact();
    const original = base.requirements[0]!;
    const invalid: CompleteRequirementSet = {
      ...base,
      requirements: [
        {
          ...original,
          provenance: [
            {
              ...original.provenance[0]!,
              sourceObservationId: sourceObservationId('so-not-linked'),
            },
          ],
        },
      ],
    };

    await expect(repository.createAtomic(invalid)).rejects.toThrow();
    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_sets')
        .get(),
    ).toEqual({ count: 0 });
  });

  it('rolls back the whole set when a child insert fails', async () => {
    const repository = new RequirementSetRepository(database);
    const base = artifact();
    const original = base.requirements[0]!;
    const invalid: CompleteRequirementSet = {
      ...base,
      requirements: [
        original,
        {
          requirement: {
            ...original.requirement,
            id: requirementId('req-duplicate-hash'),
          },
          provenance: [
            {
              ...original.provenance[0]!,
              id: requirementProvenanceId('rqp-duplicate-hash'),
              requirementId: requirementId('req-duplicate-hash'),
            },
          ],
        },
      ],
    };

    await expect(repository.createAtomic(invalid)).rejects.toThrow();
    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_sets')
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database
        .sqlite!.prepare('select count(*) count from canonical_requirements')
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database
        .sqlite!.prepare('select count(*) count from requirement_provenance')
        .get(),
    ).toEqual({ count: 0 });
  });

  it('enforces Requirement Set foreign-key integrity', () => {
    expect(() =>
      database
        .sqlite!.prepare(
          `insert into requirement_sets (
            id, snapshot_id, model_version, input_fingerprint,
            extractor_pipeline_version, deterministic_extractor_version,
            status, deterministic_status, assisted_status, created_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'rqs-orphan',
          'snap-not-present',
          'requirement-set-v1',
          'input-orphan',
          'requirements-v2.1-v1-compat',
          'eligibility-v1+fit-v1.3',
          'COMPLETE',
          'SUCCEEDED',
          'NOT_REQUESTED',
          Date.now(),
        ),
    ).toThrow();
  });

  it('enforces the model-proposal actionability ceiling in storage', async () => {
    const persisted = await new RequirementSetRepository(database).createAtomic(
      artifact(),
    );

    expect(() =>
      database
        .sqlite!.prepare(
          `insert into requirement_candidates (
            id, requirement_set_id, snapshot_id, category, normalized_key,
            value_json, statement, strength, polarity, assertion_basis,
            evaluation_use, actionability_ceiling, model_confidence, rationale,
            proposer_id, model_capability_version, instruction_version,
            proposal_schema_version, grounding_validator_version,
            validation_status, grounding_status, rejection_reasons_json,
            proposal_hash, created_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'rqc-hard-forbidden',
          persisted.artifact.set.id,
          snapshot,
          'WORK_AUTHORIZATION',
          'work-authorization:germany',
          JSON.stringify({ type: 'SCOPE', value: 'Germany' }),
          'Authorization is required.',
          'REQUIRED',
          'REQUIRES',
          'INTERPRETED',
          'ELIGIBILITY',
          'HARD_CONSTRAINT_SAFE',
          'HIGH',
          'Synthetic rejected proposal.',
          'synthetic-provider',
          'synthetic-v1',
          'instructions-v1',
          'schema-v1',
          'grounding-v1',
          'REJECTED',
          'REJECTED',
          '[]',
          'proposal-hard-forbidden',
          Date.now(),
        ),
    ).toThrow();
  });

  it('rejects conflicting content for the same compatibility identity', async () => {
    const repository = new RequirementSetRepository(database);
    await repository.createAtomic(artifact());
    const base = artifact();
    const original = base.requirements[0]!;
    const conflicting: CompleteRequirementSet = {
      ...base,
      requirements: [
        {
          ...original,
          requirement: {
            ...original.requirement,
            canonicalHash: 'different-content-with-reused-input',
          },
        },
      ],
    };

    await expect(repository.createAtomic(conflicting)).rejects.toBeInstanceOf(
      RequirementSetConflictError,
    );
  });
});
