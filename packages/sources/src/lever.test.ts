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
});
