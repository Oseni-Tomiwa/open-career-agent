import { describe, expect, it } from 'vitest';

import { parseBrowserConfig } from './browser.js';
import { parseApiConfig, parseWorkerConfig } from './server.js';

describe('configuration', () => {
  it('provides safe local defaults', () => {
    expect(parseApiConfig({}).host).toBe('127.0.0.1');
    expect(parseWorkerConfig({}).pollIntervalMs).toBe(1000);
    expect(parseBrowserConfig({}).apiBaseUrl).toBe('http://localhost:3000');
    expect(parseBrowserConfig({}).productDataSource).toBe('seed');
    expect(parseBrowserConfig({}).deploymentMode).toBe('development');
  });

  it('requires Cloud identity and rejects a development identity override', () => {
    expect(
      parseBrowserConfig({
        VITE_PRODUCT_DATA_SOURCE: 'api',
        VITE_DEPLOYMENT_MODE: 'cloud',
      }),
    ).toMatchObject({ deploymentMode: 'cloud', productDataSource: 'api' });
    expect(() =>
      parseBrowserConfig({
        VITE_DEPLOYMENT_MODE: 'cloud',
        VITE_PRODUCT_DATA_SOURCE: 'api',
        VITE_DEVELOPMENT_CANDIDATE_ID: 'must-not-win',
      }),
    ).toThrow('must not be set in Cloud mode');
    expect(() =>
      parseBrowserConfig({
        VITE_DEPLOYMENT_MODE: 'cloud',
        VITE_PRODUCT_DATA_SOURCE: 'seed',
      }),
    ).toThrow('must be api in Cloud mode');
  });

  it('defaults Cloud processes to explicit migrations', () => {
    const cloud = parseApiConfig({
      APP_ENV: 'production',
      IDENTITY_MODE: 'cloud',
      TRUSTED_CANDIDATE_ID: 'must-not-win',
    });
    expect(cloud).toMatchObject({
      identityMode: 'cloud',
      migrationMode: 'manual',
    });
    expect(cloud.trustedCandidateId).toBeUndefined();
  });

  it('fails closed when production identity mode is ambiguous', () => {
    expect(() => parseApiConfig({ APP_ENV: 'production' })).toThrow(
      'IDENTITY_MODE is required in production',
    );
    expect(() =>
      parseApiConfig({
        APP_ENV: 'production',
        IDENTITY_MODE: 'development',
        TRUSTED_CANDIDATE_ID: 'candidate',
      }),
    ).toThrow('development identity is not allowed in production');
    expect(
      parseApiConfig({
        APP_ENV: 'production',
        IDENTITY_MODE: 'self-hosted',
        TRUSTED_CANDIDATE_ID: 'self-hosted-candidate',
      }),
    ).toMatchObject({
      identityMode: 'self-hosted',
      trustedCandidateId: 'self-hosted-candidate',
    });
  });

  it('requires a development candidate in API mode', () => {
    expect(() =>
      parseBrowserConfig({ VITE_PRODUCT_DATA_SOURCE: 'api' }),
    ).toThrow('VITE_DEVELOPMENT_CANDIDATE_ID');
    expect(
      parseBrowserConfig({
        VITE_PRODUCT_DATA_SOURCE: 'api',
        VITE_DEVELOPMENT_CANDIDATE_ID: 'candidate-dev',
      }),
    ).toMatchObject({
      productDataSource: 'api',
      developmentCandidateId: 'candidate-dev',
    });
  });

  it('rejects an invalid server port without exposing unrelated values', () => {
    expect(() => parseApiConfig({ API_PORT: 'invalid' })).toThrow(
      'Invalid server configuration',
    );
  });

  it('rejects a relative browser API URL', () => {
    expect(() => parseBrowserConfig({ VITE_API_BASE_URL: '/api' })).toThrow(
      'VITE_API_BASE_URL',
    );
  });

  it('rejects server-only keys at the browser configuration boundary', () => {
    expect(() =>
      parseBrowserConfig({
        VITE_PRODUCT_DATA_SOURCE: 'seed',
        SESSION_SIGNING_SECRET: 'must-never-enter-vite',
      } as never),
    ).toThrow('Invalid browser configuration');
  });
});
