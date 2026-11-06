import { Type } from '@sinclair/typebox';

const text = (maxLength: number) =>
  Type.String({ minLength: 1, maxLength, pattern: '\\S' });
const optionalText = (maxLength: number) =>
  Type.Optional(Type.Union([text(maxLength), Type.Null()]));
const date = Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' });
const fields = {
  category: Type.Union([
    Type.Literal('JOB'),
    Type.Literal('INTERNSHIP'),
    Type.Literal('FREELANCE_CONTRACT'),
    Type.Literal('FELLOWSHIP'),
    Type.Literal('GRANT'),
    Type.Literal('COMPETITION'),
    Type.Literal('HACKATHON'),
  ]),
  title: text(200),
  organization: text(200),
};
export const ManualOpportunityRequestSchema = Type.Object(
  {
    ...fields,
    sourceUrl: optionalText(2048),
    sourceContext: optionalText(1000),
    deadline: Type.Optional(Type.Union([date, Type.Null()])),
    acknowledgement: Type.Optional(Type.String({ pattern: '^[0-9a-f]{64}$' })),
  },
  { additionalProperties: false },
);

export const ManualOpportunityRecordSchema = Type.Object(
  {
    ...fields,
    id: Type.String(),
    sourceUrl: Type.Union([Type.String(), Type.Null()]),
    sourceContext: Type.Union([Type.String(), Type.Null()]),
    deadline: Type.Union([date, Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
    createdAt: Type.String(),
    updatedAt: Type.String(),
    provenance: Type.Object({
      kind: Type.Literal('MANUAL'),
      verification: Type.Literal('UNVERIFIED'),
    }),
    evaluationState: Type.Literal('NOT_EVALUATED'),
  },
  { additionalProperties: false },
);

export const ManualOpportunityDetailSchema = Type.Composite([
  ManualOpportunityRecordSchema,
  Type.Object({
    revisions: Type.Array(
      Type.Object({ version: Type.Integer(), observedAt: Type.String() }),
    ),
  }),
]);
export const ManualOpportunityListSchema = Type.Object({
  items: Type.Array(ManualOpportunityRecordSchema),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});
export const ManualOpportunityDuplicateSchema = Type.Object({
  matches: Type.Array(
    Type.Object({
      id: Type.String(),
      title: Type.String(),
      organization: Type.String(),
      kind: Type.Union([Type.Literal('MANUAL'), Type.Literal('ATS')]),
    }),
  ),
  acknowledgement: Type.Union([Type.String(), Type.Null()]),
});
