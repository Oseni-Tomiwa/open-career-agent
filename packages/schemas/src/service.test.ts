import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

import {
  ApiErrorEnvelopeSchema,
  HealthResponseSchema,
  ReadinessResponseSchema,
} from './service.js';

describe('service schemas', () => {
  it('accepts the health contract', () => {
    expect(
      Value.Check(HealthResponseSchema, {
        status: 'ok',
        service: { name: 'api', version: '0.0.0' },
      }),
    ).toBe(true);
  });

  it('rejects an unknown readiness resource state', () => {
    expect(
      Value.Check(ReadinessResponseSchema, {
        status: 'ready',
        service: { name: 'api', version: '0.0.0' },
        resources: { database: 'unknown' },
      }),
    ).toBe(false);
  });

  it('requires a safe request identifier in API errors', () => {
    expect(
      Value.Check(ApiErrorEnvelopeSchema, {
        error: { code: 'NOT_FOUND', message: 'Not found', requestId: '' },
      }),
    ).toBe(false);
  });
});
