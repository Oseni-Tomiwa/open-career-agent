import type { Opportunity } from './types.js';

export function fitPresentation(opportunity: Opportunity): string {
  if (
    opportunity.fitAssessmentStatus ===
    'INSUFFICIENT_LISTING_REQUIREMENTS'
  ) {
    return 'Not enough listing requirements to assess fit';
  }
  if (
    opportunity.fitAssessmentStatus === 'INSUFFICIENT_CANDIDATE_EVIDENCE'
  ) {
    return 'Candidate evidence is insufficient to assess fit';
  }
  return opportunity.fit ?? 'Not evaluated';
}
