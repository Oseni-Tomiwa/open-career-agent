export const OPPORTUNITY_TYPES = ['JOB'] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];
