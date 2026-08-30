import { describe, expect, it } from 'vitest';
import { fingerprintQualityInputs } from './fingerprint.js';

describe('fingerprintQualityInputs', () => {
  const baseObservation = {
    sourceSystem: 'greenhouse',
    sourceExternalId: '12345',
    sourceUrl: 'https://boards.greenhouse.io/acme/jobs/12345',
    fingerprint: 'obs-fp-1',
    observedAt: new Date('2026-08-30T10:00:00Z'),
    sourceUpdatedAt: new Date('2026-08-25T10:00:00Z'),
  };

  it('produces deterministic output regardless of source observation array ordering', () => {
    const obsA = { ...baseObservation, sourceExternalId: '100' };
    const obsB = { ...baseObservation, sourceExternalId: '200' };

    const fp1 = fingerprintQualityInputs({
      engineVersion: 'quality-v1',
      snapshotFingerprint: 'snap-fp-1',
      freshnessBucket: 'recent',
      sourceObservations: [obsA, obsB],
    });

    const fp2 = fingerprintQualityInputs({
      engineVersion: 'quality-v1',
      snapshotFingerprint: 'snap-fp-1',
      freshnessBucket: 'recent',
      sourceObservations: [obsB, obsA],
    });

    expect(fp1).toBe(fp2);
  });

  it('changes fingerprint when freshness bucket changes across boundary', () => {
    const fpRecent = fingerprintQualityInputs({
      engineVersion: 'quality-v1',
      snapshotFingerprint: 'snap-fp-1',
      freshnessBucket: 'recent',
      sourceObservations: [baseObservation],
    });

    const fpAging = fingerprintQualityInputs({
      engineVersion: 'quality-v1',
      snapshotFingerprint: 'snap-fp-1',
      freshnessBucket: 'aging',
      sourceObservations: [baseObservation],
    });

    expect(fpRecent).not.toBe(fpAging);
  });

  it('changes fingerprint when snapshot fingerprint changes', () => {
    const fp1 = fingerprintQualityInputs({
      engineVersion: 'quality-v1',
      snapshotFingerprint: 'snap-fp-1',
      freshnessBucket: 'recent',
      sourceObservations: [baseObservation],
    });

    const fp2 = fingerprintQualityInputs({
      engineVersion: 'quality-v1',
      snapshotFingerprint: 'snap-fp-2',
      freshnessBucket: 'recent',
      sourceObservations: [baseObservation],
    });

    expect(fp1).not.toBe(fp2);
  });

  it('changes fingerprint when engine version changes', () => {
    const fpV1 = fingerprintQualityInputs({
      engineVersion: 'quality-v1',
      snapshotFingerprint: 'snap-fp-1',
      freshnessBucket: 'recent',
      sourceObservations: [baseObservation],
    });

    const fpV2 = fingerprintQualityInputs({
      engineVersion: 'quality-v2',
      snapshotFingerprint: 'snap-fp-1',
      freshnessBucket: 'recent',
      sourceObservations: [baseObservation],
    });

    expect(fpV1).not.toBe(fpV2);
  });
});
