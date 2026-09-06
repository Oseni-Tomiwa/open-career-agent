import type {
  RequirementId,
  RequirementAssistanceRunId,
  RequirementCandidateId,
  RequirementCandidateSourceId,
  RequirementProvenanceId,
  RequirementSetId,
  SnapshotId,
  SourceObservationId,
} from './identifiers.js';

export const REQUIREMENT_CATEGORIES = [
  'TECHNICAL_SKILL',
  'EXPERIENCE',
  'SENIORITY',
  'EDUCATION',
  'LOCATION',
  'RESIDENCY',
  'TIMEZONE',
  'WORK_MODEL',
  'WORK_AUTHORIZATION',
  'SPONSORSHIP',
  'LANGUAGE',
  'EMPLOYMENT_TYPE',
  'COMPENSATION',
  'DOMAIN_EXPERIENCE',
  'CERTIFICATION',
  'EXCLUSION',
  'OTHER',
] as const;
export const REQUIREMENT_STRENGTHS = [
  'REQUIRED',
  'PREFERRED',
  'CONTEXTUAL',
] as const;
export const REQUIREMENT_POLARITIES = [
  'REQUIRES',
  'PERMITS',
  'EXCLUDES',
  'UNAVAILABLE',
] as const;
export const REQUIREMENT_ASSERTION_BASES = [
  'EXPLICIT_STRUCTURED',
  'EXPLICIT_TEXT',
  'INTERPRETED',
] as const;
export const REQUIREMENT_EVALUATION_USES = [
  'ELIGIBILITY',
  'FIT',
  'CONTEXT_ONLY',
] as const;
export const REQUIREMENT_ACTIONABILITIES = [
  'HARD_CONSTRAINT_SAFE',
  'FIT_SIGNAL_SAFE',
  'REVIEW_ONLY',
] as const;
export const REQUIREMENT_CONFIDENCES = ['HIGH', 'MODERATE', 'LOW'] as const;
export const REQUIREMENT_SET_STATUSES = [
  'COMPLETE',
  'PARTIAL',
  'FAILED',
] as const;
export const REQUIREMENT_DETERMINISTIC_STATUSES = [
  'SUCCEEDED',
  'FAILED',
] as const;
export const REQUIREMENT_ASSISTED_STATUSES = [
  'NOT_REQUESTED',
  'SUCCEEDED',
  'UNAVAILABLE',
  'REJECTED',
  'FAILED',
] as const;

export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];
export type RequirementStrength = (typeof REQUIREMENT_STRENGTHS)[number];
export type RequirementPolarity = (typeof REQUIREMENT_POLARITIES)[number];
export type RequirementAssertionBasis =
  (typeof REQUIREMENT_ASSERTION_BASES)[number];
export type RequirementEvaluationUse =
  (typeof REQUIREMENT_EVALUATION_USES)[number];
export type RequirementActionability =
  (typeof REQUIREMENT_ACTIONABILITIES)[number];
export type RequirementConfidence = (typeof REQUIREMENT_CONFIDENCES)[number];
export type RequirementSetStatus = (typeof REQUIREMENT_SET_STATUSES)[number];
export type RequirementDeterministicStatus =
  (typeof REQUIREMENT_DETERMINISTIC_STATUSES)[number];
export type RequirementAssistedStatus =
  (typeof REQUIREMENT_ASSISTED_STATUSES)[number];

export const REQUIREMENT_CANDIDATE_VALIDATION_STATUSES = [
  'ACCEPTED_FOR_REVIEW',
  'DUPLICATE',
  'REJECTED',
] as const;
export const REQUIREMENT_GROUNDING_STATUSES = ['GROUNDED', 'REJECTED'] as const;
export const REQUIREMENT_ASSISTANCE_RUN_STATUSES = [
  'SUCCEEDED',
  'UNAVAILABLE',
  'REJECTED',
  'FAILED',
] as const;
export const MODEL_PROPOSAL_ACTIONABILITY_CEILINGS = [
  'FIT_SIGNAL_SAFE',
  'REVIEW_ONLY',
] as const;

export type RequirementCandidateValidationStatus =
  (typeof REQUIREMENT_CANDIDATE_VALIDATION_STATUSES)[number];
export type RequirementGroundingStatus =
  (typeof REQUIREMENT_GROUNDING_STATUSES)[number];
export type RequirementAssistanceRunStatus =
  (typeof REQUIREMENT_ASSISTANCE_RUN_STATUSES)[number];
export type ModelProposalActionabilityCeiling =
  (typeof MODEL_PROPOSAL_ACTIONABILITY_CEILINGS)[number];

export type RequirementValue =
  | {
      readonly type: 'TERM';
      readonly value: string;
      readonly alternatives?: readonly string[];
    }
  | {
      readonly type: 'DURATION';
      readonly minimumYears: number;
      readonly focus?: string;
    }
  | { readonly type: 'SCOPE'; readonly value: string }
  | { readonly type: 'TEXT'; readonly value: string };

