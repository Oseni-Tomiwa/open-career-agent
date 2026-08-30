import { describe, expect, it } from 'vitest';

import { fingerprintFitInputs, type FitFingerprintClaim } from './workflow.js';

function claim(
  overrides: Partial<FitFingerprintClaim> = {},
): FitFingerprintClaim {
  return {
    id: 'claim-1',
    kind: 'skill',
    value: 'AWS',
    scope: 'professional',
    state: 'SUPPORTED',
    confidence: 'HIGH',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    evidence: [
      {
        id: 'evidence-1',
        evidenceType: 'work',
        state: 'candidate-confirmed',
        sourceReference: 'resume',
        excerpt: 'Operated services on AWS.',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ],
    ...overrides,
  };
}

function fingerprint(
  claims: readonly FitFingerprintClaim[],
  overrides: { engineVersion?: string; snapshotFingerprint?: string } = {},
) {
  return fingerprintFitInputs({
    engineVersion: overrides.engineVersion ?? 'fit-v1',
    snapshotFingerprint: overrides.snapshotFingerprint ?? 'snapshot-one',
    claims,
  });
}

describe('Fit input fingerprint semantics', () => {
  it('ignores incidental claim/evidence IDs and persistence timestamps', () => {
    const first = claim();
    const sameKnowledge = claim({
      id: 'replacement-row-id',
      updatedAt: new Date('2026-08-30T00:00:00Z'),
      evidence: [
        {
          id: 'replacement-evidence-id',
          evidenceType: 'work',
          state: 'candidate-confirmed',
          sourceReference: 'resume',
          excerpt: 'Operated services on AWS.',
          createdAt: new Date('2026-08-30T00:00:00Z'),
        },
      ],
    });
    expect(fingerprint([first])).toBe(fingerprint([sameKnowledge]));
  });

  it('changes for claim value, epistemic state, or relevant scope', () => {
    const original = fingerprint([claim()]);
    expect(fingerprint([claim({ value: 'Azure' })])).not.toBe(original);
    expect(fingerprint([claim({ state: 'INFERRED' })])).not.toBe(original);
    expect(fingerprint([claim({ scope: 'project' })])).not.toBe(original);
  });

  it('changes when relevant Evidence changes', () => {
    const original = fingerprint([claim()]);
    expect(
      fingerprint([
        claim({
          evidence: [
            {
              evidenceType: 'work',
              state: 'candidate-confirmed',
              sourceReference: 'resume',
              excerpt: 'Used AWS in a personal tutorial.',
            },
          ],
        }),
      ]),
    ).not.toBe(original);
  });

  it('changes for a different OpportunitySnapshot or engine version', () => {
    const original = fingerprint([claim()]);
    expect(
      fingerprint([claim()], { snapshotFingerprint: 'snapshot-two' }),
    ).not.toBe(original);
    expect(fingerprint([claim()], { engineVersion: 'fit-v2' })).not.toBe(
      original,
    );
  });
});
