import { Type, type Static } from '@sinclair/typebox';

export const CareerSignalTypeSchema = Type.Union([
  Type.Literal('repeated-gap'),
  Type.Literal('strong-alignment'),
  Type.Literal('transferable'),
  Type.Literal('eligibility-uncertainty'),
  Type.Literal('eligibility-blocker'),
  Type.Literal('evidence-gap'),
  Type.Literal('market-demand'),
]);

export type CareerSignalType = Static<typeof CareerSignalTypeSchema>;

export const SampleOpportunityItemSchema = Type.Object(
  {
    opportunityId: Type.String(),
    title: Type.String(),
    organization: Type.String(),
  },
  { additionalProperties: false },
);

export type SampleOpportunityItem = Static<typeof SampleOpportunityItemSchema>;

export const CareerSignalSchema = Type.Object(
  {
    signalType: CareerSignalTypeSchema,
    dimensionKey: Type.String(),
    label: Type.String(),
    occurrenceCount: Type.Integer({ minimum: 0 }),
    affectedOpportunityCount: Type.Integer({ minimum: 0 }),
    requiredCount: Type.Integer({ minimum: 0 }),
    preferredCount: Type.Integer({ minimum: 0 }),
    sampleOpportunities: Type.Array(SampleOpportunityItemSchema),
    sourceBreakdown: Type.Record(Type.String(), Type.Integer()),
    findingStateBreakdown: Type.Record(Type.String(), Type.Integer()),
    summary: Type.String(),
  },
  { additionalProperties: false },
);

export type CareerSignal = Static<typeof CareerSignalSchema>;

export const CareerSignalsResponseSchema = Type.Object(
  {
    candidateId: Type.String(),
    generatedAt: Type.String(),
    summary: Type.String(),
    activeOpportunityCount: Type.Integer({ minimum: 0 }),
    repeatedGaps: Type.Array(CareerSignalSchema),
    strongAlignments: Type.Array(CareerSignalSchema),
    transferableCapabilities: Type.Array(CareerSignalSchema),
    eligibilityUncertainties: Type.Array(CareerSignalSchema),
    eligibilityBlockers: Type.Array(CareerSignalSchema),
    evidenceGaps: Type.Array(CareerSignalSchema),
    marketDemand: Type.Array(CareerSignalSchema),
  },
  { additionalProperties: false },
);

export type CareerSignalsResponse = Static<typeof CareerSignalsResponseSchema>;
