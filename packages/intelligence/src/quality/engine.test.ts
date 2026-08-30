import { describe, expect, it } from 'vitest';

import {
  QualityEngine,
  aggregateQuality,
  nextFreshnessBoundary,
  type QualityEvaluationInput,
  type QualityFinding,
} from './engine.js';

const DAY = 86_400_000;
const evaluatedAt = new Date('2026-08-30T12:00:00.000Z');

function input(
  overrides: Partial<QualityEvaluationInput> = {},
): QualityEvaluationInput {
  return {
    evaluatedAt,
    snapshot: {
      id: 'snapshot-1',
      fingerprint: 'snapshot-fingerprint',
      observedAt: new Date(evaluatedAt.getTime() - 5 * DAY),
      title: 'Software Engineer',
      organization: 'Example Corp',
      content:
        'This is a complete full-time remote software engineering listing with clear responsibilities, qualifications, and operational details for applicants.',
      location: 'Remote — US only',
      workModel: 'remote',
      employmentType: 'full-time',
      compensation: '$120,000 - $150,000 per year',
    },
    sourceObservations: [
      {
        id: 'observation-1',
        sourceSystem: 'greenhouse',
        sourceExternalId: '123',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/123',
        observedAt: new Date(evaluatedAt.getTime() - DAY),
        sourceUpdatedAt: new Date(evaluatedAt.getTime() - 5 * DAY),
        listingLastSeenAt: new Date(evaluatedAt.getTime() - DAY),
        fingerprint: 'source-fingerprint',
        supportsSnapshot: true,
        title: 'Software Engineer',
        organization: 'Example Corp',
        location: 'Remote — US only',
        workModel: 'remote',
        employmentType: 'full-time',
        compensation: '$120,000 - $150,000 per year',
      },
    ],
    ...overrides,
  };
}

function finding(
  result: ReturnType<QualityEngine['evaluate']>,
  dimension: string,
) {
  return result.findings.find((item) => item.dimension === dimension);
}

describe('QualityEngine freshness and status', () => {
  const engine = new QualityEngine();

  it.each([
    [5, 'STRONG', 'recent'],
    [20, 'ADEQUATE', 'aging'],
    [45, 'WEAK', 'stale'],
    [75, 'RISK', 'very_stale'],
  ] as const)('classifies %i-day-old listing as %s', (age, state, bucket) => {
    const base = input();
    const result = engine.evaluate({
      ...base,
      sourceObservations: base.sourceObservations.map((item) => ({
        ...item,
        sourceUpdatedAt: new Date(evaluatedAt.getTime() - age * DAY),
      })),
    });
    expect(finding(result, 'freshness')?.state).toBe(state);
    expect(result.freshnessBucket).toBe(bucket);
  });

  it('makes explicit closure a critical risk', () => {
    const base = input();
    const result = engine.evaluate({
      ...base,
      sourceObservations: base.sourceObservations.map((item) => ({
        ...item,
        explicitStatus: 'closed' as const,
      })),
    });
    expect(finding(result, 'listing_status')?.state).toBe('RISK');
    expect(result.overallLevel).toBe('risk');
  });

  it('never converts age alone into confirmed closure', () => {
    const base = input();
    const result = engine.evaluate({
      ...base,
      evaluatedAt: new Date(evaluatedAt.getTime() + 100 * DAY),
    });
    expect(finding(result, 'listing_status')).toMatchObject({
      state: 'UNKNOWN',
    });
    expect(finding(result, 'listing_status')?.explanation).toContain(
      'Age alone',
    );
  });

  it('changes deterministically across freshness boundaries', () => {
    const base = input();
    const dayFive = engine.evaluate(base);
    const dayFortyFive = engine.evaluate({
      ...base,
      evaluatedAt: new Date(evaluatedAt.getTime() + 40 * DAY),
    });
    expect(dayFive.freshnessBucket).toBe('recent');
    expect(dayFortyFive.freshnessBucket).toBe('stale');
    expect(engine.evaluate(base)).toEqual(dayFive);
    expect(
      nextFreshnessBoundary(
        new Date(evaluatedAt.getTime() - 5 * DAY),
        evaluatedAt,
      ),
    ).toEqual(new Date(evaluatedAt.getTime() + 10 * DAY));
  });
});

