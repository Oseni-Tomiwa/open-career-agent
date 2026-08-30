import { Type } from '@sinclair/typebox';

import { parseUrl, validateConfiguration } from './validation.js';

const BrowserEnvironmentSchema = Type.Object(
  {
    VITE_API_BASE_URL: Type.Optional(Type.String({ minLength: 1 })),
    VITE_PRODUCT_DATA_SOURCE: Type.Optional(
      Type.Union([Type.Literal('seed'), Type.Literal('api')]),
    ),
    VITE_DEVELOPMENT_CANDIDATE_ID: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export interface BrowserConfig {
  readonly apiBaseUrl: string;
  readonly productDataSource: 'seed' | 'api';
  readonly developmentCandidateId?: string;
}

export function parseBrowserConfig(input: {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PRODUCT_DATA_SOURCE?: string;
  readonly VITE_DEVELOPMENT_CANDIDATE_ID?: string;
}): BrowserConfig {
  const environment = validateConfiguration(
    'browser',
    BrowserEnvironmentSchema,
    input,
  );

  const productDataSource = environment.VITE_PRODUCT_DATA_SOURCE ?? 'seed';
  if (
    productDataSource === 'api' &&
    !environment.VITE_DEVELOPMENT_CANDIDATE_ID
  ) {
    throw new Error(
      'Invalid browser configuration: VITE_DEVELOPMENT_CANDIDATE_ID is required in API mode',
    );
  }

  return {
    apiBaseUrl: parseUrl(
      'VITE_API_BASE_URL',
      environment.VITE_API_BASE_URL ?? 'http://localhost:3000',
    ),
    productDataSource,
    ...(environment.VITE_DEVELOPMENT_CANDIDATE_ID
      ? { developmentCandidateId: environment.VITE_DEVELOPMENT_CANDIDATE_ID }
      : {}),
  };
}
