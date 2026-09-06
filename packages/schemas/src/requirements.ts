import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const NonEmptyString = Type.String({ minLength: 1 });

export const RequirementCategorySchema = Type.Union([
  Type.Literal('TECHNICAL_SKILL'),
  Type.Literal('EXPERIENCE'),
  Type.Literal('SENIORITY'),
  Type.Literal('EDUCATION'),
  Type.Literal('LOCATION'),
  Type.Literal('RESIDENCY'),
  Type.Literal('TIMEZONE'),
  Type.Literal('WORK_MODEL'),
  Type.Literal('WORK_AUTHORIZATION'),
  Type.Literal('SPONSORSHIP'),
  Type.Literal('LANGUAGE'),
  Type.Literal('EMPLOYMENT_TYPE'),
  Type.Literal('COMPENSATION'),
  Type.Literal('DOMAIN_EXPERIENCE'),
  Type.Literal('CERTIFICATION'),
  Type.Literal('EXCLUSION'),
  Type.Literal('OTHER'),
]);

export const RequirementValueSchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal('TERM'),
      value: NonEmptyString,
      alternatives: Type.Optional(Type.Array(NonEmptyString, { minItems: 1 })),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('DURATION'),
      minimumYears: Type.Number({ minimum: 0 }),
      focus: Type.Optional(NonEmptyString),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal('SCOPE'), value: NonEmptyString },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal('TEXT'), value: NonEmptyString },
    { additionalProperties: false },
  ),
]);

const RequirementBase = {
  id: NonEmptyString,
  requirementSetId: NonEmptyString,
  category: RequirementCategorySchema,
  normalizedKey: NonEmptyString,
  value: RequirementValueSchema,
  statement: NonEmptyString,
  polarity: Type.Union([
    Type.Literal('REQUIRES'),
    Type.Literal('PERMITS'),
    Type.Literal('EXCLUDES'),
    Type.Literal('UNAVAILABLE'),
  ]),
  extractorId: NonEmptyString,
  extractorVersion: NonEmptyString,
  canonicalHash: NonEmptyString,
  createdAt: NonEmptyString,
};

const HardConstraintRequirementSchema = Type.Object(
  {
    ...RequirementBase,
    strength: Type.Literal('REQUIRED'),
    assertionBasis: Type.Union([
      Type.Literal('EXPLICIT_STRUCTURED'),
      Type.Literal('EXPLICIT_TEXT'),
    ]),
    evaluationUse: Type.Literal('ELIGIBILITY'),
    actionability: Type.Literal('HARD_CONSTRAINT_SAFE'),
    extractionConfidence: Type.Literal('HIGH'),
  },
  { additionalProperties: false },
);

const NonHardRequirementSchema = Type.Object(
  {
    ...RequirementBase,
    strength: Type.Union([
      Type.Literal('REQUIRED'),
      Type.Literal('PREFERRED'),
      Type.Literal('CONTEXTUAL'),
    ]),
    assertionBasis: Type.Union([
      Type.Literal('EXPLICIT_STRUCTURED'),
      Type.Literal('EXPLICIT_TEXT'),
      Type.Literal('INTERPRETED'),
    ]),
    evaluationUse: Type.Union([
      Type.Literal('ELIGIBILITY'),
      Type.Literal('FIT'),
      Type.Literal('CONTEXT_ONLY'),
    ]),
    actionability: Type.Union([
      Type.Literal('FIT_SIGNAL_SAFE'),
      Type.Literal('REVIEW_ONLY'),
    ]),
    extractionConfidence: Type.Union([
      Type.Literal('HIGH'),
      Type.Literal('MODERATE'),
      Type.Literal('LOW'),
    ]),
  },
  { additionalProperties: false },
);

export const CanonicalRequirementSchema = Type.Union([
  HardConstraintRequirementSchema,
  NonHardRequirementSchema,
]);

const RequirementProvenanceBase = {
  id: NonEmptyString,
  requirementId: NonEmptyString,
  sourceObservationId: NonEmptyString,
  snapshotId: NonEmptyString,
  sourceFieldPath: Type.Optional(NonEmptyString),
  normalizedSection: Type.Optional(NonEmptyString),
  excerpt: NonEmptyString,
  excerptHash: NonEmptyString,
  locatorVersion: NonEmptyString,
  extractorId: NonEmptyString,
  extractorVersion: NonEmptyString,
};

export const RequirementProvenanceSchema = Type.Union([
  Type.Object(RequirementProvenanceBase, { additionalProperties: false }),
  Type.Object(
    {
      ...RequirementProvenanceBase,
      startOffset: Type.Integer({ minimum: 0 }),
      endOffset: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
]);

export const RequirementSetSchema = Type.Object(
  {
    id: NonEmptyString,
    snapshotId: NonEmptyString,
    modelVersion: NonEmptyString,
    inputFingerprint: NonEmptyString,
    extractorPipelineVersion: NonEmptyString,
    deterministicExtractorVersion: NonEmptyString,
    status: Type.Union([
      Type.Literal('COMPLETE'),
      Type.Literal('PARTIAL'),
      Type.Literal('FAILED'),
    ]),
    deterministicStatus: Type.Union([
      Type.Literal('SUCCEEDED'),
      Type.Literal('FAILED'),
    ]),
    assistedStatus: Type.Union([
      Type.Literal('NOT_REQUESTED'),
      Type.Literal('SUCCEEDED'),
      Type.Literal('UNAVAILABLE'),
      Type.Literal('REJECTED'),
      Type.Literal('FAILED'),
    ]),
    createdAt: NonEmptyString,
  },
  { additionalProperties: false },
);

export const RequirementSetArtifactSchema = Type.Object(
  {
    set: RequirementSetSchema,
    requirements: Type.Array(
      Type.Object(
        {
          requirement: CanonicalRequirementSchema,
          provenance: Type.Array(RequirementProvenanceSchema, { minItems: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export type RequirementSetArtifactContract = Static<
  typeof RequirementSetArtifactSchema
>;

export function isRequirementSetArtifact(
  value: unknown,
): value is RequirementSetArtifactContract {
  return Value.Check(RequirementSetArtifactSchema, value);
}
