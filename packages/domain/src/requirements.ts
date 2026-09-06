import type {
  RequirementId,
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

export interface CompleteRequirementSet {
  readonly set: RequirementSet;
  readonly requirements: readonly RequirementWithProvenance[];
}
