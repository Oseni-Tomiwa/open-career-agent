import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeverAdapter } from './lever/adapter.js';
import { LeverNormalizer } from './lever/normalizer.js';

describe('Lever Adapter and Normalizer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('discovers and normalizes valid Lever postings payload', async () => {
    const fixture = [
      {
        id: 'lever-101',
        text: 'Senior Backend Software Engineer',
        hostedUrl: 'https://jobs.lever.co/acme/lever-101',
        descriptionPlain: 'We need TypeScript and Go experience.',
        categories: {
          location: 'Berlin, Germany',
          commitment: 'Full-time',
          team: 'Infrastructure',
        },
        workplaceType: 'hybrid',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const adapter = new LeverAdapter();
    const records = [];
    for await (const record of adapter.discover('acme')) {
      records.push(record);
    }

    expect(records).toHaveLength(1);
    expect(records[0]?.sourceSystem).toBe('lever');
    expect(records[0]?.sourceExternalId).toBe('lever-101');
    expect(records[0]?.sourceUrl).toBe('https://jobs.lever.co/acme/lever-101');

    const normalizer = new LeverNormalizer();
    const normalized = normalizer.normalize(records[0]!);
    expect(normalized.title).toBe('Senior Backend Software Engineer');
    expect(normalized.organization).toBe('acme');
    expect(normalized.location).toBe('Berlin, Germany');
    expect(normalized.workModel).toBe('hybrid');
    expect(normalized.employmentType).toBe('full-time');
    expect(normalized.content).toBe('We need TypeScript and Go experience.');

    const hash = normalizer.hash(normalized);
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);
  });

  it('handles empty postings array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const adapter = new LeverAdapter();
    const records = [];
    for await (const record of adapter.discover('empty')) {
      records.push(record);
    }
    expect(records).toHaveLength(0);
  });

  it('throws honest error when Lever API returns 404 or failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    );

    const adapter = new LeverAdapter();
    await expect(async () => {
      for await (const _record of adapter.discover('invalid-site')) {
        // iterate
      }
    }).rejects.toThrow('Lever API returned 404 Not Found');
  });

  it('throws error on malformed non-array response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid' }), { status: 200 }),
    );

    const adapter = new LeverAdapter();
    await expect(async () => {
      for await (const _record of adapter.discover('bad-site')) {
        // iterate
      }
    }).rejects.toThrow('Malformed Lever response: missing postings array');
  });

  it('preserves structured lists and richer fields without duplicating legacy body text', () => {
    const record = {
      sourceSystem: 'lever',
      sourceExternalId: 'lever-rich',
      sourceUrl: 'https://jobs.lever.co/example/lever-rich',
      observedAt: new Date('2026-09-06T00:00:00.000Z'),
      rawPayload: JSON.stringify({
        text: 'Backend Engineer',
        _siteId: 'example',
        descriptionPlain: 'Legacy duplicate body containing TypeScript.',
        openingPlain: 'Build reliable data products.',
        descriptionBodyPlain: 'Work with a thoughtful engineering team.',
        lists: [
          {
            text: 'Requirements',
            content: '<ul><li>3+ years of TypeScript experience</li></ul>',
          },
          {
            text: 'Nice to have',
            content: '<ul><li>React experience is a plus</li></ul>',
          },
        ],
        additionalPlain: 'USD 120000–150000 per year',
        country: 'Germany',
        categories: {
          location: 'Berlin',
          allLocations: ['Berlin', 'Amsterdam'],
          commitment: 'Full-time',
          department: 'Engineering',
          team: 'Data',
        },
        workplaceType: 'Remote',
        salaryRange: {
          min: 120000,
          max: 150000,
          currency: 'USD',
          interval: 'year',
        },
      }),
    };

    const normalized = new LeverNormalizer().normalize(record);
    expect(normalized.content).toBe(
      'Legacy duplicate body containing TypeScript.',
    );
    expect(normalized.document.fragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'REQUIREMENTS',
          heading: 'Requirements',
          structure: 'LIST_ITEM',
          sourceFieldPath: '$.lists[0].content',
          text: '3+ years of TypeScript experience',
        }),
        expect.objectContaining({
          kind: 'PREFERRED_QUALIFICATIONS',
          sourceFieldPath: '$.lists[1].content',
        }),
        expect.objectContaining({
          kind: 'LOCATION',
          sourceFieldPath: '$.categories.allLocations',
        }),
        expect.objectContaining({
          kind: 'COMPENSATION',
          sourceFieldPath: '$.salaryRange',
        }),
        expect.objectContaining({
          heading: 'Department',
          sourceFieldPath: '$.categories.department',
        }),
        expect.objectContaining({
          heading: 'Team',
          sourceFieldPath: '$.categories.team',
        }),
      ]),
    );
    expect(
      normalized.document.fragments.some(
        (fragment) => fragment.sourceFieldPath === '$.descriptionPlain',
      ),
    ).toBe(false);

    const legacyOnly = new LeverNormalizer().normalize({
      ...record,
      rawPayload: JSON.stringify({
        text: 'Backend Engineer',
        _siteId: 'example',
        descriptionPlain: 'Legacy duplicate body containing TypeScript.',
        categories: {
          location: 'Berlin',
          commitment: 'Full-time',
        },
        workplaceType: 'Remote',
      }),
    });
    expect(new LeverNormalizer().hash(normalized)).toBe(
      new LeverNormalizer().hash(legacyOnly),
    );
  });

  it('tolerates malformed optional collection fields', () => {
    const normalized = new LeverNormalizer().normalize({
      sourceSystem: 'lever',
      sourceExternalId: 'lever-sparse',
      observedAt: new Date('2026-09-06T00:00:00.000Z'),
      rawPayload: JSON.stringify({
        text: 'Sparse role',
        _siteId: 'example',
        descriptionPlain: 'A sparse listing.',
        lists: { invalid: true },
        categories: { allLocations: { invalid: true } },
      }),
    });
    expect(normalized.document.fragments).toHaveLength(2);
    expect(normalized.document.truncated).toBe(false);
  });
});
