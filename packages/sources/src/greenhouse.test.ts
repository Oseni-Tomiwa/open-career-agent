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

    expect(new GreenhouseNormalizer().normalize(record).content).toBe(
      'About the job\n\nBuild reliable APIs & tools.\n\nWrite Go\n\nOperate AWS',
    );
  });
});
