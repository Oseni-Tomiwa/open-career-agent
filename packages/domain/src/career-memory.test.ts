import { describe, expect, it } from 'vitest';

import {
  canTransitionClaimState,
  claimStateTransitionRequiresEvidence,
} from './career-memory.js';

describe('Career Memory claim transitions', () => {
  it('allows conservative confirmation and contradiction transitions', () => {
    expect(canTransitionClaimState('UNKNOWN', 'SUPPORTED')).toBe(true);
    expect(canTransitionClaimState('INFERRED', 'SUPPORTED')).toBe(true);
    expect(canTransitionClaimState('SUPPORTED', 'CONFLICTING')).toBe(true);
  });

  it('does not erase a conflict through a state-only mutation', () => {
    expect(canTransitionClaimState('CONFLICTING', 'SUPPORTED')).toBe(false);
    expect(canTransitionClaimState('CONFLICTING', 'UNKNOWN')).toBe(false);
  });

  it('requires appropriate Evidence for epistemically stronger states', () => {
    expect(claimStateTransitionRequiresEvidence('UNKNOWN', 'SUPPORTED')).toBe(
      'trusted',
    );
    expect(
      claimStateTransitionRequiresEvidence('SUPPORTED', 'CONFLICTING'),
    ).toBe('disputed');
  });
});
