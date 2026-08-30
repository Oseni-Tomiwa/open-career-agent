export const CAREER_MEMORY_CLAIM_STATES = [
  'SUPPORTED',
  'INFERRED',
  'UNKNOWN',
  'CONFLICTING',
  'UNSUPPORTED',
] as const;

export type CareerMemoryClaimState =
  (typeof CAREER_MEMORY_CLAIM_STATES)[number];

const TRANSITIONS: Readonly<
  Record<CareerMemoryClaimState, readonly CareerMemoryClaimState[]>
> = {
  UNKNOWN: ['INFERRED', 'SUPPORTED', 'UNSUPPORTED'],
  INFERRED: ['UNKNOWN', 'SUPPORTED', 'CONFLICTING', 'UNSUPPORTED'],
  SUPPORTED: ['CONFLICTING', 'UNSUPPORTED'],
  CONFLICTING: [],
  UNSUPPORTED: ['UNKNOWN', 'SUPPORTED'],
};

export function canTransitionClaimState(
  from: CareerMemoryClaimState,
  to: CareerMemoryClaimState,
): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function claimStateTransitionRequiresEvidence(
  from: CareerMemoryClaimState,
  to: CareerMemoryClaimState,
): 'trusted' | 'disputed' | null {
  if (from === to) return null;
  if (to === 'SUPPORTED') return 'trusted';
  if (to === 'CONFLICTING') return 'disputed';
  return null;
}
