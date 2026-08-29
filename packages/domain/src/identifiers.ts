declare const applicationIdBrand: unique symbol;
declare const candidateIdBrand: unique symbol;
declare const evaluationIdBrand: unique symbol;
declare const opportunityIdBrand: unique symbol;

export type ApplicationId = string & { readonly [applicationIdBrand]: true };
export type CandidateId = string & { readonly [candidateIdBrand]: true };
export type EvaluationId = string & { readonly [evaluationIdBrand]: true };
export type OpportunityId = string & { readonly [opportunityIdBrand]: true };

function requireIdentifier(value: string, name: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`${name} cannot be empty`);
  }

  return normalized;
}

export function applicationId(value: string): ApplicationId {
  return requireIdentifier(value, 'ApplicationId') as ApplicationId;
}

export function candidateId(value: string): CandidateId {
  return requireIdentifier(value, 'CandidateId') as CandidateId;
}

export function evaluationId(value: string): EvaluationId {
  return requireIdentifier(value, 'EvaluationId') as EvaluationId;
}

export function opportunityId(value: string): OpportunityId {
  return requireIdentifier(value, 'OpportunityId') as OpportunityId;
}
