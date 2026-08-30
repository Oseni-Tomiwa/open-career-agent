import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiProductRepository,
  ApiProductRepositoryError,
} from './apiProductRepository.js';

const observedAt = '2026-08-29T10:00:00.000Z';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function listBody() {
  return {
    data: [
      {
        id: 'opp-1',
        latestTitle: 'Platform Engineer',
        latestOrganization: 'Northstar Labs',
        latestLocation: 'Lagos, Nigeria',
        latestWorkModel: 'Remote',
        latestCompensation: 'NGN 20m',
        latestObservedAt: observedAt,
        latestSnapshotId: 'snapshot-1',
        sourceSystems: ['greenhouse'],
        eligibilityState: 'eligible',
        fitLevel: 'strong',
        qualityLevel: 'moderate',
        decisionState: 'high-priority',
      },
    ],
  };
}

function detailBody(options: { readonly evaluated?: boolean } = {}) {
  const evaluated = options.evaluated ?? true;
  return {
    opportunity: { id: 'opp-1', createdAt: observedAt },
    snapshots: [
      {
        id: 'snapshot-1',
        opportunityId: 'opp-1',
        title: 'Platform Engineer',
        organization: 'Northstar Labs',
        location: 'Lagos, Nigeria',
        workModel: 'Remote',
        employmentType: 'Full-time',
        compensation: 'NGN 20m',
        content: 'Build reliable cloud platforms.\n\nNo HTML is executed.',
        observedAt,
        ...(evaluated
          ? {
              eligibility: {
                state: 'eligible',
                engineVersion: 'eligibility-v1',
                findings: [
                  {
                    id: 'finding-eligibility',
                    dimension: 'work_authorization',
                    state: 'eligible',
                    summary: 'Work authorization is supported.',
                    confidence: 'high',
                    evidence: [
                      {
                        id: 'evidence-1',
                        evidenceType: 'candidate-claim',
                        sourceReference: 'claim:work-authorization',
                        excerpt: 'Authorized to work in Nigeria.',
                        state: 'candidate-confirmed',
                      },
                    ],
                  },
                ],
              },
              fit: {
                level: 'strong',
                summary: 'Required capabilities are supported.',
                engineVersion: 'fit-v1',
                findings: [
                  {
                    id: 'finding-fit',
                    dimension: 'competency',
                    label: 'AWS',
                    state: 'MATCH',
                    modality: 'required',
                    requirement: 'AWS',
                    explanation: 'Direct AWS evidence exists.',
                    confidence: 'high',
                    evidence: [
                      {
                        id: 'evidence-2',
                        evidenceType: 'project',
                        sourceReference: 'project:cloud',
                        excerpt: 'Deployed workloads on AWS.',
                        state: 'source-verified',
                      },
                    ],
                  },
                ],
              },
              quality: {
                level: 'moderate',
                summary: 'The listing is usable with minor uncertainty.',
                engineVersion: 'quality-v1',
                freshnessBucket: 'recent',
                evaluatedAt: observedAt,
                findings: [
                  {
                    id: 'finding-quality',
                    dimension: 'source_trust',
                    label: 'Source trust',
                    state: 'ADEQUATE',
                    importance: 'important',
                    explanation: 'The source is recognized.',
                    evidence: [],
                  },
                ],
              },
              decision: {
                id: 'decision-1',
                state: 'high-priority',
                action: 'apply',
                explanation: 'Eligible with strong Fit and usable Quality.',
                engineVersion: 'decision-v1',
                inputFingerprint: 'fingerprint-1',
                reasonCodes: ['STRONG_REQUIRED_FIT'],
                reasons: [
                  {
                    code: 'STRONG_REQUIRED_FIT',
                    findingIds: ['finding-fit'],
                  },
                ],
                evaluatedAt: observedAt,
              },
            }
          : {}),
      },
    ],
  };
}