describe('QualityEngine source, completeness, and transparency', () => {
  const engine = new QualityEngine();

  it('treats retained Greenhouse provenance as strong', () => {
    expect(finding(engine.evaluate(input()), 'source_confidence')?.state).toBe(
      'STRONG',
    );
  });

  it('keeps an unknown source unclassified rather than fabricating trust', () => {
    const base = input();
    const result = engine.evaluate({
      ...base,
      sourceObservations: base.sourceObservations.map((item) => ({
        ...item,
        sourceSystem: 'future-source',
      })),
    });
    expect(finding(result, 'source_confidence')?.state).toBe('UNKNOWN');
  });

  it('rates complete content strongly and near-empty content as risk', () => {
    expect(
      finding(engine.evaluate(input()), 'content_completeness')?.state,
    ).toBe('STRONG');
    const base = input();
    const result = engine.evaluate({
      ...base,
      snapshot: { ...base.snapshot, content: 'TBD' },
    });
    expect(finding(result, 'content_completeness')?.state).toBe('RISK');
    expect(result.overallLevel).toBe('risk');
  });

  it('does not mark an ordinary short listing as suspicious', () => {
    const base = input();
    const result = engine.evaluate({
      ...base,
      snapshot: {
        ...base.snapshot,
        content: 'Build useful software with our product team.',
      },
    });
    expect(finding(result, 'content_completeness')?.state).toBe('WEAK');
    expect(finding(result, 'content_integrity')?.state).toBe('STRONG');
    expect(result.overallLevel).not.toBe('risk');
  });

  it('separates explicit and absent compensation transparency', () => {
    expect(
      finding(engine.evaluate(input()), 'compensation_transparency')?.state,
    ).toBe('STRONG');
    const base = input();
    const result = engine.evaluate({
      ...base,
      snapshot: { ...base.snapshot, compensation: null },
    });
    expect(finding(result, 'compensation_transparency')?.state).toBe('WEAK');
    expect(result.overallLevel).toBe('strong');
  });

  it('evaluates location, work model, and employment type independently', () => {
    const clear = engine.evaluate(input());
    expect(finding(clear, 'location_clarity')?.state).toBe('STRONG');
    expect(finding(clear, 'work_model_clarity')?.state).toBe('STRONG');
    expect(finding(clear, 'employment_type_clarity')?.state).toBe('STRONG');

    const base = input();
    const unclear = engine.evaluate({
      ...base,
      snapshot: {
        ...base.snapshot,
        location: 'Remote',
        workModel: null,
        employmentType: null,
        content:
          'A detailed role description with responsibilities and qualifications but no working arrangement or engagement category.',
      },
    });
    expect(finding(unclear, 'location_clarity')?.state).toBe('WEAK');
    expect(finding(unclear, 'work_model_clarity')?.state).toBe('UNKNOWN');
    expect(finding(unclear, 'employment_type_clarity')?.state).toBe('UNKNOWN');
  });
});

describe('QualityEngine links, contradictions, history, and boundaries', () => {
  const engine = new QualityEngine();

  it('distinguishes valid, missing, and malformed application URLs', () => {
    expect(finding(engine.evaluate(input()), 'application_link')?.state).toBe(
      'STRONG',
    );
    const base = input();
    const missing = engine.evaluate({
      ...base,
      sourceObservations: base.sourceObservations.map((item) => ({
        ...item,
        sourceUrl: null,
      })),
    });
    expect(finding(missing, 'application_link')?.state).toBe('WEAK');
    expect(missing.overallLevel).not.toBe('risk');
    const malformed = engine.evaluate({
      ...base,
      sourceObservations: base.sourceObservations.map((item) => ({
        ...item,
        sourceUrl: 'not a url',
      })),
    });
    expect(finding(malformed, 'application_link')?.state).toBe('RISK');
    expect(malformed.overallLevel).toBe('risk');
  });

  it('surfaces same-state source contradictions with evidence', () => {
    const base = input();
    const result = engine.evaluate({
      ...base,
      sourceObservations: base.sourceObservations.map((item) => ({
        ...item,
        workModel: 'on-site',
      })),
    });
    expect(finding(result, 'contradictions')).toMatchObject({
      state: 'RISK',
      importance: 'critical',
    });
    expect(
      finding(result, 'contradictions')?.evidenceReferences,
    ).not.toHaveLength(0);
  });

  it('does not invent contradiction risk and does not penalize normal updates', () => {
    const base = input();
    const updated = {
      ...base.sourceObservations[0]!,
      id: 'observation-2',
      fingerprint: 'changed-state',
      supportsSnapshot: false,
    };
    const result = engine.evaluate({
      ...base,
      sourceObservations: [...base.sourceObservations, updated],
    });
    expect(finding(result, 'contradictions')?.state).toBe('STRONG');
    expect(finding(result, 'observation_history')?.state).toBe('UNKNOWN');
  });

  it('cannot vary with Candidate, Eligibility, or Fit because they are not engine inputs', () => {
    const keys = Object.keys(input()).sort();
    expect(keys).toEqual(['evaluatedAt', 'snapshot', 'sourceObservations']);
  });
});

describe('Quality aggregation invariants', () => {
  const item = (
    state: QualityFinding['state'],
    importance: QualityFinding['importance'],
  ): QualityFinding => ({
    dimension: `${state}-${importance}`,
    label: 'test',
    state,
    importance,
    explanation: 'test',
    evidenceReferences: [],
  });

  it('lets a critical risk dominate while minor transparency does not collapse quality', () => {
    expect(
      aggregateQuality([item('RISK', 'critical'), item('STRONG', 'important')]),
    ).toBe('risk');
    expect(
      aggregateQuality([
        item('STRONG', 'critical'),
        item('STRONG', 'important'),
        item('WEAK', 'transparency'),
      ]),
    ).toBe('strong');
  });
});
