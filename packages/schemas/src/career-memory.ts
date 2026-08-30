import { Type } from '@sinclair/typebox';

export const CandidateClaimStateSchema = Type.Union([
  Type.Literal('SUPPORTED'),
  Type.Literal('INFERRED'),
  Type.Literal('UNKNOWN'),
  Type.Literal('CONFLICTING'),
  Type.Literal('UNSUPPORTED'),
]);

export const CandidateClaimConfidenceSchema = Type.Union([
  Type.Literal('HIGH'),
  Type.Literal('MODERATE'),
  Type.Literal('LOW'),
]);

export const CareerMemoryEvidenceStateSchema = Type.Union([
  Type.Literal('source-verified'),
  Type.Literal('candidate-confirmed'),
  Type.Literal('unreviewed'),
  Type.Literal('disputed'),
]);

export const ManualEvidenceStateSchema = Type.Union([
  Type.Literal('candidate-confirmed'),
  Type.Literal('unreviewed'),
  Type.Literal('disputed'),
]);

export const CareerMemoryEvidenceSchema = Type.Object(
  {
    id: Type.String(),
    evidenceType: Type.String(),
    sourceReference: Type.String(),
    excerpt: Type.String(),
    state: CareerMemoryEvidenceStateSchema,
    createdAt: Type.String(),
  },
  { additionalProperties: false },
);

export const CandidateClaimSchema = Type.Object(
  {
    id: Type.String(),
    kind: Type.String(),
    value: Type.String(),
    scope: Type.Union([Type.String(), Type.Null()]),
    state: CandidateClaimStateSchema,
    confidence: Type.Union([CandidateClaimConfidenceSchema, Type.Null()]),
    createdAt: Type.String(),
    updatedAt: Type.String(),
    evidence: Type.Array(CareerMemoryEvidenceSchema),
  },
  { additionalProperties: false },
);

export const CandidateProfileResponseSchema = Type.Object(
  {
    candidate: Type.Object(
      {
        id: Type.String(),
        createdAt: Type.String(),
        updatedAt: Type.String(),
      },
      { additionalProperties: false },
    ),
    claims: Type.Array(CandidateClaimSchema),
  },
  { additionalProperties: false },
);

export const ManualEvidenceInputSchema = Type.Object(
  {
    evidenceType: Type.String({ minLength: 1, maxLength: 120 }),
    sourceReference: Type.Optional(
      Type.String({ minLength: 1, maxLength: 500 }),
    ),
    excerpt: Type.String({ minLength: 1, maxLength: 4000 }),
    state: ManualEvidenceStateSchema,
  },
  { additionalProperties: false },
);

export const CreateCandidateClaimInputSchema = Type.Object(
  {
    kind: Type.String({ minLength: 1, maxLength: 120 }),
    value: Type.String({ minLength: 1, maxLength: 2000 }),
    scope: Type.Optional(Type.String({ maxLength: 500 })),
    state: Type.Union([Type.Literal('UNKNOWN'), Type.Literal('SUPPORTED')]),
    confidence: Type.Optional(CandidateClaimConfidenceSchema),
    evidence: Type.Optional(ManualEvidenceInputSchema),
  },
  { additionalProperties: false },
);

export const UpdateCandidateClaimInputSchema = Type.Object(
  {
    value: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    scope: Type.Optional(
      Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    ),
    state: Type.Optional(CandidateClaimStateSchema),
    confidence: Type.Optional(
      Type.Union([CandidateClaimConfidenceSchema, Type.Null()]),
    ),
  },
  { additionalProperties: false },
);

export const AttachClaimEvidenceInputSchema = Type.Object(
  {
    evidence: ManualEvidenceInputSchema,
    transitionTo: Type.Optional(CandidateClaimStateSchema),
  },
  { additionalProperties: false },
);

export const CareerMemoryMutationResponseSchema = Type.Object(
  {
    candidate: CandidateProfileResponseSchema.properties.candidate,
    claims: CandidateProfileResponseSchema.properties.claims,
    reevaluationRequested: Type.Boolean(),
  },
  { additionalProperties: false },
);
