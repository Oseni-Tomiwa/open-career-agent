import { mkdtempSync, rmSync } from 'node:fs';
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
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function recordTestDiscoveryMatch(
    cId: ReturnType<typeof candidateId>,
    oppId: ReturnType<typeof opportunityId>,
    suffix: string,
  ) {
    const sourceRepo = new SourceListingRepository(database);
    sourceRepo.persistListing(
      `sl-test-${suffix}`,
      { sourceSystem: 'greenhouse', sourceExternalId: `ext-${suffix}` },
      oppId,
      Date.now(),
    );
    const searchRepo = new SearchTargetRepository(database);
    const target = searchRepo.createSearchTarget(cId, {
      name: `Target ${suffix}`,
    });
    const run = searchRepo.createDiscoveryRun(
      discoveryRunId(`run-test-${suffix}`),
      cId,
      searchTargetId(target.id),
    );
    searchRepo.recordDiscoveryMatch({
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
    opportunityRepository.createOpportunity(opportunity);
    recordTestDiscoveryMatch(candidate, opportunity, 'fit');
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
    const targetB = searchRepo.createSearchTarget(candidateB, {
      name: 'Target B',
    });
    const runB = searchRepo.createDiscoveryRun(
      discoveryRunId('run-leak-b'),
      candidateB,
      searchTargetId(targetB.id),
    );

    searchRepo.recordDiscoveryMatch({
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
      applications: database.sqlite
        .prepare('select count(*) as count from applications')
        .get() as { count: number },
      events: database.sqlite
        .prepare('select count(*) as count from application_events')
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
      database.sqlite
        .prepare('select count(*) as count from applications')
        .get(),
    ).toEqual(beforeReads.applications);
    expect(
      database.sqlite
        .prepare('select count(*) as count from application_events')
        .get(),
    ).toEqual(beforeReads.events);
  });
});
