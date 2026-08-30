import { createHash } from 'node:crypto';
import type { QualitySourceObservationInput } from '@oca/intelligence';

export interface QualityFingerprintInput {
  readonly engineVersion: string;
  readonly snapshotFingerprint: string;
  readonly freshnessBucket: string;
  readonly sourceObservations: readonly QualitySourceObservationInput[];
}

export function fingerprintQualityInputs(
  input: QualityFingerprintInput,
): string {
  const canonicalObservations = input.sourceObservations
    .map((obs) => ({
      sourceSystem: obs.sourceSystem,
      sourceExternalId: obs.sourceExternalId,
      sourceUrl: obs.sourceUrl ?? null,
      fingerprint: obs.fingerprint,
      observedAt: obs.observedAt.toISOString(),
      sourceUpdatedAt: obs.sourceUpdatedAt?.toISOString() ?? null,
      explicitStatus: obs.explicitStatus ?? null,
      title: obs.title ?? null,
      organization: obs.organization ?? null,
      location: obs.location ?? null,
      workModel: obs.workModel ?? null,
      employmentType: obs.employmentType ?? null,
      compensation: obs.compensation ?? null,
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );

  return createHash('sha256')
    .update(
      JSON.stringify({
        engineVersion: input.engineVersion,
        snapshotFingerprint: input.snapshotFingerprint,
        freshnessBucket: input.freshnessBucket,
        sourceObservations: canonicalObservations,
      }),
    )
    .digest('hex');
}
