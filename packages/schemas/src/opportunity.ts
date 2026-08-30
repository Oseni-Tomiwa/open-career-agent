import { Type } from '@sinclair/typebox';

export const FitLevelSchema = Type.Union([
  Type.Literal('strong'),
  Type.Literal('moderate'),
  Type.Literal('weak'),
]);

export const FitFindingStateSchema = Type.Union([
  Type.Literal('STRONG_MATCH'),
  Type.Literal('MATCH'),
  Type.Literal('PARTIAL'),
  Type.Literal('TRANSFERABLE'),
  Type.Literal('GAP'),
  Type.Literal('NO_EVIDENCE'),
  Type.Literal('UNKNOWN'),
]);

export const FitFindingEvidenceSchema = Type.Object({
  id: Type.String(),
  evidenceType: Type.String(),
  sourceReference: Type.String(),
  excerpt: Type.String(),
  state: Type.String(),
});

export const FitFindingSchema = Type.Object({
  id: Type.String(),
  dimension: Type.String(),
  label: Type.String(),
  state: FitFindingStateSchema,
  modality: Type.Union([
    Type.Literal('required'),
    Type.Literal('preferred'),
    Type.Literal('optional'),
  ]),
  requirement: Type.String(),
  explanation: Type.String(),
  confidence: Type.Union([
    Type.Literal('high'),
    Type.Literal('medium'),
    Type.Literal('low'),
  ]),
  evidence: Type.Array(FitFindingEvidenceSchema),
});

export const FitEvaluationSchema = Type.Object({
  level: FitLevelSchema,
  summary: Type.String(),
  engineVersion: Type.String(),
  findings: Type.Array(FitFindingSchema),
});

export const QualityLevelSchema = Type.Union([
  Type.Literal('strong'),
  Type.Literal('moderate'),
  Type.Literal('weak'),
  Type.Literal('risk'),
]);

export const QualityFindingStateSchema = Type.Union([
  Type.Literal('STRONG'),
  Type.Literal('ADEQUATE'),
  Type.Literal('WEAK'),
  Type.Literal('RISK'),
  Type.Literal('UNKNOWN'),
]);

export const QualityFindingEvidenceSchema = Type.Object({
  id: Type.String(),
  evidenceType: Type.String(),
  sourceReference: Type.String(),
  excerpt: Type.String(),
  state: Type.String(),
});

export const QualityFindingSchema = Type.Object({
  id: Type.String(),
  dimension: Type.String(),
  label: Type.String(),
  state: QualityFindingStateSchema,
  importance: Type.Union([
    Type.Literal('critical'),
    Type.Literal('important'),
    Type.Literal('transparency'),
  ]),
  explanation: Type.String(),
  evidence: Type.Array(QualityFindingEvidenceSchema),
});

export const QualityEvaluationSchema = Type.Object({
  level: QualityLevelSchema,
  summary: Type.String(),
  engineVersion: Type.String(),
  freshnessBucket: Type.Union([
    Type.Literal('recent'),
    Type.Literal('aging'),
    Type.Literal('stale'),
    Type.Literal('very_stale'),
  ]),
  evaluatedAt: Type.Optional(Type.String()),
  findings: Type.Array(QualityFindingSchema),
});

export const EligibilityEvaluationSchema = Type.Object({
  state: Type.Union([
    Type.Literal('eligible'),
    Type.Literal('ineligible'),
    Type.Literal('investigate'),
    Type.Literal('unknown'),
  ]),
  engineVersion: Type.String(),
  findings: Type.Array(
    Type.Object({
      id: Type.String(),
      dimension: Type.String(),
      state: Type.String(),
      summary: Type.String(),
      confidence: Type.Optional(Type.String()),
      evidence: Type.Array(QualityFindingEvidenceSchema),
    }),
  ),
});

export const DecisionStateSchema = Type.Union([
  Type.Literal('high-priority'),
  Type.Literal('consider'),
  Type.Literal('investigate'),
  Type.Literal('low-priority'),
  Type.Literal('blocked'),
]);

export const DecisionActionSchema = Type.Union([
  Type.Literal('apply'),
  Type.Literal('review'),
  Type.Literal('investigate'),
  Type.Literal('do_not_apply'),
]);

export const DecisionReasonCodeSchema = Type.Union([
  Type.Literal('ELIGIBILITY_BLOCKER'),
  Type.Literal('LISTING_CLOSED'),
  Type.Literal('LISTING_STALE'),
  Type.Literal('ELIGIBILITY_UNRESOLVED'),
  Type.Literal('STRONG_REQUIRED_FIT'),
  Type.Literal('MODERATE_FIT'),
  Type.Literal('MATERIAL_FIT_GAPS'),
  Type.Literal('QUALITY_RISK'),
  Type.Literal('QUALITY_UNCERTAINTY'),
  Type.Literal('ACTIONABLE_LISTING'),
]);

export const DecisionReasonSchema = Type.Object({
  code: DecisionReasonCodeSchema,
  findingIds: Type.Array(Type.String()),
});

export const DecisionDetailSchema = Type.Object({
  id: Type.String(),
  state: DecisionStateSchema,
  action: DecisionActionSchema,
  explanation: Type.String(),
  engineVersion: Type.String(),
  inputFingerprint: Type.String(),
  reasonCodes: Type.Array(DecisionReasonCodeSchema),
  reasons: Type.Array(DecisionReasonSchema),
  evaluatedAt: Type.String(),
});

export const OpportunitySchema = Type.Object(
  {
    id: Type.String(),
    createdAt: Type.String(),
  },
  { $id: 'Opportunity' },
);

export const OpportunitySummarySchema = Type.Object(
  {
    id: Type.String(),
    latestTitle: Type.Optional(Type.String()),
    latestOrganization: Type.Optional(Type.String()),
    latestLocation: Type.Optional(Type.String()),
    latestWorkModel: Type.Optional(Type.String()),
    latestCompensation: Type.Optional(Type.String()),
    latestObservedAt: Type.Optional(Type.String()),
    sourceSystems: Type.Array(Type.String()),
    latestSnapshotId: Type.Optional(Type.String()),
    eligibilityState: Type.Optional(
      Type.Union([
        Type.Literal('eligible'),
        Type.Literal('ineligible'),
        Type.Literal('investigate'),
        Type.Literal('unknown'),
      ]),
    ),
    fitLevel: Type.Optional(FitLevelSchema),
    qualityLevel: Type.Optional(QualityLevelSchema),
    decisionState: Type.Optional(DecisionStateSchema),
  },
  { $id: 'OpportunitySummary' },
);

export const OpportunitySnapshotSchema = Type.Object(
  {
    id: Type.String(),
    opportunityId: Type.String(),
    title: Type.String(),
    organization: Type.String(),
    location: Type.Optional(Type.String()),
    workModel: Type.Optional(Type.String()),
    employmentType: Type.Optional(Type.String()),
    compensation: Type.Optional(Type.String()),
    content: Type.String(),
    observedAt: Type.String(),
    fit: Type.Optional(FitEvaluationSchema),
    eligibility: Type.Optional(EligibilityEvaluationSchema),
    quality: Type.Optional(QualityEvaluationSchema),
    decision: Type.Optional(DecisionDetailSchema),
  },
  { $id: 'OpportunitySnapshot' },
);

export const OpportunityListResponseSchema = Type.Object({
  data: Type.Array(OpportunitySummarySchema),
});

export const OpportunityDetailResponseSchema = Type.Object({
  opportunity: OpportunitySchema,
  snapshots: Type.Array(OpportunitySnapshotSchema),
});
