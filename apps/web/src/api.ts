import {
  HealthResponseSchema,
  ReadinessResponseSchema,
  type HealthResponse,
  type ReadinessResponse,
} from '@oca/schemas';
import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import { browserConfig } from './config.js';

export class ApiClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function getValidated<T>(path: string, schema: TSchema): Promise<T> {
  const response = await fetch(`${browserConfig.apiBaseUrl}${path}`, {
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new ApiClientError(
      `API request failed with status ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (!Value.Check(schema, body)) {
    throw new ApiClientError('API response did not match its contract');
  }

  return body as T;
}

export interface BootstrapStatus {
  readonly health: HealthResponse;
  readonly readiness: ReadinessResponse;
}

export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  const [health, readiness] = await Promise.all([
    getValidated<HealthResponse>('/health', HealthResponseSchema),
    getValidated<ReadinessResponse>('/ready', ReadinessResponseSchema),
  ]);
  return { health, readiness };
}

export function openApiUrl(): string {
  return `${browserConfig.apiBaseUrl}/openapi.json`;
}
