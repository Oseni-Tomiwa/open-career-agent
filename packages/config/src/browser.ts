import { Type } from '@sinclair/typebox';

import { parseUrl, validateConfiguration } from './validation.js';

const BrowserEnvironmentSchema = Type.Object(
  {
    VITE_API_BASE_URL: Type.Optional(Type.String({ minLength: 1 })),
    VITE_PRODUCT_DATA_SOURCE: Type.Optional(
      Type.Union([Type.Literal('seed'), Type.Literal('api')]),
    ),
    VITE_DEVELOPMENT_CANDIDATE_ID: Type.Optional(Type.String({ minLength: 1 })),
    VITE_DEPLOYMENT_MODE: Type.Optional(
      Type.Union([
        Type.Literal('development'),
        Type.Literal('self-hosted'),
        Type.Literal('cloud'),
      ]),
    ),
  },
  { additionalProperties: false },
);

export interface BrowserConfig {
  readonly apiBaseUrl: string;
  readonly productDataSource: 'seed' | 'api';
  readonly developmentCandidateId?: string;
  readonly deploymentMode: 'development' | 'self-hosted' | 'cloud';
}

export function parseBrowserConfig(input: {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PRODUCT_DATA_SOURCE?: string;
  readonly VITE_DEVELOPMENT_CANDIDATE_ID?: string;
  readonly VITE_DEPLOYMENT_MODE?: string;
}): BrowserConfig {
  const environment = validateConfiguration(
    'browser',
    BrowserEnvironmentSchema,
    input,
  );

  const productDataSource = environment.VITE_PRODUCT_DATA_SOURCE ?? 'seed';
  const deploymentMode = environment.VITE_DEPLOYMENT_MODE ?? 'development';
  if (deploymentMode === 'cloud' && productDataSource !== 'api') {
    throw new Error(
      'Invalid browser configuration: VITE_PRODUCT_DATA_SOURCE must be api in Cloud mode',
    );
  }
  if (
    productDataSource === 'api' &&
    deploymentMode !== 'cloud' &&
    !environment.VITE_DEVELOPMENT_CANDIDATE_ID
  ) {
    throw new Error(
      'Invalid browser configuration: VITE_DEVELOPMENT_CANDIDATE_ID is required in API mode',
    );
  }
  if (deploymentMode === 'cloud' && environment.VITE_DEVELOPMENT_CANDIDATE_ID) {
    throw new Error(
      'Invalid browser configuration: VITE_DEVELOPMENT_CANDIDATE_ID must not be set in Cloud mode',
    );
  }

  return {
    apiBaseUrl: parseUrl(
      'VITE_API_BASE_URL',
      environment.VITE_API_BASE_URL ?? 'http://localhost:3000',
    ),
    productDataSource,
    deploymentMode,
    ...(environment.VITE_DEVELOPMENT_CANDIDATE_ID
      ? { developmentCandidateId: environment.VITE_DEVELOPMENT_CANDIDATE_ID }
      : {}),
  };
}
