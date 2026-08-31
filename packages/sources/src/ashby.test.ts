import { afterEach, describe, expect, it, vi } from 'vitest';
import { AshbyAdapter } from './ashby/adapter.js';
import { AshbyNormalizer } from './ashby/normalizer.js';

describe('Ashby Adapter and Normalizer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('discovers and normalizes valid Ashby jobs payload', async () => {
    const fixture = {
      jobs: [
        {
          id: 'ashby-202',
          title: 'Full Stack Staff Engineer',
          department: 'Core Product',
          locationName: 'San Francisco, CA',
          employmentType: 'FullTime',
          workplaceType: 'Remote',
          isRemote: true,
          jobUrl: 'https://jobs.ashbyhq.com/linear/ashby-202',
          descriptionPlain: 'React and Node.js codebase.',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const adapter = new AshbyAdapter();
    const records = [];
    for await (const record of adapter.discover('linear')) {
      records.push(record);
    }

    expect(records).toHaveLength(1);
    expect(records[0]?.sourceSystem).toBe('ashby');
    expect(records[0]?.sourceExternalId).toBe('ashby-202');
    expect(records[0]?.sourceUrl).toBe(
      'https://jobs.ashbyhq.com/linear/ashby-202',
    );

    const normalizer = new AshbyNormalizer();
    const normalized = normalizer.normalize(records[0]!);
    expect(normalized.title).toBe('Full Stack Staff Engineer');
    expect(normalized.organization).toBe('Core Product');
    expect(normalized.location).toBe('San Francisco, CA');
    expect(normalized.workModel).toBe('remote');
    expect(normalized.employmentType).toBe('full-time');
    expect(normalized.content).toBe('React and Node.js codebase.');

    const hash = normalizer.hash(normalized);
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);
  });

  it('handles empty jobs array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ jobs: [] }), { status: 200 }),
    );

    const adapter = new AshbyAdapter();
    const records = [];
    for await (const record of adapter.discover('empty')) {
      records.push(record);
    }
    expect(records).toHaveLength(0);
  });

  it('throws honest error when Ashby API returns 500 or network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Error', {
        status: 500,
        statusText: 'Server Error',
      }),
    );

    const adapter = new AshbyAdapter();
    await expect(async () => {
      for await (const _record of adapter.discover('broken')) {
        // iterate
      }
    }).rejects.toThrow('Ashby API returned 500 Server Error');
  });

  it('throws error on malformed payload missing jobs array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: null }), { status: 200 }),
    );

    const adapter = new AshbyAdapter();
    await expect(async () => {
      for await (const _record of adapter.discover('invalid')) {
        // iterate
      }
    }).rejects.toThrow('Malformed Ashby response: missing jobs array');
  });
});
