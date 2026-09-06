import { createHash } from 'node:crypto';
import type {
  CanonicalRequirement,
  CompleteRequirementSet,
  RequirementCategory,
  RequirementProvenance,
  RequirementStrength,
  RequirementValue,
  SnapshotId,
  SourceObservationId,
} from '@oca/domain';
import {
  requirementId,
  requirementProvenanceId,
  requirementSetId,
} from '@oca/domain';

import {
  EligibilityConstraintExtractor,
  type EligibilityConstraint,
} from '../eligibility/extractor.js';
import {
  FitRequirementExtractor,
  type FitRequirement,
} from '../fit/extractor.js';
import { FIT_ENGINE_VERSION } from '../fit/engine.js';

export const REQUIREMENT_SET_MODEL_VERSION = 'requirement-set-v1';
export const V1_COMPAT_PIPELINE_VERSION = 'requirements-v2.1-v1-compat';
export const V1_COMPAT_DETERMINISTIC_EXTRACTOR_VERSION = `eligibility-v1+${FIT_ENGINE_VERSION}`;
export const V1_COMPAT_LOCATOR_VERSION = 'normalized-snapshot-v1';

export interface V1CompatibilitySnapshot {
  readonly id: string;
  readonly title?: string | null;
  readonly content?: string | null;
  readonly location?: string | null;
  readonly workModel?: string | null;
  readonly fingerprint: string;
}

export interface V1CompatibilityObservation {
  readonly id: string;
  readonly fingerprint: string;
  readonly observedAt?: Date | string | number;
}

