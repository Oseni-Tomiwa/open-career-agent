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
  normalizedFragmentId: Type.Optional(NonEmptyString),
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
    candidates: Type.Optional(
      Type.Array(
        Type.Object(
          {
            id: NonEmptyString,
            requirementSetId: NonEmptyString,
            snapshotId: NonEmptyString,
            category: RequirementCategorySchema,
            normalizedKey: NonEmptyString,
            value: RequirementValueSchema,
            statement: NonEmptyString,
            strength: Type.Union([
              Type.Literal('REQUIRED'),
              Type.Literal('PREFERRED'),
              Type.Literal('CONTEXTUAL'),
            ]),
            polarity: Type.Union([
              Type.Literal('REQUIRES'),
              Type.Literal('PERMITS'),
              Type.Literal('EXCLUDES'),
              Type.Literal('UNAVAILABLE'),
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
            actionabilityCeiling: Type.Union([
              Type.Literal('FIT_SIGNAL_SAFE'),
              Type.Literal('REVIEW_ONLY'),
            ]),
            modelConfidence: Type.Union([
              Type.Literal('HIGH'),
              Type.Literal('MODERATE'),
              Type.Literal('LOW'),
            ]),
            rationale: Type.String({ minLength: 1, maxLength: 500 }),
            proposerId: NonEmptyString,
            modelCapabilityVersion: NonEmptyString,
            instructionVersion: NonEmptyString,
            proposalSchemaVersion: NonEmptyString,
            groundingValidatorVersion: NonEmptyString,
            validationStatus: Type.Union([
              Type.Literal('ACCEPTED_FOR_REVIEW'),
              Type.Literal('DUPLICATE'),
              Type.Literal('REJECTED'),
            ]),
            groundingStatus: Type.Union([
              Type.Literal('GROUNDED'),
              Type.Literal('REJECTED'),
            ]),
            rejectionReasons: Type.Array(NonEmptyString, { maxItems: 16 }),
            proposalHash: NonEmptyString,
            createdAt: NonEmptyString,
            sources: Type.Array(
              Type.Object(
                {
                  id: NonEmptyString,
                  requirementCandidateId: NonEmptyString,
                  sourceObservationId: NonEmptyString,
                  snapshotId: NonEmptyString,
                  normalizedFragmentId: NonEmptyString,
                  sourceFieldPath: Type.Optional(NonEmptyString),
                  excerpt: Type.String({ minLength: 1, maxLength: 1200 }),
                  excerptHash: NonEmptyString,
                },
                { additionalProperties: false },
              ),
              { maxItems: 8 },
            ),
          },
          { additionalProperties: false },
        ),
        { maxItems: 32 },
      ),
    ),
    assistanceRun: Type.Optional(
      Type.Object(
        {
          id: NonEmptyString,
          requirementSetId: NonEmptyString,
          requestFingerprint: NonEmptyString,
          assistedPipelineVersion: NonEmptyString,
          selectionVersion: NonEmptyString,
          proposalSchemaVersion: NonEmptyString,
          instructionVersion: NonEmptyString,
          groundingValidatorVersion: NonEmptyString,
          providerId: NonEmptyString,
          providerCapabilityVersion: NonEmptyString,
          status: Type.Union([
            Type.Literal('SUCCEEDED'),
            Type.Literal('UNAVAILABLE'),
            Type.Literal('REJECTED'),
            Type.Literal('FAILED'),
          ]),
          attempted: Type.Boolean(),
          selectedFragmentCount: Type.Integer({ minimum: 0, maximum: 12 }),
          selectedCharacterCount: Type.Integer({ minimum: 0, maximum: 8000 }),
          proposalCount: Type.Integer({ minimum: 0, maximum: 32 }),
          groundedCount: Type.Integer({ minimum: 0, maximum: 32 }),
          rejectedCount: Type.Integer({ minimum: 0, maximum: 32 }),
          duplicateCount: Type.Integer({ minimum: 0, maximum: 32 }),
          consequentialCount: Type.Integer({ minimum: 0, maximum: 32 }),
          unsafePromotionAttempts: Type.Integer({ minimum: 0, maximum: 32 }),
          rejectionReasonCounts: Type.Record(
            NonEmptyString,
            Type.Integer({ minimum: 0 }),
          ),
          safeReason: Type.Optional(
            Type.String({ minLength: 1, maxLength: 200 }),
          ),
          createdAt: NonEmptyString,
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const RequirementProposalSchema = Type.Object(
  {
    category: RequirementCategorySchema,
    value: RequirementValueSchema,
    statement: Type.String({ minLength: 1, maxLength: 1200 }),
    strength: Type.Union([
      Type.Literal('REQUIRED'),
      Type.Literal('PREFERRED'),
      Type.Literal('CONTEXTUAL'),
    ]),
    polarity: Type.Union([
      Type.Literal('REQUIRES'),
      Type.Literal('PERMITS'),
      Type.Literal('EXCLUDES'),
      Type.Literal('UNAVAILABLE'),
    ]),
    evaluationUse: Type.Union([
      Type.Literal('ELIGIBILITY'),
      Type.Literal('FIT'),
      Type.Literal('CONTEXT_ONLY'),
    ]),
    assertionBasis: Type.Union([
      Type.Literal('EXPLICIT_STRUCTURED'),
      Type.Literal('EXPLICIT_TEXT'),
      Type.Literal('INTERPRETED'),
    ]),
    actionabilityCeiling: Type.Union([
      Type.Literal('FIT_SIGNAL_SAFE'),
      Type.Literal('REVIEW_ONLY'),
    ]),
    confidence: Type.Union([
      Type.Literal('HIGH'),
      Type.Literal('MODERATE'),
      Type.Literal('LOW'),
    ]),
    fragmentIds: Type.Array(NonEmptyString, { minItems: 1, maxItems: 8 }),
    excerpts: Type.Array(
      Type.Object(
        {
          fragmentId: NonEmptyString,
          excerpt: Type.String({ minLength: 1, maxLength: 1200 }),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 8 },
    ),
    rationale: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);

export const RequirementProposalResponseSchema = Type.Object(
  {
    schemaVersion: Type.Literal('requirement-proposal-schema-v1'),
    proposals: Type.Array(RequirementProposalSchema, { maxItems: 32 }),
  },
  { additionalProperties: false },
);

export type RequirementProposalContract = Static<
  typeof RequirementProposalSchema
>;
export type RequirementProposalResponseContract = Static<
  typeof RequirementProposalResponseSchema
>;

export function isRequirementProposalResponse(
  value: unknown,
): value is RequirementProposalResponseContract {
  return Value.Check(RequirementProposalResponseSchema, value);
}

export type RequirementSetArtifactContract = Static<
  typeof RequirementSetArtifactSchema
>;

export function isRequirementSetArtifact(
  value: unknown,
): value is RequirementSetArtifactContract {
  return Value.Check(RequirementSetArtifactSchema, value);
}
