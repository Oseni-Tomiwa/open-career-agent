import { describe, expect, it } from 'vitest';

import { candidateId, opportunityId } from './identifiers.js';

describe('domain identifiers', () => {
  it('normalizes a non-empty identifier', () => {
    expect(candidateId(' candidate-1 ')).toBe('candidate-1');
  });

  it('rejects an empty identifier', () => {
    expect(() => opportunityId('   ')).toThrow('OpportunityId cannot be empty');
  });
});
