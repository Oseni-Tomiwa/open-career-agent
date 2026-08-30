import { Type, type Static } from '@sinclair/typebox';

export const PriorityOpportunityItemSchema = Type.Object(
  {
    opportunityId: Type.String(),
    title: Type.String(),
    organization: Type.Union([Type.String(), Type.Null()]),
    location: Type.Union([Type.String(), Type.Null()]),
    decisionState: Type.String(),
    action: Type.String(),
    explanation: Type.String(),
    observedAt: Type.String(),
    reasonCodes: Type.Array(Type.String()),
    freshnessBucket: Type.Union([Type.String(), Type.Null()]),
    applicationStatus: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const NeedsAttentionItemSchema = Type.Object(
  {
    opportunityId: Type.String(),
    title: Type.String(),
    organization: Type.Union([Type.String(), Type.Null()]),
    category: Type.Union([
      Type.Literal('investigate'),
      Type.Literal('blocked_closed'),
      Type.Literal('blocked_ineligible'),
      Type.Literal('stale_listing'),
      Type.Literal('quality_risk'),
      Type.Literal('unresolved_eligibility'),
    ]),
    titleOrSummary: Type.String(),
    explanation: Type.String(),
    nextAction: Type.String(),
    eligibilityState: Type.Union([Type.String(), Type.Null()]),
    decisionState: Type.Union([Type.String(), Type.Null()]),
    reasonCodes: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const RecentChangeItemSchema = Type.Object(
  {
    opportunityId: Type.String(),
    title: Type.String(),
    organization: Type.Union([Type.String(), Type.Null()]),
    changeType: Type.Union([
      Type.Literal('decision_changed'),
      Type.Literal('eligibility_changed'),
      Type.Literal('quality_changed'),
      Type.Literal('newly_discovered'),
    ]),
    headline: Type.String(),
    detail: Type.String(),
    occurredAt: Type.String(),
  },
  { additionalProperties: false },
);

export const DiscoveryActivityItemSchema = Type.Object(
  {
    runId: Type.String(),
    searchTargetId: Type.String(),
    searchTargetName: Type.String(),
    sourceSystem: Type.String(),
    status: Type.String(),
    startedAt: Type.String(),
    completedAt: Type.Union([Type.String(), Type.Null()]),
    discoveredCount: Type.Number(),
    acceptedCount: Type.Number(),
    rejectedCount: Type.Number(),
    errorSummary: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const CareerMemoryAttentionItemSchema = Type.Object(
  {
    claimKind: Type.String(),
    claimId: Type.Union([Type.String(), Type.Null()]),
    headline: Type.String(),
    explanation: Type.String(),
    affectedOpportunityCount: Type.Number(),
    affectedOpportunityIds: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ApplicationActivityItemSchema = Type.Object(
  {
    applicationId: Type.Union([Type.String(), Type.Null()]),
    opportunityId: Type.String(),
    title: Type.String(),
    organization: Type.Union([Type.String(), Type.Null()]),
    status: Type.String(),
    lastEventAt: Type.Union([Type.String(), Type.Null()]),
    nextAction: Type.String(),
    dueDate: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const TodayDashboardResponseSchema = Type.Object(
  {
    generatedAt: Type.String(),
    greetingName: Type.String(),
    summaryText: Type.String(),
    timeWindowDays: Type.Number(),
    priorityOpportunities: Type.Array(PriorityOpportunityItemSchema),
    needsAttention: Type.Array(NeedsAttentionItemSchema),
    recentChanges: Type.Array(RecentChangeItemSchema),
    discoveryActivity: Type.Array(DiscoveryActivityItemSchema),
    applicationActivity: Type.Array(ApplicationActivityItemSchema),
    careerMemoryAttention: Type.Array(CareerMemoryAttentionItemSchema),
  },
  { additionalProperties: false },
);

export type PriorityOpportunityItem = Static<
  typeof PriorityOpportunityItemSchema
>;
export type NeedsAttentionItem = Static<typeof NeedsAttentionItemSchema>;
export type RecentChangeItem = Static<typeof RecentChangeItemSchema>;
export type DiscoveryActivityItem = Static<typeof DiscoveryActivityItemSchema>;
export type CareerMemoryAttentionItem = Static<
  typeof CareerMemoryAttentionItemSchema
>;
export type ApplicationActivityItem = Static<
  typeof ApplicationActivityItemSchema
>;
export type TodayDashboardResponse = Static<
  typeof TodayDashboardResponseSchema
>;
