import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyMigrations, openDatabase } from '@oca/database';
import { ApiErrorEnvelopeSchema } from '@oca/schemas';
import { Value } from '@sinclair/typebox/value';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApiApp } from './app.js';

describe('API application', () => {
  let directory: string;
  let app: Awaited<ReturnType<typeof createApiApp>>;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-api-'));
    const database = openDatabase(join(directory, 'api.sqlite'));
    applyMigrations(database);
    app = await createApiApp({
      config: {
        environment: 'test',
        databasePath: database.path,
        host: '127.0.0.1',
        port: 3000,
        webOrigin: 'http://localhost:5173',
      },
      database,
      logger: false,
    });
  });

  afterEach(async () => {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('reports process health', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: { name: 'api', version: '0.0.0' },
    });
  });

  it('reports database readiness without exposing its path', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
      service: { name: 'api', version: '0.0.0' },
      resources: { database: 'ready' },
    });
    expect(response.body).not.toContain(directory);
  });

  it('generates OpenAPI from registered route schemas', async () => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    const document = response.json<{
      openapi: string;
      paths: Record<string, unknown>;
    }>();

    expect(response.statusCode).toBe(200);
    expect(document.openapi).toBe('3.0.3');
    expect(document.paths).toHaveProperty('/health');
    expect(document.paths).toHaveProperty('/ready');
  });

  it('returns a standard safe error for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/missing' });
    const body: unknown = response.json();
    expect(response.statusCode).toBe(404);
    expect(Value.Check(ApiErrorEnvelopeSchema, body)).toBe(true);
    if (!Value.Check(ApiErrorEnvelopeSchema, body)) {
      throw new Error('Response did not match ApiErrorEnvelopeSchema');
    }
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('The requested resource was not found.');
    expect(body.error.requestId).toBeTruthy();
  });
});