export interface V1CompatibilityOptions {
  readonly modelVersion?: string;
  readonly pipelineVersion?: string;
  readonly deterministicExtractorVersion?: string;
  readonly createdAt?: Date;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function shortId(prefix: string, value: unknown): string {
  return `${prefix}_${hash(value).slice(0, 32)}`;
}

function eligibilityCategory(dimension: string): RequirementCategory {
  return (
    ({
      sponsorship: 'SPONSORSHIP',
      work_authorization: 'WORK_AUTHORIZATION',
      citizenship: 'WORK_AUTHORIZATION',
      current_student: 'EDUCATION',
      education: 'EDUCATION',
      location: 'LOCATION',
      language: 'LANGUAGE',
      clearance: 'OTHER',
    }[dimension] as RequirementCategory | undefined) ?? 'OTHER'
  );
}

function fitCategory(requirement: FitRequirement): RequirementCategory {
  if (requirement.dimension === 'experience_depth') return 'EXPERIENCE';
  if (requirement.dimension === 'seniority') return 'SENIORITY';
  if (requirement.dimension === 'domain') return 'DOMAIN_EXPERIENCE';
  if (
    [
      'technical_skill',
      'tool_platform',
      'programming_language',
      'architecture',
      'cloud_devops',
      'data_database',
    ].includes(requirement.dimension)
  ) {
    return 'TECHNICAL_SKILL';
  }
  return 'OTHER';
}

function eligibilityStrength(
  modality: EligibilityConstraint['modality'],
): RequirementStrength {
  if (modality === 'mandatory') return 'REQUIRED';
  if (modality === 'preferred') return 'PREFERRED';
  return 'CONTEXTUAL';
}

function fitStrength(
  modality: FitRequirement['modality'],
): RequirementStrength {
  if (modality === 'required') return 'REQUIRED';
  if (modality === 'preferred') return 'PREFERRED';
  return 'CONTEXTUAL';
}

function eligibilityValue(constraint: EligibilityConstraint): RequirementValue {
  return { type: 'SCOPE', value: constraint.scope || constraint.requirement };
}

function fitValue(requirement: FitRequirement): RequirementValue {
  if (
    requirement.dimension === 'experience_depth' &&
    requirement.minimumYears !== undefined
  ) {
    return {
      type: 'DURATION',
      minimumYears: requirement.minimumYears,
      ...(requirement.normalizedValue !== 'relevant'
        ? { focus: requirement.normalizedValue }
        : {}),
    };
  }
  const alternatives = requirement.normalizedValue.split('|');
  return {
    type: 'TERM',
    value: requirement.normalizedValue,
    ...(alternatives.length > 1 ? { alternatives } : {}),
  };
}

export function mapV1EligibilityConstraint(input: {
  readonly constraint: EligibilityConstraint;
  readonly requirementSetId: string;
  readonly createdAt: Date;
}): CanonicalRequirement {
  const { constraint } = input;
  const strength = eligibilityStrength(constraint.modality);
  const assertionBasis =
    constraint.extractionMethod === 'structured_field'
      ? 'EXPLICIT_STRUCTURED'
      : 'EXPLICIT_TEXT';
  const semantic = {
    source: 'eligibility',
    dimension: constraint.dimension,
    requirement: constraint.requirement,
    scope: constraint.scope,
    strength,
    assertionBasis,
  };
  const canonicalHash = hash(semantic);
  return {
    id: requirementId(shortId('req', [input.requirementSetId, canonicalHash])),
    requirementSetId: requirementSetId(input.requirementSetId),
    category: eligibilityCategory(constraint.dimension),
    normalizedKey: `eligibility:${constraint.dimension}:${constraint.scope || constraint.requirement}`,
    value: eligibilityValue(constraint),
    statement: constraint.requirement,
    strength,
    polarity:
      constraint.dimension === 'sponsorship' &&
      constraint.requirement.includes('is available')
        ? 'PERMITS'
        : constraint.dimension === 'sponsorship'
          ? 'UNAVAILABLE'
          : 'REQUIRES',
    assertionBasis,
    evaluationUse:
      constraint.modality === 'mandatory' ? 'ELIGIBILITY' : 'CONTEXT_ONLY',
    actionability:
      constraint.modality === 'mandatory'
        ? 'HARD_CONSTRAINT_SAFE'
        : 'REVIEW_ONLY',
    extractionConfidence: 'HIGH',
    extractorId: 'eligibility-constraint-extractor',
    extractorVersion: 'eligibility-v1',
    canonicalHash,
    createdAt: input.createdAt,
  };
}

export function mapV1FitRequirement(input: {
  readonly requirement: FitRequirement;
  readonly requirementSetId: string;
  readonly createdAt: Date;
}): CanonicalRequirement {
  const { requirement } = input;
  const strength = fitStrength(requirement.modality);
  const semantic = {
    source: 'fit',
    dimension: requirement.dimension,
    normalizedValue: requirement.normalizedValue,
    minimumYears: requirement.minimumYears ?? null,
    strength,
    statement: requirement.sourceText,
  };
  const canonicalHash = hash(semantic);
  return {
    id: requirementId(shortId('req', [input.requirementSetId, canonicalHash])),
    requirementSetId: requirementSetId(input.requirementSetId),
    category: fitCategory(requirement),
    normalizedKey: `fit:${requirement.dimension}:${requirement.normalizedValue}`,
    value: fitValue(requirement),
    statement: requirement.sourceText,
    strength,
    polarity: 'REQUIRES',
    assertionBasis:
      requirement.dimension === 'seniority'
        ? 'EXPLICIT_STRUCTURED'
        : 'EXPLICIT_TEXT',
    evaluationUse: requirement.modality === 'optional' ? 'CONTEXT_ONLY' : 'FIT',
    actionability:
      requirement.modality === 'optional' ? 'REVIEW_ONLY' : 'FIT_SIGNAL_SAFE',
    extractionConfidence:
      requirement.extractionConfidence === 'high' ? 'HIGH' : 'MODERATE',
    extractorId: 'fit-requirement-extractor',
    extractorVersion: FIT_ENGINE_VERSION,
    canonicalHash,
    createdAt: input.createdAt,
  };
}

function exactContentExcerpt(content: string, proposed: string): string {
  if (proposed && content.toLowerCase().includes(proposed.toLowerCase())) {
    const start = content.toLowerCase().indexOf(proposed.toLowerCase());
    return content.slice(start, start + proposed.length);
  }
  return content;
}

function provenanceFor(input: {
  readonly requirement: CanonicalRequirement;
  readonly observation: V1CompatibilityObservation;
  readonly snapshot: V1CompatibilitySnapshot;
  readonly section: 'content' | 'location' | 'title';
  readonly proposedExcerpt: string;
}): RequirementProvenance {
  const sourceValue =
    input.section === 'location'
      ? (input.snapshot.location ?? input.proposedExcerpt)
      : input.section === 'title'
        ? (input.snapshot.title ?? input.proposedExcerpt)
        : exactContentExcerpt(
            input.snapshot.content ?? '',
            input.proposedExcerpt,
          );
  const excerpt = sourceValue.trim();
  const excerptHash = hash(excerpt);
  return {
    id: requirementProvenanceId(
      shortId('rqp', [
        input.requirement.id,
        input.observation.id,
        excerptHash,
        V1_COMPAT_LOCATOR_VERSION,
      ]),
    ),
    requirementId: input.requirement.id,
    sourceObservationId: input.observation.id as SourceObservationId,
    snapshotId: input.snapshot.id as SnapshotId,
    normalizedSection: input.section,
    excerpt,
    excerptHash,
    locatorVersion: V1_COMPAT_LOCATOR_VERSION,
    extractorId: input.requirement.extractorId,
    extractorVersion: input.requirement.extractorVersion,
  };
}

export function fingerprintV1RequirementInput(input: {
  readonly snapshotFingerprint: string;
  readonly observations: readonly V1CompatibilityObservation[];
  readonly modelVersion?: string;
  readonly pipelineVersion?: string;
  readonly deterministicExtractorVersion?: string;
}): string {
  return hash({
    snapshotFingerprint: input.snapshotFingerprint,
    observationFingerprints: input.observations
      .map((observation) => observation.fingerprint)
      .sort(),
    modelVersion: input.modelVersion ?? REQUIREMENT_SET_MODEL_VERSION,
    pipelineVersion: input.pipelineVersion ?? V1_COMPAT_PIPELINE_VERSION,
    deterministicExtractorVersion:
      input.deterministicExtractorVersion ??
      V1_COMPAT_DETERMINISTIC_EXTRACTOR_VERSION,
    locatorVersion: V1_COMPAT_LOCATOR_VERSION,
  });
}

export function buildV1CompatibilityRequirementSet(
  snapshot: V1CompatibilitySnapshot,
  observations: readonly V1CompatibilityObservation[],
  options: V1CompatibilityOptions = {},
): CompleteRequirementSet {
  if (observations.length === 0) {
    throw new TypeError(
      'V1 compatibility extraction requires a source observation',
    );
  }
  const createdAt = options.createdAt ?? new Date();
  const modelVersion = options.modelVersion ?? REQUIREMENT_SET_MODEL_VERSION;
  const pipelineVersion = options.pipelineVersion ?? V1_COMPAT_PIPELINE_VERSION;
  const deterministicExtractorVersion =
    options.deterministicExtractorVersion ??
    V1_COMPAT_DETERMINISTIC_EXTRACTOR_VERSION;
  const inputFingerprint = fingerprintV1RequirementInput({
    snapshotFingerprint: snapshot.fingerprint,
    observations,
    modelVersion,
    pipelineVersion,
    deterministicExtractorVersion,
  });
  const setId = requirementSetId(
    shortId('rqs', [snapshot.id, pipelineVersion, inputFingerprint]),
  );
  const origin = [...observations].sort((left, right) => {
    const leftTime = new Date(left.observedAt ?? 0).getTime();
    const rightTime = new Date(right.observedAt ?? 0).getTime();
    return leftTime - rightTime || left.id.localeCompare(right.id);
  })[0]!;

  const eligibility = new EligibilityConstraintExtractor()
    .extract(snapshot)
    .map((constraint) => {
      const requirement = mapV1EligibilityConstraint({
        constraint,
        requirementSetId: setId,
        createdAt,
      });
      return {
        requirement,
        provenance: [
          provenanceFor({
            requirement,
            observation: origin,
            snapshot,
            section:
              constraint.extractionMethod === 'structured_field'
                ? 'location'
                : 'content',
            proposedExcerpt: constraint.sourceText,
          }),
        ],
      };
    });
  const fit = new FitRequirementExtractor().extract(snapshot).map((item) => {
    const requirement = mapV1FitRequirement({
      requirement: item,
      requirementSetId: setId,
      createdAt,
    });
    return {
      requirement,
      provenance: [
        provenanceFor({
          requirement,
          observation: origin,
          snapshot,
          section: item.dimension === 'seniority' ? 'title' : 'content',
          proposedExcerpt: item.sourceText,
        }),
      ],
    };
  });

  return {
    set: {
      id: setId,
      snapshotId: snapshot.id as SnapshotId,
      modelVersion,
      inputFingerprint,
      extractorPipelineVersion: pipelineVersion,
      deterministicExtractorVersion,
      status: 'COMPLETE',
      deterministicStatus: 'SUCCEEDED',
      assistedStatus: 'NOT_REQUESTED',
      createdAt,
    },
    requirements: [...eligibility, ...fit],
  };
}
