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

export const CandidateClaimLifecycleStateSchema = Type.Union([
  Type.Literal('CURRENT'),
  Type.Literal('SUPERSEDED'),
  Type.Literal('RETIRED'),
]);

export const CandidateClaimSuccessionTypeSchema = Type.Union([
  Type.Literal('CORRECTION'),
  Type.Literal('DEVELOPMENT'),
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
    lifecycleState: Type.Optional(CandidateClaimLifecycleStateSchema),
    predecessorClaimId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    successionType: Type.Optional(
      Type.Union([CandidateClaimSuccessionTypeSchema, Type.Null()]),
    ),
    successionNote: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    endedAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
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
    historicalClaims: Type.Optional(Type.Array(CandidateClaimSchema)),
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

export const BatchCreateCandidateClaimsInputSchema = Type.Object(
  {
    claims: Type.Array(CreateCandidateClaimInputSchema, {
      minItems: 1,
      maxItems: 100,
    }),
  },
  { additionalProperties: false },
);

export const ReplaceCandidateClaimInputSchema = Type.Object(
  {
    changeType: CandidateClaimSuccessionTypeSchema,
    value: Type.String({ minLength: 1, maxLength: 2000 }),
    scope: Type.Optional(
      Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    ),
    state: Type.Union([Type.Literal('UNKNOWN'), Type.Literal('SUPPORTED')]),
    confidence: Type.Optional(
      Type.Union([CandidateClaimConfidenceSchema, Type.Null()]),
    ),
    evidence: Type.Optional(ManualEvidenceInputSchema),
    note: Type.Optional(Type.String({ maxLength: 1000 })),
  },
  { additionalProperties: false },
);

export const RetireCandidateClaimInputSchema = Type.Object(
  { note: Type.Optional(Type.String({ maxLength: 1000 })) },
  { additionalProperties: false },
);

export const CareerProfileReevaluationSchema = Type.Object(
  {
    id: Type.String(),
    state: Type.Union([
      Type.Literal('PENDING'),
      Type.Literal('RUNNING'),
      Type.Literal('SUCCEEDED'),
      Type.Literal('FAILED'),
    ]),
    taskCount: Type.Integer({ minimum: 0 }),
    completedTaskCount: Type.Integer({ minimum: 0 }),
    failedTaskCount: Type.Integer({ minimum: 0 }),
    requestedAt: Type.String(),
    updatedAt: Type.String(),
  },
  { additionalProperties: false },
);

export const CareerMemoryMutationResponseSchema = Type.Object(
  {
    candidate: CandidateProfileResponseSchema.properties.candidate,
    claims: CandidateProfileResponseSchema.properties.claims,
    historicalClaims:
      CandidateProfileResponseSchema.properties.historicalClaims,
    reevaluationRequested: Type.Boolean(),
    reevaluation: Type.Optional(CareerProfileReevaluationSchema),
  },
  { additionalProperties: false },
);
