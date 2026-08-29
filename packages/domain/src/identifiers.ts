declare const applicationIdBrand: unique symbol;
declare const candidateIdBrand: unique symbol;
declare const evaluationIdBrand: unique symbol;
declare const opportunityIdBrand: unique symbol;
declare const claimIdBrand: unique symbol;
declare const snapshotIdBrand: unique symbol;
declare const evidenceIdBrand: unique symbol;
declare const decisionIdBrand: unique symbol;
declare const eventIdBrand: unique symbol;
declare const sourceRecordIdBrand: unique symbol;
declare const findingIdBrand: unique symbol;

export type ApplicationId = string & { readonly [applicationIdBrand]: true };
export type CandidateId = string & { readonly [candidateIdBrand]: true };
export type EvaluationId = string & { readonly [evaluationIdBrand]: true };
export type OpportunityId = string & { readonly [opportunityIdBrand]: true };
export type ClaimId = string & { readonly [claimIdBrand]: true };
export type SnapshotId = string & { readonly [snapshotIdBrand]: true };
export type EvidenceId = string & { readonly [evidenceIdBrand]: true };
export type DecisionId = string & { readonly [decisionIdBrand]: true };
export type EventId = string & { readonly [eventIdBrand]: true };
export type SourceRecordId = string & { readonly [sourceRecordIdBrand]: true };
export type FindingId = string & { readonly [findingIdBrand]: true };

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

export function claimId(value: string): ClaimId {
  return requireIdentifier(value, 'ClaimId') as ClaimId;
}

export function snapshotId(value: string): SnapshotId {
  return requireIdentifier(value, 'SnapshotId') as SnapshotId;
}

export function evidenceId(value: string): EvidenceId {
  return requireIdentifier(value, 'EvidenceId') as EvidenceId;
}

export function decisionId(value: string): DecisionId {
  return requireIdentifier(value, 'DecisionId') as DecisionId;
}

export function eventId(value: string): EventId {
  return requireIdentifier(value, 'EventId') as EventId;
}

export function sourceRecordId(value: string): SourceRecordId {
  return requireIdentifier(value, 'SourceRecordId') as SourceRecordId;
}

export function findingId(value: string): FindingId {
  return requireIdentifier(value, 'FindingId') as FindingId;
}