describe('ApiProductRepository', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps lightweight summaries and coherent detail intelligence without deriving scores', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(listBody()))
      .mockResolvedValueOnce(response(detailBody()));
    const repository = new ApiProductRepository(
      'http://api.test',
      'candidate-1',
      fetcher,
    );

    const snapshot = await repository.getSnapshot();
    expect(snapshot.opportunities[0]).toMatchObject({
      role: 'Platform Engineer',
      company: { name: 'Northstar Labs' },
      location: 'Lagos, Nigeria',
      workModel: 'Remote',
      eligibility: 'eligible',
      fit: 'strong',
      fitScore: null,
      quality: 'moderate',
      qualityScore: null,
      decision: 'high-priority',
    });

    const opportunity = await repository.getOpportunity('opp-1');
    expect(opportunity).toMatchObject({
      eligibility: 'eligible',
      fit: 'strong',
      quality: 'moderate',
      decision: 'high-priority',
      explanation: 'Eligible with strong Fit and usable Quality.',
      nextAction: 'Apply',
    });
    expect(opportunity?.eligibilitySignals[0]).toMatchObject({
      state: 'pass',
      evidenceIds: ['evidence-1'],
    });
    expect(opportunity?.fitSignals[0]).toMatchObject({
      state: 'matched',
      evidenceIds: ['evidence-2'],
    });
    expect(opportunity?.qualitySignals[0]).toMatchObject({
      state: 'neutral',
    });
    expect(opportunity?.evidence).toHaveLength(2);
    expect(fetcher).toHaveBeenLastCalledWith(
      'http://api.test/opportunities/opp-1?candidateId=candidate-1',
      { headers: { accept: 'application/json' } },
    );
  });

  it('preserves missing dimensions and Evidence as not evaluated instead of inventing results', async () => {
    const repository = new ApiProductRepository(
      'http://api.test',
      'candidate-1',
      vi.fn<typeof fetch>().mockResolvedValue(response(detailBody({ evaluated: false }))),
    );
    const opportunity = await repository.getOpportunity('opp-1');
    expect(opportunity).toMatchObject({
      eligibility: null,
      fit: null,
      quality: null,
      decision: null,
      decisionLabel: 'Not evaluated',
      evidence: [],
      eligibilitySignals: [],
      fitSignals: [],
      qualitySignals: [],
    });
  });

  it('uses browser fetch without a receiver and treats blank optional fields as missing', async () => {
    const body = detailBody();
    Object.assign(body.snapshots[0]!, {
      workModel: '',
      employmentType: '   ',
      compensation: '',
    });
    const fetcher = vi.fn(function (this: unknown) {
      expect(this).toBeUndefined();
      return Promise.resolve(response(body));
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetcher);

    const repository = new ApiProductRepository(
      'http://api.test',
      'candidate-1',
    );
    const opportunity = await repository.getOpportunity('opp-1');

    expect(opportunity).toMatchObject({
      workModel: 'Work model not stated',
      remotePolicy: 'Not stated',
      employmentType: 'Not stated',
      compensation: null,
    });
  });

  it.each([
    'high-priority',
    'consider',
    'investigate',
    'low-priority',
    'blocked',
  ] as const)('preserves the canonical Decision state %s', async (state) => {
    const body = listBody();
    body.data[0]!.decisionState = state;
    const repository = new ApiProductRepository(
      'http://api.test',
      'candidate-1',
      vi.fn<typeof fetch>().mockResolvedValue(response(body)),
    );
    expect((await repository.getSnapshot()).opportunities[0]?.decision).toBe(
      state,
    );
  });

  it.each([
    'eligible',
    'ineligible',
    'investigate',
    'unknown',
  ] as const)('preserves the canonical Eligibility state %s', async (state) => {
    const body = listBody();
    body.data[0]!.eligibilityState = state;
    const repository = new ApiProductRepository(
      'http://api.test',
      'candidate-1',
      vi.fn<typeof fetch>().mockResolvedValue(response(body)),
    );
    expect(
      (await repository.getSnapshot()).opportunities[0]?.eligibility,
    ).toBe(state);
  });

  it('propagates a useful API error', async () => {
    const repository = new ApiProductRepository(
      'http://api.test',
      'candidate-1',
      vi.fn<typeof fetch>().mockResolvedValue(response({ error: {} }, 503)),
    );
    await expect(repository.getSnapshot()).rejects.toEqual(
      new ApiProductRepositoryError(
        'The opportunity API returned status 503.',
        503,
      ),
    );
  });
});
