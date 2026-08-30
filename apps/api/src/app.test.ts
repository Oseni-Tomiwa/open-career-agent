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
  OpportunityListResponseSchema,
} from '@oca/schemas';
import {
  candidateId,
  decisionId,
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
      url: `/opportunities/${opportunity}?candidateId=${candidate}`,
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
      url: `/opportunities?candidateId=${candidate}`,
    });
    expect(listResponse.json()).toMatchObject({
      data: [{ id: opportunity, fitLevel: 'strong' }],
    });
  });

  it('exposes additive Quality summary and structured findings with freshness and evidence', async () => {
    const candidate = candidateId('candidate-api-qual');
    new CandidateRepository(database).createCandidate(candidate);
    const opportunity = opportunityId('opportunity-api-qual');
    const snapshot = snapshotId('snapshot-api-qual');
    const opportunityRepository = new OpportunityRepository(database);
    opportunityRepository.createOpportunity(opportunity);
    opportunityRepository.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Full Stack Engineer',
      organization: 'Example Corp',
      content: 'TypeScript and React required. Remote — US.',
      fingerprint: 'api-qual-hash',
    });
    const evaluation = evaluationId('evaluation-api-qual');
    const finding = findingId('finding-api-qual');
    const evaluationRepository = new EvaluationRepository(database);
    evaluationRepository.persistEvaluation({
      id: evaluation,
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'eligible',
      eligibilityEngineVersion: 'eligibility-v1',
    });

    const evalTime = new Date('2026-08-30T12:00:00Z');
    evaluationRepository.persistQualityResult({
      evaluationId: evaluation,
      quality: {
        level: 'strong',
        engineVersion: 'quality-v1',
        inputFingerprint: 'qual-input-hash',
        summary: '12 Quality dimensions evaluated.',
        evaluatedAt: evalTime,
        freshnessBucket: 'recent',
      },
      findings: [
        {
          id: finding,
          dimensionKey: 'freshness',
          label: 'Listing freshness',
          state: 'STRONG',
          summary: '0 days old at evaluation time',
          confidence: 'important',
          explanation: '0 days old at evaluation time; classified as recent.',
          evidence: [
            {
              id: evidenceId('evidence-api-qual'),
              evidenceType: 'opportunity-quality',
              sourceReference: 'snapshot:snapshot-api-qual',
              excerpt: 'Freshness anchor: 2026-08-30T12:00:00Z',
              state: 'source-verified',
            },
          ],
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/opportunities/${opportunity}?candidateId=${candidate}`,
    });
    const body: unknown = response.json();
    expect(response.statusCode).toBe(200);
    expect(Value.Check(OpportunityDetailResponseSchema, body)).toBe(true);
    expect(body).toMatchObject({
      snapshots: [
        {
          quality: {
            level: 'strong',
            engineVersion: 'quality-v1',
            freshnessBucket: 'recent',
            summary: '12 Quality dimensions evaluated.',
            findings: [
              {
                dimension: 'freshness',
                label: 'Listing freshness',
                state: 'STRONG',
                importance: 'important',
                evidence: [{ sourceReference: 'snapshot:snapshot-api-qual' }],
              },
            ],
          },
        },
      ],
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: `/opportunities?candidateId=${candidate}`,
    });
    expect(listResponse.json()).toMatchObject({
      data: [{ id: opportunity, qualityLevel: 'strong' }],
    });
  });

  it('exposes additive Decision state, action, and explanation', async () => {
    const candidate = candidateId('candidate-api-dec');
    new CandidateRepository(database).createCandidate(candidate);
    const opportunity = opportunityId('opportunity-api-dec');
    const snapshot = snapshotId('snapshot-api-dec');
    const opportunityRepository = new OpportunityRepository(database);
    opportunityRepository.createOpportunity(opportunity);
    opportunityRepository.appendSnapshot({
      id: snapshot,
      opportunityId: opportunity,
      title: 'Principal Engineer',
      organization: 'Cloud Corp',
      content: 'Distributed systems experience required.',
      fingerprint: 'api-dec-hash',
    });
    const evaluation = evaluationId('evaluation-api-dec');
    const evaluationRepository = new EvaluationRepository(database);
    evaluationRepository.persistEvaluation({
      id: evaluation,
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'eligible',
      eligibilityEngineVersion: 'eligibility-v1',
      eligibilityInputFingerprint: 'elig-api-fp',
      fitLevel: 'strong',
      fitInputFingerprint: 'fit-api-fp',
      qualityLevel: 'strong',
      qualityInputFingerprint: 'quality-api-fp',
    });

    const evalTime = new Date('2026-08-30T12:00:00Z');
    evaluationRepository.persistDecision({
      id: decisionId('decision-api-1'),
      evaluationId: evaluation,
      candidateId: candidate,
      snapshotId: snapshot,
      priority: 'high-priority',
      action: 'apply',
      explanation:
        'High priority: candidate is eligible, requirements match strongly, and listing quality is verified.',
      engineVersion: 'decision-v1',
      inputFingerprint: 'dec-input-hash',
      eligibilityInputFingerprint: 'elig-api-fp',
      fitInputFingerprint: 'fit-api-fp',
      qualityInputFingerprint: 'quality-api-fp',
      reasonCodes: ['ACTIONABLE_LISTING', 'STRONG_REQUIRED_FIT'],
      reasonFindingIds: [],
      evaluatedAt: evalTime,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/opportunities/${opportunity}?candidateId=${candidate}`,
    });
    const body: unknown = response.json();
    expect(response.statusCode).toBe(200);
    expect(Value.Check(OpportunityDetailResponseSchema, body)).toBe(true);
    expect(body).toMatchObject({
      snapshots: [
        {
          eligibility: { state: 'eligible', engineVersion: 'eligibility-v1' },
          decision: {
            state: 'high-priority',
            action: 'apply',
            explanation:
              'High priority: candidate is eligible, requirements match strongly, and listing quality is verified.',
            engineVersion: 'decision-v1',
            reasonCodes: ['ACTIONABLE_LISTING', 'STRONG_REQUIRED_FIT'],
          },
        },
      ],
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: `/opportunities?candidateId=${candidate}`,
    });
    expect(listResponse.json()).toMatchObject({
      data: [{ id: opportunity, decisionState: 'high-priority' }],
    });
  });

  it('projects coherent multi-revision decision states per snapshot in detail view', async () => {
    const candidate = candidateId('candidate-api-multirev');
    new CandidateRepository(database).createCandidate(candidate);
    const opportunity = opportunityId('opportunity-api-multirev');
    const snap1 = snapshotId('snap-multirev-1');
    const snap2 = snapshotId('snap-multirev-2');

    const opportunityRepository = new OpportunityRepository(database);
    opportunityRepository.createOpportunity(opportunity);
    opportunityRepository.appendSnapshot({
      id: snap1,
      opportunityId: opportunity,
      title: 'Software Engineer',
      organization: 'Acme',
      content: 'Original listing.',
      fingerprint: 'fp-snap-1',
    });
    opportunityRepository.appendSnapshot({
      id: snap2,
      opportunityId: opportunity,
      title: 'Senior Software Engineer',
      organization: 'Acme',
      content: 'Updated listing with salary.',
      fingerprint: 'fp-snap-2',
    });

    const evalRepo = new EvaluationRepository(database);
    const eval1 = evaluationId('eval-multirev-1');
    evalRepo.persistEvaluation({
      id: eval1,
      candidateId: candidate,
      snapshotId: snap1,
      eligibilityState: 'investigate',
      eligibilityInputFingerprint: 'fp-elig-1',
      fitLevel: 'moderate',
      fitInputFingerprint: 'fp-fit-1',
      qualityLevel: 'moderate',
      qualityInputFingerprint: 'fp-qual-1',
    });
    evalRepo.persistDecision({
      id: decisionId('dec-multirev-1'),
      evaluationId: eval1,
      candidateId: candidate,
      snapshotId: snap1,
      priority: 'investigate',
      action: 'investigate',
      explanation: 'Investigate eligibility for snapshot 1.',
      engineVersion: 'decision-v1',
      inputFingerprint: 'fp-dec-1',
      eligibilityInputFingerprint: 'fp-elig-1',
      fitInputFingerprint: 'fp-fit-1',
      qualityInputFingerprint: 'fp-qual-1',
      reasonCodes: ['ELIGIBILITY_UNRESOLVED'],
      reasonFindingIds: [],
      evaluatedAt: new Date('2026-08-30T10:00:00Z'),
    });

    const eval2 = evaluationId('eval-multirev-2');
    evalRepo.persistEvaluation({
      id: eval2,
      candidateId: candidate,
      snapshotId: snap2,
      eligibilityState: 'eligible',
      eligibilityInputFingerprint: 'fp-elig-2',
      fitLevel: 'strong',
      fitInputFingerprint: 'fp-fit-2',
      qualityLevel: 'strong',
      qualityInputFingerprint: 'fp-qual-2',
    });
    evalRepo.persistDecision({
      id: decisionId('dec-multirev-2'),
      evaluationId: eval2,
      candidateId: candidate,
      snapshotId: snap2,
      priority: 'high-priority',
      action: 'apply',
      explanation: 'High priority for snapshot 2.',
      engineVersion: 'decision-v1',
      inputFingerprint: 'fp-dec-2',
      eligibilityInputFingerprint: 'fp-elig-2',
      fitInputFingerprint: 'fp-fit-2',
      qualityInputFingerprint: 'fp-qual-2',
      reasonCodes: ['ACTIONABLE_LISTING', 'STRONG_REQUIRED_FIT'],
      reasonFindingIds: [],
      evaluatedAt: new Date('2026-08-30T11:00:00Z'),
    });

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/opportunities/${opportunity}?candidateId=${candidate}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    const detailBody: unknown = detailResponse.json();
    expect(Value.Check(OpportunityDetailResponseSchema, detailBody)).toBe(true);
    expect(detailBody).toMatchObject({
      snapshots: [
        {
          id: snap1,
          decision: { state: 'investigate', action: 'investigate' },
        },
        {
          id: snap2,
          decision: { state: 'high-priority', action: 'apply' },
        },
      ],
    });

    const summaryResponse = await app.inject({
      method: 'GET',
      url: `/opportunities?candidateId=${candidate}`,
    });
    expect(summaryResponse.statusCode).toBe(200);
    const summaryBody: unknown = summaryResponse.json();
    expect(Value.Check(OpportunityListResponseSchema, summaryBody)).toBe(true);
    if (
      typeof summaryBody === 'object' &&
      summaryBody !== null &&
      'data' in summaryBody &&
      Array.isArray((summaryBody as { data: unknown[] }).data)
    ) {
      const items = (
        summaryBody as { data: Array<{ id: string; decisionState?: string }> }
      ).data;
      const summaryItem = items.find((d) => d.id === opportunity);
      expect(summaryItem?.decisionState).toBe('high-priority');
    }
  });
});