export interface RequirementSet {
  readonly id: RequirementSetId;
  readonly snapshotId: SnapshotId;
  readonly modelVersion: string;
  readonly inputFingerprint: string;
  readonly extractorPipelineVersion: string;
  readonly deterministicExtractorVersion: string;
  readonly status: RequirementSetStatus;
  readonly deterministicStatus: RequirementDeterministicStatus;
  readonly assistedStatus: RequirementAssistedStatus;
  readonly createdAt: Date;
}

export interface CanonicalRequirement {
  readonly id: RequirementId;
  readonly requirementSetId: RequirementSetId;
  readonly category: RequirementCategory;
  readonly normalizedKey: string;
  readonly value: RequirementValue;
  readonly statement: string;
  readonly strength: RequirementStrength;
  readonly polarity: RequirementPolarity;
  readonly assertionBasis: RequirementAssertionBasis;
  readonly evaluationUse: RequirementEvaluationUse;
  readonly actionability: RequirementActionability;
  readonly extractionConfidence: RequirementConfidence;
  readonly extractorId: string;
  readonly extractorVersion: string;
  readonly canonicalHash: string;
  readonly createdAt: Date;
}

export interface RequirementProvenance {
  readonly id: RequirementProvenanceId;
  readonly requirementId: RequirementId;
  readonly sourceObservationId: SourceObservationId;
  readonly snapshotId: SnapshotId;
  readonly sourceFieldPath?: string;
  readonly normalizedSection?: string;
  readonly normalizedFragmentId?: string;
  readonly startOffset?: number;
  readonly endOffset?: number;
  readonly excerpt: string;
  readonly excerptHash: string;
  readonly locatorVersion: string;
  readonly extractorId: string;
  readonly extractorVersion: string;
}

export interface RequirementWithProvenance {
  readonly requirement: CanonicalRequirement;
  readonly provenance: readonly RequirementProvenance[];
}

export interface RequirementCandidateSource {
  readonly id: RequirementCandidateSourceId;
  readonly requirementCandidateId: RequirementCandidateId;
  readonly sourceObservationId: SourceObservationId;
  readonly snapshotId: SnapshotId;
  readonly normalizedFragmentId: string;
  readonly sourceFieldPath?: string;
  readonly excerpt: string;
  readonly excerptHash: string;
}

export interface RequirementCandidate {
  readonly id: RequirementCandidateId;
  readonly requirementSetId: RequirementSetId;
  readonly snapshotId: SnapshotId;
  readonly category: RequirementCategory;
  readonly normalizedKey: string;
  readonly value: RequirementValue;
  readonly statement: string;
  readonly strength: RequirementStrength;
  readonly polarity: RequirementPolarity;
  readonly assertionBasis: RequirementAssertionBasis;
  readonly evaluationUse: RequirementEvaluationUse;
  readonly actionabilityCeiling: ModelProposalActionabilityCeiling;
  readonly modelConfidence: RequirementConfidence;
  readonly rationale: string;
  readonly proposerId: string;
  readonly modelCapabilityVersion: string;
  readonly instructionVersion: string;
  readonly proposalSchemaVersion: string;
  readonly groundingValidatorVersion: string;
  readonly validationStatus: RequirementCandidateValidationStatus;
  readonly groundingStatus: RequirementGroundingStatus;
  readonly rejectionReasons: readonly string[];
  readonly proposalHash: string;
  readonly createdAt: Date;
  readonly sources: readonly RequirementCandidateSource[];
}

export interface RequirementAssistanceRun {
  readonly id: RequirementAssistanceRunId;
  readonly requirementSetId: RequirementSetId;
  readonly requestFingerprint: string;
  readonly assistedPipelineVersion: string;
  readonly selectionVersion: string;
  readonly proposalSchemaVersion: string;
  readonly instructionVersion: string;
  readonly groundingValidatorVersion: string;
  readonly providerId: string;
  readonly providerCapabilityVersion: string;
  readonly status: RequirementAssistanceRunStatus;
  readonly attempted: boolean;
  readonly selectedFragmentCount: number;
  readonly selectedCharacterCount: number;
  readonly proposalCount: number;
  readonly groundedCount: number;
  readonly rejectedCount: number;
  readonly duplicateCount: number;
  readonly consequentialCount: number;
  readonly unsafePromotionAttempts: number;
  readonly rejectionReasonCounts: Readonly<Record<string, number>>;
  readonly safeReason?: string;
  readonly createdAt: Date;
}

export interface CompleteRequirementSet {
  readonly set: RequirementSet;
  readonly requirements: readonly RequirementWithProvenance[];
  readonly candidates?: readonly RequirementCandidate[];
  readonly assistanceRun?: RequirementAssistanceRun;
}
