import { describe, expect, it } from 'vitest';

import { evaluateDiscoveryMatch, type SearchTarget } from './search.js';

function baseTarget(overrides: Partial<SearchTarget> = {}): SearchTarget {
  return {
    id: 'st-1',
    candidateId: 'cand-1',
    name: 'Backend Target',
    enabled: true,
    targetRoles: ['Backend Engineer', 'Platform Engineer'],
    skills: ['TypeScript', 'Node.js'],
    locations: ['Germany', 'Netherlands'],
    locationIsHardFilter: false,
    workModels: ['remote', 'hybrid'],
    workModelIsHardFilter: false,
    seniorityLevels: ['mid', 'senior'],
    seniorityIsHardFilter: false,
    employmentTypes: ['full-time'],
    employmentTypeIsHardFilter: false,
    requiresSponsorship: null,
    willingToRelocate: null,
    minSalary: 100000,
    currency: 'EUR',
    freshnessDays: 30,
    requiredTerms: ['TypeScript'],
    excludedTerms: ['Internship'],
    sources: [{ sourceSystem: 'greenhouse', boardId: 'figma' }],
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('evaluateDiscoveryMatch deterministic matcher', () => {
  it('rejects disabled targets', () => {
    const result = evaluateDiscoveryMatch(baseTarget({ enabled: false }), {
      title: 'Backend Engineer',
      location: 'Germany',
      content: 'TypeScript',
    });
    expect(result.isMatch).toBe(false);
    expect(result.rejectionReason).toBe('TARGET_DISABLED');
  });

  it('rejects roles with excluded title or content terms', () => {
    const result = evaluateDiscoveryMatch(
      baseTarget({ excludedTerms: ['Senior'] }),
      {
        title: 'Senior Backend Engineer',
        location: 'Germany',
        content: 'TypeScript',
      },
    );
    expect(result.isMatch).toBe(false);
    expect(result.rejectionReason).toBe('EXCLUDED_TERM: Senior');
  });

  it('accepts exact and normalized role title matches', () => {
    const result = evaluateDiscoveryMatch(baseTarget(), {
      title: 'Senior Backend Engineer',
      location: 'Germany',
      content: 'TypeScript',
    });
    expect(result.isMatch).toBe(true);
    expect(result.matchReasons).toContain(
      'Matched role target: Backend Engineer',
    );
  });

  it('handles hard location filters versus location preferences', () => {
    const hardTarget = baseTarget({
      locations: ['Germany'],
      locationIsHardFilter: true,
    });
    const rejected = evaluateDiscoveryMatch(hardTarget, {
      title: 'Backend Engineer',
      location: 'United States',
      content: 'TypeScript',
    });
    expect(rejected.isMatch).toBe(false);
    expect(rejected.rejectionReason).toContain('LOCATION_HARD_REJECT');

    const prefTarget = baseTarget({
      locations: ['Germany'],
      locationIsHardFilter: false,
    });
    const acceptedPref = evaluateDiscoveryMatch(prefTarget, {
      title: 'Backend Engineer',
      location: 'United States',
      content: 'TypeScript',
    });
    expect(acceptedPref.isMatch).toBe(true);
    expect(acceptedPref.retainedUnresolved).toContain(
      'Location preference unmatched: United States',
    );
  });

  it('handles UNKNOWN location under hard location filter without false rejection', () => {
    const hardTarget = baseTarget({
      locations: ['Germany'],
      locationIsHardFilter: true,
    });
    const result = evaluateDiscoveryMatch(hardTarget, {
      title: 'Backend Engineer',
      location: null,
      content: 'TypeScript',
    });
    expect(result.isMatch).toBe(true);
    expect(result.retainedUnresolved).toContain(
      'Location unstated in opportunity',
    );
  });

  it('handles hard work model filters versus work model preferences', () => {
    const hardTarget = baseTarget({
      workModels: ['remote'],
      workModelIsHardFilter: true,
    });
    const rejected = evaluateDiscoveryMatch(hardTarget, {
      title: 'Backend Engineer',
      location: 'Germany',
      workModel: 'onsite',
      content: 'TypeScript',
    });
    expect(rejected.isMatch).toBe(false);
    expect(rejected.rejectionReason).toContain('WORK_MODEL_HARD_REJECT');

    const prefTarget = baseTarget({
      workModels: ['remote'],
      workModelIsHardFilter: false,
    });
    const accepted = evaluateDiscoveryMatch(prefTarget, {
      title: 'Backend Engineer',
      location: 'Germany',
      workModel: 'onsite',
      content: 'TypeScript',
    });
    expect(accepted.isMatch).toBe(true);
    expect(accepted.retainedUnresolved).toContain(
      'Work model preference unmatched: onsite',
    );
  });

  it('handles unstated compensation without treating missing salary as below minimum', () => {
    const result = evaluateDiscoveryMatch(baseTarget({ minSalary: 120000 }), {
      title: 'Backend Engineer',
      location: 'Germany',
      compensation: null,
      content: 'TypeScript',
    });
    expect(result.isMatch).toBe(true);
  });

  it('requires all required terms in title or content', () => {
    const result = evaluateDiscoveryMatch(
      baseTarget({ requiredTerms: ['TypeScript', 'Node.js'] }),
      {
        title: 'Backend Engineer',
        location: 'Germany',
        content: 'TypeScript only, no node.',
      },
    );
    expect(result.isMatch).toBe(false);
    expect(result.rejectionReason).toBe('REQUIRED_TERM_MISSING: Node.js');
  });
});
