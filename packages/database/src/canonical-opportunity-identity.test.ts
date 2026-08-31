import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { opportunityId, snapshotId } from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from './client.js';
import { applyMigrations } from './migrate.js';
import { OpportunityRepository } from './repositories/opportunity-repository.js';
import { SourceListingRepository } from './repositories/source-listing-repository.js';

describe('canonical Opportunity identity collision matrix', () => {
  let directory: string;
  let database: DatabaseHandle;
  let sources: SourceListingRepository;
  let opportunities: OpportunityRepository;
  let sequence = 0;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-canonical-identity-'));
    database = openDatabase(join(directory, 'test.sqlite'));
    await applyMigrations(database);
    sources = new SourceListingRepository(database);
    opportunities = new OpportunityRepository(database);
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function resolve(input: {
    system: string;
    externalId: string;
    keys?: readonly { kind: string; key: string }[];
    title?: string;
    location?: string;
  }) {
    sequence++;
    const listingId = `listing-${sequence}`;
    await sources.persistListing(listingId, {
      sourceSystem: input.system,
      sourceExternalId: input.externalId,
      sourceUrl: `https://${input.system}.example/${input.externalId}`,
    });
    const result = await sources.resolveCanonicalOpportunity({
      listingId,
      proposedOpportunityId: opportunityId(`opportunity-${sequence}`),
      identityEvidence: input.keys ?? [],
      title: input.title ?? 'Platform Engineer',
      ...(input.location ? { location: input.location } : {}),
    });
    await opportunities.appendSnapshot({
      id: snapshotId(`snapshot-${sequence}`),
      opportunityId: result.opportunityId,
      title: input.title ?? 'Platform Engineer',
      organization: 'Acme',
      location: input.location ?? 'Remote',
      content: 'Role content',
      fingerprint: `fingerprint-${sequence}`,
    });
    return { ...result, listingId };
  }

  for (const [left, right] of [
    ['greenhouse', 'lever'],
    ['greenhouse', 'ashby'],
    ['lever', 'ashby'],
  ] as const) {
    it(`links the same ${left} + ${right} vacancy to one Opportunity`, async () => {
      const key = [
        {
          kind: 'canonical-application-url',
          key: 'url:https://careers.acme.test/jobs/42',
        },
      ];
      const first = await resolve({
        system: left,
        externalId: `${left}-42`,
        keys: key,
      });
      const second = await resolve({
        system: right,
        externalId: `${right}-99`,
        keys: key,
      });
      expect(second.opportunityId).toBe(first.opportunityId);
      expect(
        await sources.findListingByOpportunityId(first.opportunityId),
      ).not.toBeNull();
    });
  }

  it('keeps identical titles with different explicit requisitions separate', async () => {
    const first = await resolve({
      system: 'greenhouse',
      externalId: '1',
      keys: [
        { kind: 'employer-requisition', key: 'requisition:acme.test:req-1' },
      ],
    });
    const second = await resolve({
      system: 'lever',
      externalId: '2',
      keys: [
        { kind: 'employer-requisition', key: 'requisition:acme.test:req-2' },
      ],
    });
    expect(second.opportunityId).not.toBe(first.opportunityId);
  });

  it('does not merge similar roles in different locations even with a colliding URL', async () => {
    const key = [
      {
        kind: 'canonical-application-url',
        key: 'url:https://careers.acme.test/jobs/reused',
      },
    ];
    const first = await resolve({
      system: 'greenhouse',
      externalId: '1',
      keys: key,
      location: 'Lagos',
    });
    const second = await resolve({
      system: 'ashby',
      externalId: '2',
      keys: key,
      title: 'Platform Engineer II',
      location: 'Berlin',
    });
    expect(second.opportunityId).not.toBe(first.opportunityId);
    expect(
      await sources.listIdentityKeysForOpportunity(second.opportunityId),
    ).toEqual([]);
  });

  it('preserves separate Opportunities when only weak evidence agrees', async () => {
    const first = await resolve({ system: 'greenhouse', externalId: '1' });
    const second = await resolve({ system: 'lever', externalId: '2' });
    expect(second.opportunityId).not.toBe(first.opportunityId);
  });

  it('keeps an established source association stable when later identity hints change', async () => {
    const first = await resolve({
      system: 'greenhouse',
      externalId: 'stable',
      keys: [
        {
          kind: 'canonical-application-url',
          key: 'url:https://careers.acme.test/jobs/old',
        },
      ],
    });
    const repeated = await sources.resolveCanonicalOpportunity({
      listingId: first.listingId,
      proposedOpportunityId: opportunityId('must-not-be-created'),
      identityEvidence: [
        {
          kind: 'canonical-application-url',
          key: 'url:https://careers.acme.test/jobs/new',
        },
      ],
      title: 'Different title from a changed source',
    });
    expect(repeated.opportunityId).toBe(first.opportunityId);
    expect(repeated.resolution).toBe('existing-source-listing');
  });

  it('retains every source observation when multiple listings share one Opportunity', async () => {
    const key = [
      {
        kind: 'canonical-application-url',
        key: 'url:https://careers.acme.test/jobs/observed',
      },
    ];
    const first = await resolve({
      system: 'greenhouse',
      externalId: '1',
      keys: key,
    });
    const second = await resolve({
      system: 'lever',
      externalId: '2',
      keys: key,
    });
    await sources.persistObservation('observation-1', first.listingId, {
      rawPayload: '{"source":1}',
      fingerprint: 'one',
    });
    await sources.persistObservation('observation-2', second.listingId, {
      rawPayload: '{"source":2}',
      fingerprint: 'two',
    });
    const observations = await opportunities.getObservationsForOpportunity(
      first.opportunityId,
    );
    expect(observations.map((item) => item.sourceSystem).sort()).toEqual([
      'greenhouse',
      'lever',
    ]);
  });
});
