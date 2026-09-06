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
declare const searchTargetIdBrand: unique symbol;
declare const discoveryRunIdBrand: unique symbol;
declare const discoveryMatchIdBrand: unique symbol;
declare const requirementSetIdBrand: unique symbol;
declare const requirementIdBrand: unique symbol;
declare const requirementProvenanceIdBrand: unique symbol;
declare const sourceObservationIdBrand: unique symbol;

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
export type SearchTargetId = string & { readonly [searchTargetIdBrand]: true };
export type DiscoveryRunId = string & { readonly [discoveryRunIdBrand]: true };
export type DiscoveryMatchId = string & {
  readonly [discoveryMatchIdBrand]: true;
};
export type RequirementSetId = string & {
  readonly [requirementSetIdBrand]: true;
};
export type RequirementId = string & { readonly [requirementIdBrand]: true };
export type RequirementProvenanceId = string & {
  readonly [requirementProvenanceIdBrand]: true;
};
export type SourceObservationId = string & {
  readonly [sourceObservationIdBrand]: true;
};

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

export function searchTargetId(value: string): SearchTargetId {
  return requireIdentifier(value, 'SearchTargetId') as SearchTargetId;
}

export function discoveryRunId(value: string): DiscoveryRunId {
  return requireIdentifier(value, 'DiscoveryRunId') as DiscoveryRunId;
}

export function discoveryMatchId(value: string): DiscoveryMatchId {
  return requireIdentifier(value, 'DiscoveryMatchId') as DiscoveryMatchId;
}

export function requirementSetId(value: string): RequirementSetId {
  return requireIdentifier(value, 'RequirementSetId') as RequirementSetId;
}

export function requirementId(value: string): RequirementId {
  return requireIdentifier(value, 'RequirementId') as RequirementId;
}

export function requirementProvenanceId(
  value: string,
): RequirementProvenanceId {
  return requireIdentifier(
    value,
    'RequirementProvenanceId',
  ) as RequirementProvenanceId;
}

export function sourceObservationId(value: string): SourceObservationId {
  return requireIdentifier(value, 'SourceObservationId') as SourceObservationId;
}
