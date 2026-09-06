import { describe, expect, it } from 'vitest';

import {
  MAX_LISTING_FRAGMENTS,
  buildListingDocument,
} from './listing-document.js';

describe('normalized listing document bounds', () => {
  it('prioritizes consequential sections and reports deterministic truncation', () => {
    const document = buildListingDocument({
      sourceSystem: 'synthetic-provider',
      sourceExternalId: 'bounded-listing',
      fragments: [
        ...Array.from({ length: MAX_LISTING_FRAGMENTS }, (_, index) => ({
          kind: 'BENEFITS' as const,
          text: `Decorative benefit ${index}`,
          sourceFieldPath: `$.benefits[${index}]`,
        })),
        {
          kind: 'REQUIREMENTS',
          text: 'TypeScript is required.',
          sourceFieldPath: '$.requirements[0]',
        },
      ],
    });

    expect(document.fragments).toHaveLength(MAX_LISTING_FRAGMENTS);
    expect(document.truncated).toBe(true);
    expect(document.discardedFragmentCount).toBe(1);
    expect(
      document.fragments.some(
        (fragment) => fragment.text === 'TypeScript is required.',
      ),
    ).toBe(true);
  });
});
