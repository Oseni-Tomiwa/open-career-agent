import { Type, type Static } from '@sinclair/typebox';

export const APPLICATION_STATUSES_LIST = [
  'Saved',
  'Preparing',
  'Applied',
  'Assessment',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Closed',
] as const;

export const ApplicationStatusSchema = Type.Union([
  Type.Literal('Saved'),
  Type.Literal('Preparing'),
  Type.Literal('Applied'),
  Type.Literal('Assessment'),
  Type.Literal('Interview'),
  Type.Literal('Offer'),
  Type.Literal('Rejected'),
  Type.Literal('Withdrawn'),
  Type.Literal('Closed'),
]);

export const ApplicationEventSchema = Type.Object(
  {
    id: Type.String(),
    applicationId: Type.String(),
    eventType: Type.String(),
    detail: Type.String(),
    occurredAt: Type.String(),
    actor: Type.Union([
      Type.Literal('Candidate'),
      Type.Literal('Employer'),
      Type.Literal('System'),
    ]),
  },
  { additionalProperties: false },
);

export const ApplicationItemSchema = Type.Object(
  {
    id: Type.String(),
    opportunityId: Type.String(),
    title: Type.String(),
    organization: Type.Union([Type.String(), Type.Null()]),
    location: Type.Union([Type.String(), Type.Null()]),
    status: ApplicationStatusSchema,
    currentDecision: Type.Union([Type.String(), Type.Null()]),
    submittedAt: Type.Union([Type.String(), Type.Null()]),
    followUpDueAt: Type.Union([Type.String(), Type.Null()]),
    lastEventAt: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String(),
    updatedAt: Type.String(),
  },
  { additionalProperties: false },
);

export const ApplicationOpportunitySummarySchema = Type.Object(
  {
    id: Type.String(),
    title: Type.String(),
    organization: Type.Union([Type.String(), Type.Null()]),
    location: Type.Union([Type.String(), Type.Null()]),
    sourceUrl: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const ApplicationCurrentDecisionSchema = Type.Object(
  {
    state: Type.String(),
    action: Type.Union([Type.String(), Type.Null()]),
    explanation: Type.String(),
  },
  { additionalProperties: false },
);

export const ApplicationDetailResponseSchema = Type.Object(
  {
    id: Type.String(),
    candidateId: Type.String(),
    opportunityId: Type.String(),
    status: ApplicationStatusSchema,
    originatingDecisionId: Type.Union([Type.String(), Type.Null()]),
    originatingDecisionState: Type.Union([Type.String(), Type.Null()]),
    originatingDecisionAction: Type.Union([Type.String(), Type.Null()]),
    submittedAt: Type.Union([Type.String(), Type.Null()]),
    followUpDueAt: Type.Union([Type.String(), Type.Null()]),
    followUpNote: Type.Union([Type.String(), Type.Null()]),
    followUpCompletedAt: Type.Union([Type.String(), Type.Null()]),
    note: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String(),
    updatedAt: Type.String(),
    opportunity: Type.Union([ApplicationOpportunitySummarySchema, Type.Null()]),
    currentDecision: Type.Union([
      ApplicationCurrentDecisionSchema,
      Type.Null(),
    ]),
    events: Type.Array(ApplicationEventSchema),
  },
  { additionalProperties: false },
);

export const CreateApplicationInputSchema = Type.Object(
  {
    opportunityId: Type.String(),
    status: Type.Optional(ApplicationStatusSchema),
    originatingDecisionId: Type.Optional(Type.String()),
    note: Type.Optional(Type.String()),
    appliedAt: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const UpdateApplicationInputSchema = Type.Object(
  {
    status: Type.Optional(ApplicationStatusSchema),
    expectedUpdatedAt: Type.String(),
    note: Type.Optional(Type.String()),
    followUpDueAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    followUpNote: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    followUpCompletedAt: Type.Optional(
      Type.Union([Type.String(), Type.Null()]),
    ),
  },
  { additionalProperties: false },
);

export const AddApplicationEventInputSchema = Type.Object(
  {
    eventType: Type.Union([
      Type.Literal('candidate_activity'),
      Type.Literal('employer_update'),
    ]),
    detail: Type.String(),
  },
  { additionalProperties: false },
);

export const ApplicationListResponseSchema = Type.Object(
  {
    data: Type.Array(ApplicationItemSchema),
  },
  { additionalProperties: false },
);

export type ApplicationStatus = Static<typeof ApplicationStatusSchema>;
export type ApplicationEvent = Static<typeof ApplicationEventSchema>;
export type ApplicationItem = Static<typeof ApplicationItemSchema>;
export type ApplicationDetailResponse = Static<
  typeof ApplicationDetailResponseSchema
>;
export type CreateApplicationInput = Static<
  typeof CreateApplicationInputSchema
>;
export type UpdateApplicationInput = Static<
  typeof UpdateApplicationInputSchema
>;
export type AddApplicationEventInput = Static<
  typeof AddApplicationEventInputSchema
>;
export type ApplicationListResponse = Static<
  typeof ApplicationListResponseSchema
>;
