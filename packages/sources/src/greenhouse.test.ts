import { describe, expect, it } from 'vitest';

import type { SourceOpportunity } from './core/index.js';
import { GreenhouseNormalizer } from './greenhouse/normalizer.js';

describe('Greenhouse normalizer', () => {
  it('converts public Greenhouse HTML content into readable plain text', () => {
    const record: SourceOpportunity = {
      sourceSystem: 'greenhouse',
      sourceExternalId: 'greenhouse-101',
      observedAt: new Date('2026-08-31T00:00:00.000Z'),
      rawPayload: JSON.stringify({
        title: 'Backend Engineer',
        company_name: 'Acme',
        content:
          '&lt;h4&gt;About the job&lt;/h4&gt;&lt;p&gt;Build reliable APIs &amp;amp; tools.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Write Go&lt;/li&gt;&lt;li&gt;Operate AWS&lt;/li&gt;&lt;/ul&gt;',
      }),
    };

    const normalized = new GreenhouseNormalizer().normalize(record);
    expect(normalized.content).toBe(
      'About the job\n\nBuild reliable APIs & tools.\n\nWrite Go\n\nOperate AWS',
    );
    expect(normalized.document.fragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          heading: 'About the job',
          kind: 'SUMMARY',
          sourceFieldPath: '$.content',
        }),
        expect.objectContaining({
          structure: 'LIST_ITEM',
          text: 'Write Go',
        }),
      ]),
    );
  });

  it('preserves qualification headings and structured location provenance', () => {
    const normalized = new GreenhouseNormalizer().normalize({
      sourceSystem: 'greenhouse',
      sourceExternalId: 'greenhouse-rich',
      observedAt: new Date('2026-09-06T00:00:00.000Z'),
      rawPayload: JSON.stringify({
        title: 'Platform Engineer',
        company_name: 'Example',
        content:
          '<h3>Minimum qualifications</h3><ul><li>3+ years of TypeScript experience</li></ul><h3>Preferred qualifications</h3><ul><li>React experience</li></ul>',
        location: { name: 'Remote, Germany' },
        departments: [{ name: 'Engineering' }],
        offices: [{ name: 'Berlin hub', location: 'Berlin, Germany' }],
        metadata: [{ name: 'Employment type', value: 'Full-time' }],
      }),
    });
    expect(normalized.document.fragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'REQUIREMENTS' }),
        expect.objectContaining({ kind: 'PREFERRED_QUALIFICATIONS' }),
        expect.objectContaining({
          kind: 'LOCATION',
          sourceFieldPath: '$.location.name',
        }),
        expect.objectContaining({
          heading: 'Department',
          sourceFieldPath: '$.departments[0].name',
        }),
        expect.objectContaining({
          heading: 'Office',
          sourceFieldPath: '$.offices[0].name',
        }),
        expect.objectContaining({
          kind: 'LOCATION',
          sourceFieldPath: '$.offices[0].location',
        }),
        expect.objectContaining({
          sourceFieldPath: '$.metadata[0].value',
        }),
      ]),
    );
  });
});
