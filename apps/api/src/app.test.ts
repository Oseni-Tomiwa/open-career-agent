import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  CandidateRepository,
  EvaluationRepository,
  openDatabase,
  OpportunityRepository,
  type DatabaseHandle,
} from '@oca/database';
import {
  ApiErrorEnvelopeSchema,
  OpportunityDetailResponseSchema,
} from '@oca/schemas';
import {
  candidateId,
  evaluationId,
  evidenceId,
  findingId,
  opportunityId,
  snapshotId,
} from '@oca/domain';
import { Value } from '@sinclair/typebox/value';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApiApp } from './app.js';

describe('API application', () => {
  let directory: string;
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let database: DatabaseHandle;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-api-'));
    database = openDatabase(join(directory, 'api.sqlite'));
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

  it('exposes additive Fit summary and structured finding evidence', async () => {
    const candidate = candidateId('candidate-api-fit');
    new CandidateRepository(database).createCandidate(candidate);
    const opportunity = opportunityId('opportunity-api-fit');
    const snapshot = snapshotId('snapshot-api-fit');
    const opportunityRepository = new OpportunityRepository(database);
    opportunityRepository.createOpportunity(opportunity);
    opportunityRepository.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Backend Engineer',
      organization: 'Example',
      content: 'Node.js required.',
      fingerprint: 'api-fit-hash',
    });
    const evaluation = evaluationId('evaluation-api-fit');
    const finding = findingId('finding-api-fit');
    const evaluationRepository = new EvaluationRepository(database);
    evaluationRepository.persistEvaluation({
      id: evaluation,
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'investigate',
    });
    evaluationRepository.persistFitResult({
      evaluationId: evaluation,
      fit: {
        level: 'strong',
        engineVersion: 'fit-v1',
        inputFingerprint: 'input-hash',
        summary: '1 of 1 requirements directly match.',
      },
      findings: [
        {
          id: finding,
          dimensionKey: 'programming_language:node-js:0',
          label: 'node.js',
          state: 'STRONG_MATCH',
          summary: 'Supported evidence directly matches.',
          confidence: 'high',
          modality: 'required',
          requirementText: 'Node.js required.',
          explanation: 'Supported evidence directly matches.',
          opportunityEvidence: {
            id: evidenceId('evidence-api-fit'),
            evidenceType: 'opportunity-requirement',
            sourceReference: 'snapshot:snapshot-api-fit',
            excerpt: 'Node.js required.',
            state: 'source-verified',
          },
          candidateEvidenceIds: [],
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/opportunities/${opportunity}`,
    });
    const body: unknown = response.json();
    expect(response.statusCode).toBe(200);
    expect(Value.Check(OpportunityDetailResponseSchema, body)).toBe(true);
    expect(body).toMatchObject({
      snapshots: [
        {
          fit: {
            level: 'strong',
            engineVersion: 'fit-v1',
            findings: [
              {
                label: 'node.js',
                state: 'STRONG_MATCH',
                modality: 'required',
                evidence: [{ sourceReference: 'snapshot:snapshot-api-fit' }],
              },
            ],
          },
        },
      ],
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/opportunities',
    });
    expect(listResponse.json()).toMatchObject({
      data: [{ id: opportunity, fitLevel: 'strong' }],
    });
  });
});
