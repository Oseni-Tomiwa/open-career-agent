import { describe, expect, it } from 'vitest';
import { fingerprintDecisionInputs } from './fingerprint.js';

describe('fingerprintDecisionInputs', () => {
  it('returns stable deterministic hash for identical semantic inputs', () => {
    const inputA = {
      engineVersion: 'decision-v1',
      eligibilityState: 'eligible',
      eligibilityFindings: [
        { dimension: 'location', state: 'PASS', summary: 'Matches US remote' },
        { dimension: 'work_auth', state: 'PASS', summary: 'Has US auth' },
      ],
      fitLevel: 'strong',
      fitInputFingerprint: 'fit-fp-123',
      qualityLevel: 'strong',
      qualityFreshnessBucket: 'recent',
      qualityInputFingerprint: 'qual-fp-456',
    };

    const inputB = {
      engineVersion: 'decision-v1',
      eligibilityState: 'eligible',
      eligibilityFindings: [
        { dimension: 'work_auth', state: 'PASS', summary: 'Has US auth' },
        { dimension: 'location', state: 'PASS', summary: 'Matches US remote' },
      ],
      fitLevel: 'strong',
      fitInputFingerprint: 'fit-fp-123',
      qualityLevel: 'strong',
      qualityFreshnessBucket: 'recent',
      qualityInputFingerprint: 'qual-fp-456',
    };

    expect(fingerprintDecisionInputs(inputA)).toBe(
      fingerprintDecisionInputs(inputB),
    );
  });

  it('produces different hash when upstream intelligence changes', () => {
    const base = {
      engineVersion: 'decision-v1',
      eligibilityState: 'eligible',
      fitLevel: 'strong',
      qualityLevel: 'strong',
    };

    const changedFit = {
      ...base,
      fitLevel: 'moderate',
    };

    const changedQuality = {
      ...base,
      qualityLevel: 'risk',
    };

    const changedEligibility = {
      ...base,
      eligibilityState: 'ineligible',
    };

    const baseHash = fingerprintDecisionInputs(base);
    expect(fingerprintDecisionInputs(changedFit)).not.toBe(baseHash);
    expect(fingerprintDecisionInputs(changedQuality)).not.toBe(baseHash);
    expect(fingerprintDecisionInputs(changedEligibility)).not.toBe(baseHash);
  });
});
