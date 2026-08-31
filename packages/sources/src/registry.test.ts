import { describe, expect, it } from 'vitest';
import { GreenhouseAdapter } from './greenhouse/adapter.js';
import { LeverAdapter } from './lever/adapter.js';
import { AshbyAdapter } from './ashby/adapter.js';
import { getSourceAdapter, getSourceNormalizer } from './registry.js';

describe('Source Registry', () => {
  it('resolves correct adapter and normalizer for greenhouse, lever, ashby', () => {
    expect(getSourceAdapter('greenhouse')).toBeInstanceOf(GreenhouseAdapter);
    expect(getSourceAdapter('GREENHOUSE')).toBeInstanceOf(GreenhouseAdapter);
    expect(getSourceAdapter('lever')).toBeInstanceOf(LeverAdapter);
    expect(getSourceAdapter('ashby')).toBeInstanceOf(AshbyAdapter);

    expect(getSourceNormalizer('greenhouse')).toBeDefined();
    expect(getSourceNormalizer('lever')).toBeDefined();
    expect(getSourceNormalizer('ashby')).toBeDefined();
  });

  it('throws error for unknown source systems', () => {
    expect(() => getSourceAdapter('unsupported_ats')).toThrow(
      "Unsupported source system: 'unsupported_ats'",
    );
    expect(() => getSourceNormalizer('unsupported_ats')).toThrow(
      "Unsupported source system: 'unsupported_ats'",
    );
  });
});
