import { Type } from '@sinclair/typebox';

export const OpportunitySchema = Type.Object(
  {
    id: Type.String(),
    createdAt: Type.String(),
  },
  { $id: 'Opportunity' }
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
  },
  { $id: 'OpportunitySummary' }
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
  },
  { $id: 'OpportunitySnapshot' }
);

export const OpportunityListResponseSchema = Type.Object({
  data: Type.Array(OpportunitySummarySchema),
});

export const OpportunityDetailResponseSchema = Type.Object({
  opportunity: OpportunitySchema,
  snapshots: Type.Array(OpportunitySnapshotSchema),
});
