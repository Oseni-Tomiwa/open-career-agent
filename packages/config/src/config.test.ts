import { describe, expect, it } from 'vitest';

import { parseBrowserConfig } from './browser.js';
import { parseApiConfig, parseWorkerConfig } from './server.js';

describe('configuration', () => {
  it('provides safe local defaults', () => {
    expect(parseApiConfig({}).host).toBe('127.0.0.1');
    expect(parseWorkerConfig({}).pollIntervalMs).toBe(1000);
    expect(parseBrowserConfig({}).apiBaseUrl).toBe('http://localhost:3000');
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
});
