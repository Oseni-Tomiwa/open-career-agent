import { type Static, Type } from '@sinclair/typebox';

export const ServiceMetadataSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
  },
  { $id: 'ServiceMetadata', additionalProperties: false },
);

export type ServiceMetadata = Static<typeof ServiceMetadataSchema>;

export const HealthResponseSchema = Type.Object(
  {
    status: Type.Literal('ok'),
    service: ServiceMetadataSchema,
  },
  { $id: 'HealthResponse', additionalProperties: false },
);

export type HealthResponse = Static<typeof HealthResponseSchema>;

export const ReadinessResponseSchema = Type.Object(
  {
    status: Type.Union([Type.Literal('ready'), Type.Literal('not_ready')]),
    service: ServiceMetadataSchema,
    resources: Type.Object(
      {
        database: Type.Union([
          Type.Literal('ready'),
          Type.Literal('not_ready'),
        ]),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'ReadinessResponse', additionalProperties: false },
);

export type ReadinessResponse = Static<typeof ReadinessResponseSchema>;

export const ApiErrorEnvelopeSchema = Type.Object(
  {
    error: Type.Object(
      {
        code: Type.String({ minLength: 1 }),
        message: Type.String({ minLength: 1 }),
        requestId: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'ApiErrorEnvelope', additionalProperties: false },
);

export type ApiErrorEnvelope = Static<typeof ApiErrorEnvelopeSchema>;
