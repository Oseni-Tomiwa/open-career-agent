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
    fitLevel: Type.Optional(FitLevelSchema),
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
