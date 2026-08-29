import { Type } from '@sinclair/typebox';

import { parseUrl, validateConfiguration } from './validation.js';

const BrowserEnvironmentSchema = Type.Object(
  {
    VITE_API_BASE_URL: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export interface BrowserConfig {
  readonly apiBaseUrl: string;
}

export function parseBrowserConfig(input: {
  readonly VITE_API_BASE_URL?: string;
}): BrowserConfig {
  const environment = validateConfiguration(
    'browser',
    BrowserEnvironmentSchema,
    input,
  );

  return {
    apiBaseUrl: parseUrl(
      'VITE_API_BASE_URL',
      environment.VITE_API_BASE_URL ?? 'http://localhost:3000',
    ),
  };
}
