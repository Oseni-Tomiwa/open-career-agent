import type {
  CanonicalRequirement,
  CompleteRequirementSet,
  RequirementProvenance,
  RequirementWithProvenance,
} from '@oca/domain';

import type { EligibilityConstraint } from '../eligibility/extractor.js';
import type {
  FitDimension,
  FitModality,
  FitRequirement,
} from '../fit/extractor.js';

export const CANONICAL_ELIGIBILITY_ENGINE_VERSION = 'eligibility-v2.5';
export const REQUIREMENT_EVALUATION_POLICY_VERSION =
  'canonical-requirement-evaluation-policy-v1';
export const HISTORICAL_REQUIREMENT_FALLBACK_VERSION =
  'transient-v1-requirement-fallback-v1';

export type RequirementInputMode = 'CANONICAL' | 'FALLBACK_TRANSIENT_V1';

export interface CanonicalEligibilityConstraint extends EligibilityConstraint {
  readonly canonicalRequirementId: string;
  readonly provenance: readonly RequirementProvenance[];
}

export interface CanonicalFitRequirement extends FitRequirement {
  readonly canonicalRequirementId: string;
  readonly provenance: readonly RequirementProvenance[];
}

function scopeValue(requirement: CanonicalRequirement): string {
  if (requirement.value.type === 'DURATION') {
    return requirement.value.focus ?? 'relevant';
  }
  return requirement.value.value;
}

function eligibilityDimension(
  requirement: CanonicalRequirement,
): string | undefined {
  switch (requirement.category) {
    case 'SPONSORSHIP':
      return 'sponsorship';
    case 'WORK_AUTHORIZATION':
      return 'work_authorization';
    case 'LOCATION':
    case 'RESIDENCY':
      return 'location';
    case 'TIMEZONE':
      return 'timezone';
    case 'EDUCATION':
      return requirement.normalizedKey.includes('current-student')
        ? 'current_student'
        : 'education';
    case 'LANGUAGE':
      return 'language';
    case 'CERTIFICATION':
      return 'certification';
    case 'OTHER':
      return requirement.normalizedKey.includes('clearance')
        ? 'clearance'
        : undefined;
    default:
      return undefined;
  }
}

function eligibilityRequirementText(requirement: CanonicalRequirement): string {
  if (
    requirement.category === 'SPONSORSHIP' &&
    requirement.polarity === 'UNAVAILABLE'
  ) {
    return 'requires candidate to not need sponsorship';
  }
  return requirement.statement;
}

export function canonicalEligibilityConstraints(
  set: CompleteRequirementSet,
): readonly CanonicalEligibilityConstraint[] {
  return set.requirements.flatMap((item) => {
    const requirement = item.requirement;
    const dimension = eligibilityDimension(requirement);
    if (
      !dimension ||
      requirement.evaluationUse !== 'ELIGIBILITY' ||
      requirement.strength !== 'REQUIRED' ||
      requirement.actionability !== 'HARD_CONSTRAINT_SAFE' ||
      requirement.extractionConfidence !== 'HIGH' ||
      item.provenance.length === 0
    ) {
      return [];
    }

    return [
      {
        dimension,
        requirement: eligibilityRequirementText(requirement),
        modality: 'mandatory' as const,
        scope: scopeValue(requirement),
        sourceText: requirement.statement,
        extractionMethod: 'persisted_canonical_requirement',
        canonicalRequirementId: requirement.id,
        provenance: item.provenance,
      },
    ];
  });
}

function fitDimension(
  requirement: CanonicalRequirement,
): FitDimension | undefined {
  switch (requirement.category) {
    case 'TECHNICAL_SKILL':
      return 'technical_skill';
    case 'EXPERIENCE':
      return 'experience_depth';
    case 'SENIORITY':
      return 'seniority';
    case 'DOMAIN_EXPERIENCE':
      return 'domain';
    default:
      return undefined;
  }
}

function fitModality(
  requirement: CanonicalRequirement,
): FitModality | undefined {
  if (requirement.strength === 'REQUIRED') return 'required';
  if (requirement.strength === 'PREFERRED') return 'preferred';
  return undefined;
}

function normalizedFitValue(requirement: CanonicalRequirement): string {
  if (requirement.value.type === 'DURATION') {
    return requirement.value.focus ?? 'relevant';
  }
  if (
    requirement.value.type === 'TERM' &&
    requirement.value.alternatives?.length
  ) {
    return requirement.value.alternatives.join('|').toLowerCase();
  }
  return requirement.value.value.toLowerCase();
}

function fitLabel(requirement: CanonicalRequirement): string {
  if (requirement.value.type === 'DURATION') {
    const focus = requirement.value.focus ?? 'relevant experience';
    return `${requirement.value.minimumYears}+ years ${focus}`;
  }
  return requirement.value.value;
}

/**
 * A listing is assessable when it has at least one persisted, provenance-backed,
 * required or preferred canonical Fit requirement that is safe for Fit use.
 * Context-only, review-only, low-confidence, unsupported-category, and
 * RequirementCandidate records are deliberately excluded.
 */
export function canonicalFitRequirements(
  set: CompleteRequirementSet,
): readonly CanonicalFitRequirement[] {
  return set.requirements.flatMap((item: RequirementWithProvenance) => {
    const requirement = item.requirement;
    const dimension = fitDimension(requirement);
    const modality = fitModality(requirement);
    if (
      !dimension ||
      !modality ||
      requirement.evaluationUse !== 'FIT' ||
      requirement.actionability !== 'FIT_SIGNAL_SAFE' ||
      requirement.extractionConfidence === 'LOW' ||
      requirement.polarity !== 'REQUIRES' ||
      item.provenance.length === 0
    ) {
      return [];
    }

    return [
      {
        id: requirement.id,
        canonicalRequirementId: requirement.id,
        dimension,
        normalizedValue: normalizedFitValue(requirement),
        label: fitLabel(requirement),
        modality,
        sourceText: requirement.statement,
        sourceReference: `canonical-requirement:${requirement.id}`,
        extractionConfidence:
          requirement.extractionConfidence === 'HIGH' ? 'high' : 'medium',
        ...(requirement.value.type === 'DURATION'
          ? { minimumYears: requirement.value.minimumYears }
          : {}),
        provenance: item.provenance,
      },
    ];
  });
}
