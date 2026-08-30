import { createHash } from 'node:crypto';

export interface DecisionFingerprintInput {
  readonly engineVersion: string;
  readonly eligibilityState?: string | null;
  readonly eligibilityInputFingerprint?: string | null;
  readonly eligibilityFindings?: readonly {
    readonly dimension: string;
    readonly state: string;
    readonly summary: string;
  }[];
  readonly fitLevel?: string | null;
  readonly fitInputFingerprint?: string | null;
  readonly qualityLevel?: string | null;
  readonly qualityFreshnessBucket?: string | null;
  readonly qualityInputFingerprint?: string | null;
}

export function fingerprintDecisionInputs(
  input: DecisionFingerprintInput,
): string {
  const canonicalEligibilityFindings = (input.eligibilityFindings ?? [])
    .map((f) => ({
      dimension: f.dimension,
      state: f.state,
      summary: f.summary,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  return createHash('sha256')
    .update(
      JSON.stringify({
        engineVersion: input.engineVersion,
        eligibilityState: input.eligibilityState ?? null,
        eligibilityInputFingerprint: input.eligibilityInputFingerprint ?? null,
        eligibilityFindings: canonicalEligibilityFindings,
        fitLevel: input.fitLevel ?? null,
        fitInputFingerprint: input.fitInputFingerprint ?? null,
        qualityLevel: input.qualityLevel ?? null,
        qualityFreshnessBucket: input.qualityFreshnessBucket ?? null,
        qualityInputFingerprint: input.qualityInputFingerprint ?? null,
      }),
    )
    .digest('hex');
}
