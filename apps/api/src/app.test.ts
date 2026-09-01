import { mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrations,
  CandidateRepository,
  EvaluationRepository,
  openDatabase,
  OpportunityRepository,
  SearchTargetRepository,
  SourceListingRepository,
  type DatabaseHandle,
} from '@oca/database';
import {
  ApiErrorEnvelopeSchema,
  CandidateProfileResponseSchema,
  OpportunityDetailResponseSchema,
  OpportunityListResponseSchema,
  TodayDashboardResponseSchema,
  CareerSignalsResponseSchema,
} from '@oca/schemas';
import {
  candidateId,
  decisionId,
  discoveryMatchId,
  discoveryRunId,
  evaluationId,
  evidenceId,
  findingId,
  opportunityId,
  searchTargetId,
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
        databaseEngine: 'sqlite',
        databasePath: database.path!,
        migrationMode: 'auto',
        host: '127.0.0.1',
        port: 3000,
        webOrigin: 'http://localhost:5173',
        identityMode: 'development',
        sessionTtlHours: 168,
      },
      database,
      logger: false,
    });
  });

  afterEach(async () => {
    await app.close();
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function recordTestDiscoveryMatch(
    cId: ReturnType<typeof candidateId>,
    oppId: ReturnType<typeof opportunityId>,
    suffix: string,
  ) {
    const sourceRepo = new SourceListingRepository(database);
    await sourceRepo.persistListing(
      `sl-test-${suffix}`,
      { sourceSystem: 'greenhouse', sourceExternalId: `ext-${suffix}` },
      oppId,
      Date.now(),
    );
    const searchRepo = new SearchTargetRepository(database);
    const target = await searchRepo.createSearchTarget(cId, {
      name: `Target ${suffix}`,
    });
    const run = await searchRepo.createDiscoveryRun(
      discoveryRunId(`run-test-${suffix}`),
      cId,
      searchTargetId(target.id),
    );
    await searchRepo.recordDiscoveryMatch({
      id: discoveryMatchId(`dm-test-${suffix}`),
      candidateId: cId,
      searchTargetId: searchTargetId(target.id),
      discoveryRunId: discoveryRunId(run.id),
      opportunityId: oppId,
      sourceListingId: `sl-test-${suffix}`,
      matchReasons: ['Test match'],
      retainedUnresolved: [],
    });
  }

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
    await opportunityRepository.createOpportunity(opportunity);
    await recordTestDiscoveryMatch(candidate, opportunity, 'fit');
    await opportunityRepository.appendSnapshot({
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
    await evaluationRepository.persistEvaluation({
      id: evaluation,
      candidateId: candidate,
      snapshotId: snapshot,
      eligibilityState: 'investigate',
    });
    await evaluationRepository.persistFitResult({
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
      data: [
        {
          id: opportunity,
          eligibilityState: 'investigate',
          fitLevel: 'strong',
        },
      ],
    });
  });

  it('exposes additive Quality summary and structured findings with freshness and evidence', async () => {
    const candidate = candidateId('candidate-api-qual');
    new CandidateRepository(database).createCandidate(candidate);
    const opportunity = opportunityId('opportunity-api-qual');
    const snapshot = snapshotId('snapshot-api-qual');
    const opportunityRepository = new OpportunityRepository(database);
    opportunityRepository.createOpportunity(opportunity);
    recordTestDiscoveryMatch(candidate, opportunity, 'qual');
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
    recordTestDiscoveryMatch(candidate, opportunity, 'dec');
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
    recordTestDiscoveryMatch(candidate, opportunity, 'multirev');
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

  it('reads and mutates candidate-scoped Career Memory with preserved provenance', async () => {
    const candidate = candidateId('candidate-profile-api');
    const otherCandidate = candidateId('candidate-profile-other');
    const candidateRepository = new CandidateRepository(database);
    candidateRepository.createCandidate(candidate);
    candidateRepository.createCandidate(otherCandidate);

    const created = await app.inject({
      method: 'POST',
      url: `/candidates/${candidate}/claims`,
      payload: {
        kind: 'work_authorization',
        value: 'Authorized to work',
        scope: 'us',
        state: 'SUPPORTED',
        confidence: 'HIGH',
        evidence: {
          evidenceType: 'user-confirmed statement',
          excerpt: 'I am authorized to work in the United States.',
          state: 'candidate-confirmed',
        },
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      reevaluationRequested: true,
      claims: [
        {
          kind: 'work_authorization',
          scope: 'us',
          state: 'SUPPORTED',
          confidence: 'HIGH',
          evidence: [
            {
              sourceReference: 'candidate-confirmed/manual',
              state: 'candidate-confirmed',
            },
          ],
        },
      ],
    });
    const claim = created.json<{ claims: Array<{ id: string }> }>().claims[0]!;

    const read = await app.inject({
      method: 'GET',
      url: `/candidates/${candidate}/profile`,
    });
    expect(read.statusCode).toBe(200);
    expect(Value.Check(CandidateProfileResponseSchema, read.json())).toBe(true);

    const invalidTransition = await app.inject({
      method: 'PATCH',
      url: `/candidates/${candidate}/claims/${claim.id}`,
      payload: { state: 'UNKNOWN' },
    });
    expect(invalidTransition.statusCode).toBe(409);
    expect(invalidTransition.json()).toMatchObject({
      error: { code: 'INVALID_TRANSITION' },
    });

    const crossCandidate = await app.inject({
      method: 'POST',
      url: `/candidates/${otherCandidate}/claims/${claim.id}/evidence`,
      payload: {
        evidence: {
          evidenceType: 'manual reference',
          sourceReference: 'certificate:example',
          excerpt: 'A reference that belongs only to the first candidate.',
          state: 'unreviewed',
        },
      },
    });
    expect(crossCandidate.statusCode).toBe(404);

    const otherProfile = await app.inject({
      method: 'GET',
      url: `/candidates/${otherCandidate}/profile`,
    });
    expect(otherProfile.json()).toMatchObject({ claims: [] });
  });

  it('supports batch authoring, explicit succession, retirement, and non-interference', async () => {
    const candidate = candidateId('candidate-profile-lifecycle-api');
    await new CandidateRepository(database).createCandidate(candidate);
    const before = {
      applications: database
        .sqlite!.prepare('select count(*) as count from applications')
        .get(),
      events: database
        .sqlite!.prepare('select count(*) as count from application_events')
        .get(),
      opportunities: database
        .sqlite!.prepare('select count(*) as count from opportunities')
        .get(),
      snapshots: database
        .sqlite!.prepare('select count(*) as count from opportunity_snapshots')
        .get(),
    };

    const batch = await app.inject({
      method: 'POST',
      url: `/candidates/${candidate}/claims/batch`,
      payload: {
        claims: [
          {
            kind: 'skill',
            value: 'Synthetic Python',
            scope: 'Beginner',
            state: 'UNKNOWN',
          },
          {
            kind: 'project',
            value: 'Synthetic project',
            state: 'SUPPORTED',
            evidence: {
              evidenceType: 'candidate statement',
              excerpt: 'Synthetic evidence only.',
              state: 'candidate-confirmed',
            },
          },
        ],
      },
    });
    expect(batch.statusCode).toBe(201);
    expect(batch.json()).toMatchObject({
      claims: expect.arrayContaining([
        expect.objectContaining({ value: 'Synthetic Python' }),
        expect.objectContaining({ value: 'Synthetic project' }),
      ]),
      historicalClaims: [],
      reevaluationRequested: true,
      reevaluation: { state: 'SUCCEEDED', taskCount: 0 },
    });
    const python = batch
      .json<{ claims: Array<{ id: string; value: string }> }>()
      .claims.find((claim) => claim.value === 'Synthetic Python')!;

    const replacement = await app.inject({
      method: 'POST',
      url: `/candidates/${candidate}/claims/${python.id}/replace`,
      payload: {
        changeType: 'DEVELOPMENT',
        value: 'Synthetic Python',
        scope: 'Intermediate',
        state: 'SUPPORTED',
        evidence: {
          evidenceType: 'candidate statement',
          excerpt: 'Synthetic development evidence.',
          state: 'candidate-confirmed',
        },
      },
    });
    expect(replacement.statusCode).toBe(201);
    expect(replacement.json()).toMatchObject({
      claims: expect.arrayContaining([
        expect.objectContaining({
          value: 'Synthetic Python',
          scope: 'Intermediate',
          successionType: 'DEVELOPMENT',
        }),
        expect.objectContaining({ value: 'Synthetic project' }),
      ]),
      historicalClaims: [
        {
          id: python.id,
          scope: 'Beginner',
          lifecycleState: 'SUPERSEDED',
        },
      ],
    });
    const project = replacement
      .json<{ claims: Array<{ id: string; value: string }> }>()
      .claims.find((claim) => claim.value === 'Synthetic project')!;
    const retired = await app.inject({
      method: 'POST',
      url: `/candidates/${candidate}/claims/${project.id}/retire`,
      payload: { note: 'Synthetic retirement.' },
    });
    expect(retired.statusCode).toBe(200);
    expect(retired.json()).toMatchObject({
      claims: [{ value: 'Synthetic Python' }],
      historicalClaims: expect.arrayContaining([
        expect.objectContaining({
          id: project.id,
          lifecycleState: 'RETIRED',
          successionNote: 'Synthetic retirement.',
        }),
      ]),
    });

    expect({
      applications: database
        .sqlite!.prepare('select count(*) as count from applications')
        .get(),
      events: database
        .sqlite!.prepare('select count(*) as count from application_events')
        .get(),
      opportunities: database
        .sqlite!.prepare('select count(*) as count from opportunities')
        .get(),
      snapshots: database
        .sqlite!.prepare('select count(*) as count from opportunity_snapshots')
        .get(),
    }).toEqual(before);
  });

  it('supports unknown claim editing and evidence-backed confirmation', async () => {
    const candidate = candidateId('candidate-profile-edit');
    new CandidateRepository(database).createCandidate(candidate);
    const created = await app.inject({
      method: 'POST',
      url: `/candidates/${candidate}/claims`,
      payload: {
        kind: 'language',
        value: 'German',
        scope: 'German',
        state: 'UNKNOWN',
      },
    });
    const claimId = created.json<{ claims: Array<{ id: string }> }>().claims[0]!
      .id;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/candidates/${candidate}/claims/${claimId}`,
      payload: {
        value: 'German language',
        scope: 'German',
        confidence: 'MODERATE',
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      claims: [
        {
          value: 'German language',
          scope: 'German',
          state: 'UNKNOWN',
          confidence: 'MODERATE',
        },
      ],
    });

    const confirmed = await app.inject({
      method: 'POST',
      url: `/candidates/${candidate}/claims/${claimId}/evidence`,
      payload: {
        evidence: {
          evidenceType: 'user-confirmed statement',
          excerpt: 'I can work professionally in German.',
          state: 'candidate-confirmed',
        },
        transitionTo: 'SUPPORTED',
      },
    });
    expect(confirmed.statusCode).toBe(201);
    expect(confirmed.json()).toMatchObject({
      claims: [
        { state: 'SUPPORTED', evidence: [{ state: 'candidate-confirmed' }] },
      ],
    });
  });

  it('rejects invalid candidates and malformed Career Memory payloads', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/candidates/missing/profile' }))
        .statusCode,
    ).toBe(404);
    const candidate = candidateId('candidate-profile-invalid');
    new CandidateRepository(database).createCandidate(candidate);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/candidates/${candidate}/claims`,
          payload: { kind: '', value: '', state: 'TRUE' },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('supports search target CRUD, candidate isolation, and manual discovery run triggering', async () => {
    const candidateA = candidateId('cand-api-search-a');
    const candidateB = candidateId('cand-api-search-b');
    const candidateRepo = new CandidateRepository(database);
    candidateRepo.createCandidate(candidateA);
    candidateRepo.createCandidate(candidateB);

    // 1. Create target for candidate A
    const createRes = await app.inject({
      method: 'POST',
      url: `/candidates/${candidateA}/search-targets`,
      payload: {
        name: 'Backend Target A',
        targetRoles: ['Backend Engineer'],
        locations: ['Germany'],
        locationIsHardFilter: true,
        sources: [
          { sourceSystem: 'greenhouse', boardId: 'company-greenhouse' },
          { sourceSystem: 'lever', boardId: 'company-lever' },
          { sourceSystem: 'ashby', boardId: 'company-ashby' },
        ],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdTarget = createRes.json<{ id: string; name: string }>();
    expect(createdTarget).toMatchObject({
      name: 'Backend Target A',
      locationIsHardFilter: true,
    });

    // 2. List targets for Candidate A and B (Candidate isolation)
    const listARes = await app.inject({
      method: 'GET',
      url: `/candidates/${candidateA}/search-targets`,
    });
    expect(listARes.statusCode).toBe(200);
    expect(listARes.json<{ data: unknown[] }>().data).toHaveLength(1);

    const listBRes = await app.inject({
      method: 'GET',
      url: `/candidates/${candidateB}/search-targets`,
    });
    expect(listBRes.statusCode).toBe(200);
    expect(listBRes.json<{ data: unknown[] }>().data).toHaveLength(0);

    // 3. Update search target
    const targetIdStr = (createdTarget as { id: string }).id;
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/candidates/${candidateA}/search-targets/${targetIdStr}`,
      payload: {
        skills: ['TypeScript'],
        enabled: false,
      },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json()).toMatchObject({
      skills: ['TypeScript'],
      enabled: false,
    });

    // 4. Trigger discovery run
    const runRes = await app.inject({
      method: 'POST',
      url: `/candidates/${candidateA}/search-targets/${targetIdStr}/run`,
    });
    expect(runRes.statusCode).toBe(202);
    expect(runRes.json()).toMatchObject({
      taskEnqueued: true,
      run: {
        candidateId: candidateA,
        searchTargetId: targetIdStr,
        status: 'PENDING',
      },
    });

    // 5. List discovery runs
    const runsListRes = await app.inject({
      method: 'GET',
      url: `/candidates/${candidateA}/discovery-runs`,
    });
    expect(runsListRes.statusCode).toBe(200);
    expect(runsListRes.json<{ data: unknown[] }>().data).toHaveLength(1);
  });

  it('rejects discovery without a valid source and rejects duplicate source authoring', async () => {
    const candidate = candidateId('cand-api-source-validation');
    new CandidateRepository(database).createCandidate(candidate);
    const target = await new SearchTargetRepository(
      database,
    ).createSearchTarget(candidate, { name: 'Draft without sources' });

    const run = await app.inject({
      method: 'POST',
      url: `/candidates/${candidate}/search-targets/${target.id}/run`,
    });
    expect(run.statusCode).toBe(400);
    expect(run.json()).toMatchObject({
      error: { code: 'INVALID_SOURCE_CONFIGURATION' },
    });

    const duplicate = await app.inject({
      method: 'POST',
      url: `/candidates/${candidate}/search-targets`,
      payload: {
        name: 'Duplicate sources',
        sources: [
          { sourceSystem: 'lever', boardId: 'same-site' },
          { sourceSystem: 'lever', boardId: 'SAME-SITE' },
        ],
      },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json()).toMatchObject({
      error: { code: 'INVALID_SOURCE_CONFIGURATION' },
    });
  });

  it('proves Candidate B discovery matches never leak into Candidate A opportunity list', async () => {
    const candidateA = candidateId('cand-leak-a');
    const candidateB = candidateId('cand-leak-b');
    const candRepo = new CandidateRepository(database);
    candRepo.createCandidate(candidateA);
    candRepo.createCandidate(candidateB);

    const oppIdB = opportunityId('opp-b-only');
    const oppRepo = new OpportunityRepository(database);
    oppRepo.createOpportunity(oppIdB);
    const sourceRepo = new SourceListingRepository(database);
    sourceRepo.persistListing(
      'sl-leak-b',
      { sourceSystem: 'greenhouse', sourceExternalId: 'b-999' },
      oppIdB,
      Date.now(),
    );

    const searchRepo = new SearchTargetRepository(database);
    const targetB = await searchRepo.createSearchTarget(candidateB, {
      name: 'Target B',
    });
    const runB = await searchRepo.createDiscoveryRun(
      discoveryRunId('run-leak-b'),
      candidateB,
      searchTargetId(targetB.id),
    );

    await searchRepo.recordDiscoveryMatch({
      id: discoveryMatchId('dm-leak-b'),
      candidateId: candidateB,
      searchTargetId: searchTargetId(targetB.id),
      discoveryRunId: discoveryRunId(runB.id),
      opportunityId: oppIdB,
      sourceListingId: 'sl-leak-b',
      matchReasons: ['Matched Candidate B target'],
      retainedUnresolved: [],
    });

    // Query candidate A opportunities -> Must return 0 items (never Candidate B's match)
    const oppsARes = await app.inject({
      method: 'GET',
      url: `/opportunities?candidateId=${candidateA}`,
    });
    expect(oppsARes.statusCode).toBe(200);
    expect(oppsARes.json<{ data: unknown[] }>().data).toHaveLength(0);

    // Query candidate B opportunities -> Returns candidate B's matched opportunity
    const oppsBRes = await app.inject({
      method: 'GET',
      url: `/opportunities?candidateId=${candidateB}`,
    });
    expect(oppsBRes.statusCode).toBe(200);
    const oppsBData = oppsBRes.json<{ data: Array<{ id: string }> }>().data;
    expect(oppsBData).toHaveLength(1);
    expect(oppsBData[0]?.id).toBe(oppIdB);
  });

  it('returns Today attention dashboard with schema validation and candidate isolation', async () => {
    const candidateA = candidateId('cand-today-a');
    const candidateB = candidateId('cand-today-b');
    const candRepo = new CandidateRepository(database);
    candRepo.createCandidate(candidateA);
    candRepo.createCandidate(candidateB);

    const responseA = await app.inject({
      method: 'GET',
      url: `/candidates/${candidateA}/today`,
    });

    expect(responseA.statusCode).toBe(200);
    const bodyA: unknown = responseA.json();
    expect(Value.Check(TodayDashboardResponseSchema, bodyA)).toBe(true);
    expect(bodyA).toMatchObject({
      timeWindowDays: 7,
      priorityOpportunities: [],
      needsAttention: [],
      recentChanges: [],
      discoveryActivity: [],
      applicationActivity: [],
      careerMemoryAttention: [],
    });
  });

  it('returns Career Signals aggregation with schema validation and candidate isolation', async () => {
    const candidateA = candidateId('cand-sig-api-a');
    const candidateB = candidateId('cand-sig-api-b');
    const candRepo = new CandidateRepository(database);
    candRepo.createCandidate(candidateA);
    candRepo.createCandidate(candidateB);

    const resA = await app.inject({
      method: 'GET',
      url: `/candidates/${candidateA}/career-signals`,
    });

    expect(resA.statusCode).toBe(200);
    const bodyA: unknown = resA.json();
    expect(Value.Check(CareerSignalsResponseSchema, bodyA)).toBe(true);
    expect(bodyA).toMatchObject({
      candidateId: candidateA,
      activeOpportunityCount: 0,
      repeatedGaps: [],
      strongAlignments: [],
      transferableCapabilities: [],
      eligibilityUncertainties: [],
      eligibilityBlockers: [],
      evidenceGaps: [],
      marketDemand: [],
    });
  });

  it('manages Applications V1 lifecycle via API with schema validation and candidate isolation', async () => {
    const candidateA = candidateId('cand-app-api-a');
    const candidateB = candidateId('cand-app-api-b');
    const opp1 = opportunityId('opp-app-api-1');
    const snap1 = snapshotId('snap-app-api-1');

    const candRepo = new CandidateRepository(database);
    candRepo.createCandidate(candidateA);
    candRepo.createCandidate(candidateB);

    const oppRepo = new OpportunityRepository(database);
    oppRepo.createOpportunity(opp1);
    oppRepo.appendSnapshot({
      id: snap1,
      opportunityId: opp1,
      title: 'Principal Backend Systems Architect',
      organization: 'Orbit Cloud',
      content: 'Cloud platform lead',
      fingerprint: 'fp-snap-app-api-1',
    });
    recordTestDiscoveryMatch(candidateA, opp1, 'api-app-1');

    // 1. Create Application
    const createRes = await app.inject({
      method: 'POST',
      url: `/candidates/${candidateA}/applications`,
      payload: {
        opportunityId: opp1,
        status: 'Preparing',
        note: 'Reviewing cloud architecture notes',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createdApp = createRes.json<{
      id: string;
      status: string;
      note: string;
      opportunity: { title: string };
      updatedAt: string;
    }>();
    expect(createdApp.status).toBe('Preparing');
    expect(createdApp.note).toBe('Reviewing cloud architecture notes');
    expect(createdApp.opportunity.title).toBe(
      'Principal Backend Systems Architect',
    );

    // 2. Duplicate Application creation should return 409
    const dupRes = await app.inject({
      method: 'POST',
      url: `/candidates/${candidateA}/applications`,
      payload: {
        opportunityId: opp1,
        status: 'Saved',
      },
    });
    expect(dupRes.statusCode).toBe(409);

    // 3. Update Application Status to Applied
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/candidates/${candidateA}/applications/${createdApp.id}`,
      payload: {
        status: 'Applied',
        expectedUpdatedAt: createdApp.updatedAt,
        followUpDueAt: new Date(Date.now() + 86400000).toISOString(),
        followUpNote: 'Check in on referral',
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updatedApp = updateRes.json<{
      status: string;
      submittedAt: string;
      followUpDueAt: string;
      updatedAt: string;
    }>();
    expect(updatedApp.status).toBe('Applied');
    expect(updatedApp.submittedAt).not.toBeNull();

    // 4. Invalid Status Transition should return 400
    const invalidRes = await app.inject({
      method: 'PATCH',
      url: `/candidates/${candidateA}/applications/${createdApp.id}`,
      payload: {
        status: 'Saved',
        expectedUpdatedAt: updatedApp.updatedAt,
      },
    });
    expect(invalidRes.statusCode).toBe(400);

    // 5. Candidate B cannot read Candidate A's application
    const isolateRes = await app.inject({
      method: 'GET',
      url: `/candidates/${candidateB}/applications/${createdApp.id}`,
    });
    expect(isolateRes.statusCode).toBe(404);

    const isolateUpdateRes = await app.inject({
      method: 'PATCH',
      url: `/candidates/${candidateB}/applications/${createdApp.id}`,
      payload: {
        status: 'Withdrawn',
        expectedUpdatedAt: updatedApp.updatedAt,
      },
    });
    expect(isolateUpdateRes.statusCode).toBe(404);

    const isolateEventRes = await app.inject({
      method: 'POST',
      url: `/candidates/${candidateB}/applications/${createdApp.id}/events`,
      payload: { eventType: 'candidate_activity', detail: 'cross-candidate' },
    });
    expect(isolateEventRes.statusCode).toBe(404);

    // 6. List Applications for Candidate A
    const listRes = await app.inject({
      method: 'GET',
      url: `/candidates/${candidateA}/applications`,
    });
    expect(listRes.statusCode).toBe(200);
    const listData = listRes.json<{
      data: Array<{ id: string; status: string }>;
    }>().data;
    expect(listData).toHaveLength(1);
    expect(listData[0]!.id).toBe(createdApp.id);
    expect(listData[0]!.status).toBe('Applied');

    const listBRes = await app.inject({
      method: 'GET',
      url: `/candidates/${candidateB}/applications`,
    });
    expect(listBRes.statusCode).toBe(200);
    expect(listBRes.json<{ data: unknown[] }>().data).toEqual([]);

    const beforeReads = {
      applications: database
        .sqlite!.prepare('select count(*) as count from applications')
        .get() as { count: number },
      events: database
        .sqlite!.prepare('select count(*) as count from application_events')
        .get() as { count: number },
    };
    for (const url of [
      `/candidates/${candidateA}/today`,
      `/opportunities?candidateId=${candidateA}`,
      `/opportunities/${opp1}?candidateId=${candidateA}`,
      `/candidates/${candidateA}/applications`,
      `/candidates/${candidateA}/applications/${createdApp.id}`,
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
    expect(
      database
        .sqlite!.prepare('select count(*) as count from applications')
        .get(),
    ).toEqual(beforeReads.applications);
    expect(
      database
        .sqlite!.prepare('select count(*) as count from application_events')
        .get(),
    ).toEqual(beforeReads.events);
  });
});

describe('Cloud identity and candidate isolation', () => {
  let directory: string;
  let database: DatabaseHandle;
  let cloudApp: Awaited<ReturnType<typeof createApiApp>>;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'oca-cloud-api-'));
    database = openDatabase(join(directory, 'cloud.sqlite'));
    applyMigrations(database);
    cloudApp = await createApiApp({
      config: {
        environment: 'test',
        databaseEngine: 'sqlite',
        databasePath: database.path!,
        migrationMode: 'auto',
        host: '127.0.0.1',
        port: 3000,
        webOrigin: 'https://app.rolevia.test',
        identityMode: 'cloud',
        sessionTtlHours: 24,
      },
      database,
      logger: false,
    });
  });

  afterEach(async () => {
    await cloudApp.close();
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function registerBearer(email: string) {
    const response = await cloudApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email,
        password: 'correct horse battery staple',
        transport: 'bearer',
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{
      token: string;
      session: { primaryCandidateId: string; user: { id: string } };
    }>();
  }

  it('enforces the User/Candidate authorization matrix before route handlers', async () => {
    const accountA = await registerBearer('user-a@example.com');
    const accountB = await registerBearer('USER-B@example.com');
    const authorization = `Bearer ${accountA.token}`;

    const ownRoutes = [
      `/candidates/${accountA.session.primaryCandidateId}/profile`,
      `/candidates/${accountA.session.primaryCandidateId}/search-targets`,
      `/candidates/${accountA.session.primaryCandidateId}/discovery-runs`,
      `/candidates/${accountA.session.primaryCandidateId}/today`,
      `/candidates/${accountA.session.primaryCandidateId}/applications`,
      `/candidates/${accountA.session.primaryCandidateId}/career-signals`,
      `/opportunities?candidateId=${accountA.session.primaryCandidateId}`,
    ];
    for (const url of ownRoutes) {
      const response = await cloudApp.inject({
        method: 'GET',
        url,
        headers: { authorization },
      });
      expect(response.statusCode, url).toBe(200);
    }

    const foreignRoutes = [
      `/candidates/${accountB.session.primaryCandidateId}/profile`,
      `/candidates/${accountB.session.primaryCandidateId}/search-targets`,
      `/candidates/${accountB.session.primaryCandidateId}/discovery-runs`,
      `/candidates/${accountB.session.primaryCandidateId}/today`,
      `/candidates/${accountB.session.primaryCandidateId}/applications`,
      `/candidates/${accountB.session.primaryCandidateId}/career-signals`,
      `/opportunities?candidateId=${accountB.session.primaryCandidateId}`,
      `/opportunities/known-shared-id?candidateId=${accountB.session.primaryCandidateId}`,
    ];
    for (const url of foreignRoutes) {
      const response = await cloudApp.inject({
        method: 'GET',
        url,
        headers: { authorization },
      });
      expect(response.statusCode, url).toBe(403);
      expect(response.json()).toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
    }

    const mutation = await cloudApp.inject({
      method: 'POST',
      url: `/candidates/${accountB.session.primaryCandidateId}/claims`,
      headers: { authorization },
      payload: {
        kind: 'skill',
        value: 'Must not cross tenant boundary',
        state: 'UNKNOWN',
      },
    });
    expect(mutation.statusCode).toBe(403);

    const unauthenticated = await cloudApp.inject({
      method: 'GET',
      url: `/candidates/${accountA.session.primaryCandidateId}/profile`,
    });
    expect(unauthenticated.statusCode).toBe(401);
  });

  it('normalizes email, persists only token hashes, expires and revokes sessions', async () => {
    const account = await registerBearer('Person@Example.COM');
    const stored = database
      .sqlite!.prepare('select normalized_email from users where id = ?')
      .get(account.session.user.id) as { normalized_email: string };
    expect(stored.normalized_email).toBe('person@example.com');

    const tokenHash = createHash('sha256')
      .update(account.token, 'utf8')
      .digest('hex');
    const storedSession = database
      .sqlite!.prepare('select token_hash from sessions where token_hash = ?')
      .get(tokenHash) as { token_hash: string };
    expect(storedSession.token_hash).toBe(tokenHash);
    expect(storedSession.token_hash).not.toContain(account.token);

    const loggedOut = await cloudApp.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${account.token}` },
    });
    expect(loggedOut.statusCode).toBe(200);
    expect(loggedOut.json()).toEqual({ revoked: true });
    expect(
      (
        await cloudApp.inject({
          method: 'GET',
          url: '/auth/session',
          headers: { authorization: `Bearer ${account.token}` },
        })
      ).statusCode,
    ).toBe(401);

    const expiring = await registerBearer('expiring@example.com');
    const expiringHash = createHash('sha256')
      .update(expiring.token, 'utf8')
      .digest('hex');
    database
      .sqlite!.prepare(
        'update sessions set expires_at = 0 where token_hash = ?',
      )
      .run(expiringHash);
    expect(
      (
        await cloudApp.inject({
          method: 'GET',
          url: '/auth/session',
          headers: { authorization: `Bearer ${expiring.token}` },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('allows credentialed browser CORS only from the configured origin', async () => {
    const allowed = await cloudApp.inject({
      method: 'OPTIONS',
      url: '/auth/session',
      headers: {
        origin: 'https://app.rolevia.test',
        'access-control-request-method': 'GET',
      },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://app.rolevia.test',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(allowed.headers['access-control-allow-methods']).toContain('PATCH');
    expect(allowed.headers['access-control-allow-methods']).toContain('DELETE');

    const patchAllowed = await cloudApp.inject({
      method: 'OPTIONS',
      url: '/candidates/candidate-1/applications/application-1',
      headers: {
        origin: 'https://app.rolevia.test',
        'access-control-request-method': 'PATCH',
      },
    });
    expect(patchAllowed.statusCode).toBe(204);
    expect(patchAllowed.headers['access-control-allow-origin']).toBe(
      'https://app.rolevia.test',
    );

    const denied = await cloudApp.inject({
      method: 'OPTIONS',
      url: '/auth/session',
      headers: {
        origin: 'https://attacker.example',
        'access-control-request-method': 'GET',
      },
    });
    expect(denied.headers['access-control-allow-origin']).not.toBe(
      'https://attacker.example',
    );
    expect(denied.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('supports HttpOnly browser sessions, origin-protected logout, and generic login failures', async () => {
    const registered = await cloudApp.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { origin: 'https://app.rolevia.test' },
      payload: {
        email: 'browser@example.com',
        password: 'correct horse battery staple',
        transport: 'cookie',
      },
    });
    expect(registered.statusCode).toBe(201);
    const cookie = registered.headers['set-cookie'];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    expect(
      (
        await cloudApp.inject({
          method: 'GET',
          url: '/auth/session',
          headers: { cookie, origin: 'https://app.rolevia.test' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await cloudApp.inject({
          method: 'POST',
          url: '/auth/logout',
          headers: { cookie, origin: 'https://attacker.example' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await cloudApp.inject({
          method: 'POST',
          url: '/auth/logout',
          headers: { cookie, origin: 'https://app.rolevia.test' },
        })
      ).statusCode,
    ).toBe(200);

    for (const email of ['browser@example.com', 'missing@example.com']) {
      const failure = await cloudApp.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email,
          password: 'definitely incorrect',
          transport: 'bearer',
        },
      });
      expect(failure.statusCode).toBe(401);
      expect(failure.json()).toMatchObject({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'The email or password is invalid.',
        },
      });
    }

    const signedIn = await cloudApp.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: 'https://app.rolevia.test' },
      payload: {
        email: 'BROWSER@EXAMPLE.COM',
        password: 'correct horse battery staple',
        transport: 'cookie',
      },
    });
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.headers['set-cookie']).toContain('HttpOnly');

    const duplicate = await cloudApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'browser@example.com',
        password: 'correct horse battery staple',
        transport: 'bearer',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({
      error: {
        code: 'ACCOUNT_NOT_CREATED',
        message: 'The account could not be created.',
      },
    });
  });

  it('keeps the trusted self-hosted identity explicit and rejects another Candidate', async () => {
    const localDirectory = mkdtempSync(join(tmpdir(), 'oca-local-identity-'));
    const localDatabase = openDatabase(join(localDirectory, 'local.sqlite'));
    applyMigrations(localDatabase);
    const trusted = candidateId('candidate-trusted-local');
    const other = candidateId('candidate-not-trusted');
    const candidates = new CandidateRepository(localDatabase);
    await candidates.createCandidate(trusted);
    await candidates.createCandidate(other);
    const localApp = await createApiApp({
      config: {
        environment: 'production',
        databaseEngine: 'sqlite',
        databasePath: localDatabase.path!,
        migrationMode: 'auto',
        host: '127.0.0.1',
        port: 3000,
        webOrigin: 'http://localhost:5173',
        identityMode: 'self-hosted',
        trustedCandidateId: trusted,
        sessionTtlHours: 168,
      },
      database: localDatabase,
      closeDatabaseOnClose: false,
      logger: false,
    });
    try {
      expect(
        (
          await localApp.inject({
            method: 'GET',
            url: `/candidates/${trusted}/profile`,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await localApp.inject({
            method: 'GET',
            url: `/candidates/${other}/profile`,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await localApp.inject({ method: 'GET', url: '/auth/session' }))
          .statusCode,
      ).toBe(403);
    } finally {
      await localApp.close();
      localDatabase.close();
      rmSync(localDirectory, { recursive: true, force: true });
    }
  });
});
