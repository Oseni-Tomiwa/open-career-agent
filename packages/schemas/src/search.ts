import { Type, type Static } from '@sinclair/typebox';

export const SearchWorkModelSchema = Type.Union([
  Type.Literal('remote'),
  Type.Literal('hybrid'),
  Type.Literal('onsite'),
]);

export const SearchSeniorityLevelSchema = Type.Union([
  Type.Literal('internship'),
  Type.Literal('entry'),
  Type.Literal('junior'),
  Type.Literal('mid'),
  Type.Literal('senior'),
]);

export const SearchEmploymentTypeSchema = Type.Union([
  Type.Literal('full-time'),
  Type.Literal('contract'),
  Type.Literal('internship'),
]);

export const SearchSourceConfigSchema = Type.Object(
  {
    sourceSystem: Type.String(),
    boardId: Type.String(),
  },
  { additionalProperties: false },
);

export const SearchTargetSchema = Type.Object(
  {
    id: Type.String(),
    candidateId: Type.String(),
    name: Type.String(),
    enabled: Type.Boolean(),
    targetRoles: Type.Array(Type.String()),
    skills: Type.Array(Type.String()),
    locations: Type.Array(Type.String()),
    locationIsHardFilter: Type.Boolean(),
    workModels: Type.Array(SearchWorkModelSchema),
    workModelIsHardFilter: Type.Boolean(),
    seniorityLevels: Type.Array(SearchSeniorityLevelSchema),
    seniorityIsHardFilter: Type.Boolean(),
    employmentTypes: Type.Array(SearchEmploymentTypeSchema),
    employmentTypeIsHardFilter: Type.Boolean(),
    requiresSponsorship: Type.Union([Type.Boolean(), Type.Null()]),
    willingToRelocate: Type.Union([Type.Boolean(), Type.Null()]),
    minSalary: Type.Union([Type.Number(), Type.Null()]),
    currency: Type.Union([Type.String(), Type.Null()]),
    freshnessDays: Type.Union([Type.Number(), Type.Null()]),
    requiredTerms: Type.Array(Type.String()),
    excludedTerms: Type.Array(Type.String()),
    sources: Type.Array(SearchSourceConfigSchema),
    createdAt: Type.String(),
    updatedAt: Type.String(),
    archivedAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: false },
);

export const CreateSearchTargetInputSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 100 }),
    enabled: Type.Optional(Type.Boolean()),
    targetRoles: Type.Optional(Type.Array(Type.String())),
    skills: Type.Optional(Type.Array(Type.String())),
    locations: Type.Optional(Type.Array(Type.String())),
    locationIsHardFilter: Type.Optional(Type.Boolean()),
    workModels: Type.Optional(Type.Array(SearchWorkModelSchema)),
    workModelIsHardFilter: Type.Optional(Type.Boolean()),
    seniorityLevels: Type.Optional(Type.Array(SearchSeniorityLevelSchema)),
    seniorityIsHardFilter: Type.Optional(Type.Boolean()),
    employmentTypes: Type.Optional(Type.Array(SearchEmploymentTypeSchema)),
    employmentTypeIsHardFilter: Type.Optional(Type.Boolean()),
    requiresSponsorship: Type.Optional(
      Type.Union([Type.Boolean(), Type.Null()]),
    ),
    willingToRelocate: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
    minSalary: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    currency: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    freshnessDays: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    requiredTerms: Type.Optional(Type.Array(Type.String())),
    excludedTerms: Type.Optional(Type.Array(Type.String())),
    sources: Type.Optional(Type.Array(SearchSourceConfigSchema)),
  },
  { additionalProperties: false },
);

export const UpdateSearchTargetInputSchema = Type.Partial(
  CreateSearchTargetInputSchema,
  { additionalProperties: false },
);

export const DiscoveryRunSchema = Type.Object(
  {
    id: Type.String(),
    candidateId: Type.String(),
    searchTargetId: Type.String(),
    sourceSystem: Type.String(),
    startedAt: Type.String(),
    completedAt: Type.Union([Type.String(), Type.Null()]),
    status: Type.Union([
      Type.Literal('PENDING'),
      Type.Literal('RUNNING'),
      Type.Literal('COMPLETED'),
      Type.Literal('FAILED'),
    ]),
    discoveredCount: Type.Number(),
    acceptedCount: Type.Number(),
    rejectedCount: Type.Number(),
    rejectedByReason: Type.Union([
      Type.Record(Type.String(), Type.Number()),
      Type.Null(),
    ]),
    errorSummary: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const DiscoveryMatchSchema = Type.Object(
  {
    id: Type.String(),
    candidateId: Type.String(),
    searchTargetId: Type.String(),
    discoveryRunId: Type.String(),
    opportunityId: Type.String(),
    sourceListingId: Type.String(),
    matchedAt: Type.String(),
    matchReasons: Type.Array(Type.String()),
    retainedUnresolved: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const SearchTargetListResponseSchema = Type.Object(
  {
    data: Type.Array(SearchTargetSchema),
  },
  { additionalProperties: false },
);

export const DiscoveryRunListResponseSchema = Type.Object(
  {
    data: Type.Array(DiscoveryRunSchema),
  },
  { additionalProperties: false },
);

export const TriggerDiscoveryRunResponseSchema = Type.Object(
  {
    run: DiscoveryRunSchema,
    taskEnqueued: Type.Boolean(),
  },
  { additionalProperties: false },
);

export type SearchTargetResponse = Static<typeof SearchTargetSchema>;
export type CreateSearchTargetInput = Static<
  typeof CreateSearchTargetInputSchema
>;
export type UpdateSearchTargetInput = Static<
  typeof UpdateSearchTargetInputSchema
>;
export type DiscoveryRunResponse = Static<typeof DiscoveryRunSchema>;
export type DiscoveryMatchResponse = Static<typeof DiscoveryMatchSchema>;
