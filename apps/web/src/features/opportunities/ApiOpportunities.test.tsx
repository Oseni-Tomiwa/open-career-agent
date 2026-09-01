import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { initialSeedSnapshot } from '../../data/seed.js';
import type {
  CareerMemoryProfile,
  Opportunity,
  ProductRepository,
} from '../../data/types.js';
import { renderProduct } from '../../test/render.js';
import { OpportunitiesPage } from './OpportunitiesPage.js';
import { OpportunityDetailPage } from './OpportunityDetailPage.js';

function emptyCareerMemory(): CareerMemoryProfile {
  return {
    candidate: {
      id: 'candidate-1',
      createdAt: '2026-08-29T10:00:00.000Z',
      updatedAt: '2026-08-29T10:00:00.000Z',
    },
    claims: [],
  };
}

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    ...initialSeedSnapshot.opportunities[0]!,
    id: 'api-opportunity',
    role: 'API Platform Engineer',
    company: {
      id: 'api-company',
      name: 'API Systems',
      initials: 'AS',
      mark: 'none',
      color: '#475569',
    },
    location: 'Lagos, Nigeria',
    workModel: 'Hybrid',
    source: 'Ashby',
    eligibility: 'ineligible',
    eligibilityLabel: 'Ineligible due to work authorization requirement.',
    fit: 'strong',
    fitScore: null,
    quality: 'moderate',
    qualityScore: null,
    decision: 'blocked',
    decisionLabel: 'Do not apply (Ineligible)',
    requirements: ['TypeScript', 'Node.js', 'System Architecture'],
    eligibilitySignals: [
      {
        id: 'sig-elig-1',
        label: 'Work authorization',
        state: 'blocker',
        summary: 'Requires existing citizenship or permanent residency.',
        evidenceIds: ['ev-elig-1'],
        confidence: 'high',
      },
    ],
    fitSignals: [
      {
        id: 'sig-fit-1',
        label: 'Backend Architecture',
        state: 'matched',
        summary: '5+ years experience building Node.js microservices.',
        evidenceIds: ['ev-fit-1'],
        impact: 'High relevance',
      },
    ],
    qualitySignals: [
      {
        id: 'sig-qual-1',
        label: 'Salary transparency',
        state: 'neutral',
        summary: 'Compensation range provided.',
        evidenceIds: ['ev-qual-1'],
      },
    ],
    evidence: [
      {
        id: 'ev-elig-1',
        label: 'Work auth listing requirement',
        source: 'Ashby Listing',
        excerpt: 'Must be authorized to work in Nigeria without sponsorship.',
        state: 'source-verified',
        observedAt: '2026-08-28T09:00:00Z',
      },
    ],
    ...overrides,
  };
}

function repository(item: Opportunity): ProductRepository {
  return {
    dataSource: 'api',
    getSnapshot: () =>
      Promise.resolve({
        ...initialSeedSnapshot,
        opportunities: [item],
      }),
    getOpportunity: (id: string) =>
      Promise.resolve(id === item.id ? item : null),
    setOpportunityDecision: () => Promise.reject(new Error('unsupported')),
    saveSearchPreferences: () => Promise.reject(new Error('unsupported')),
    getCareerMemory: () => Promise.resolve(emptyCareerMemory()),
    createCandidateClaim: () => Promise.reject(new Error('unsupported')),
    createCandidateClaimsBatch: () => Promise.reject(new Error('unsupported')),
    updateCandidateClaim: () => Promise.reject(new Error('unsupported')),
    attachClaimEvidence: () => Promise.reject(new Error('unsupported')),
    replaceCandidateClaim: () => Promise.reject(new Error('unsupported')),
    retireCandidateClaim: () => Promise.reject(new Error('unsupported')),
    getCareerProfileReevaluation: () =>
      Promise.reject(new Error('unsupported')),
    getSearchTargets: () => Promise.reject(new Error('unsupported')),
    createSearchTarget: () => Promise.reject(new Error('unsupported')),
    updateSearchTarget: () => Promise.reject(new Error('unsupported')),
    deleteSearchTarget: () => Promise.reject(new Error('unsupported')),
    runDiscovery: () => Promise.reject(new Error('unsupported')),
    getDiscoveryRuns: () => Promise.reject(new Error('unsupported')),
    getTodayDashboard: () => Promise.reject(new Error('unsupported')),
    getCareerSignals: () => Promise.reject(new Error('unsupported')),
    getApplications: () => Promise.resolve([]),
    getApplication: () => Promise.resolve(null),
    createApplication: () => Promise.reject(new Error('unsupported')),
    updateApplication: () => Promise.reject(new Error('unsupported')),
    addApplicationEvent: () => Promise.reject(new Error('unsupported')),
  };
}

describe('API-mode Opportunities UI', () => {
  it('renders API-shaped list data and keeps blocked Decision distinct from Eligibility ineligible', async () => {
    const item = opportunity();
    renderProduct(<OpportunitiesPage />, ['/opportunities'], repository(item));
    expect(
      await screen.findByRole('heading', { name: 'API Platform Engineer' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Ineligible').length).toBeGreaterThan(0);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('renders canonical dimensions, Evidence, and the renamed manual action', async () => {
    const item = opportunity();
    renderProduct(
      <Routes>
        <Route
          element={<OpportunityDetailPage />}
          path="/opportunities/:opportunityId"
        />
      </Routes>,
      ['/opportunities/api-opportunity'],
      repository(item),
    );
    expect(
      await screen.findByRole('heading', { name: 'API Platform Engineer' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Do not apply (Ineligible)')).toBeInTheDocument();
    expect(
      screen.getByText('Ineligible due to work authorization requirement.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Fit: strong')).toBeInTheDocument();
    expect(screen.getByLabelText('Quality: moderate')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Review evidence for this opportunity',
      }),
    ).toBeInTheDocument();
  });

  it('renders investigate and missing dimensions honestly', async () => {
    const item = opportunity({
      eligibility: 'investigate',
      eligibilityLabel: 'Needs investigation regarding remote policy.',
      fit: 'weak',
      quality: 'risk',
      decision: 'investigate',
      decisionLabel: 'Investigate evidence',
    });
    renderProduct(
      <Routes>
        <Route
          element={<OpportunityDetailPage />}
          path="/opportunities/:opportunityId"
        />
      </Routes>,
      ['/opportunities/api-opportunity'],
      repository(item),
    );
    expect((await screen.findAllByText('Investigate')).length).toBeGreaterThan(
      0,
    );
  });

  it('renders an API error state', async () => {
    const failing: ProductRepository = {
      dataSource: 'api',
      getSnapshot: () =>
        Promise.reject(new Error('The opportunity API is unavailable.')),
      getOpportunity: () => Promise.resolve(null),
      setOpportunityDecision: () => Promise.reject(new Error('unsupported')),
      saveSearchPreferences: () => Promise.reject(new Error('unsupported')),
      getCareerMemory: () => Promise.reject(new Error('unsupported')),
      createCandidateClaim: () => Promise.reject(new Error('unsupported')),
      createCandidateClaimsBatch: () =>
        Promise.reject(new Error('unsupported')),
      updateCandidateClaim: () => Promise.reject(new Error('unsupported')),
      attachClaimEvidence: () => Promise.reject(new Error('unsupported')),
      replaceCandidateClaim: () => Promise.reject(new Error('unsupported')),
      retireCandidateClaim: () => Promise.reject(new Error('unsupported')),
      getCareerProfileReevaluation: () =>
        Promise.reject(new Error('unsupported')),
      getSearchTargets: () => Promise.reject(new Error('unsupported')),
      createSearchTarget: () => Promise.reject(new Error('unsupported')),
      updateSearchTarget: () => Promise.reject(new Error('unsupported')),
      deleteSearchTarget: () => Promise.reject(new Error('unsupported')),
      runDiscovery: () => Promise.reject(new Error('unsupported')),
      getDiscoveryRuns: () => Promise.reject(new Error('unsupported')),
      getTodayDashboard: () => Promise.reject(new Error('unsupported')),
      getCareerSignals: () => Promise.reject(new Error('unsupported')),
      getApplications: () => Promise.reject(new Error('unsupported')),
      getApplication: () => Promise.reject(new Error('unsupported')),
      createApplication: () => Promise.reject(new Error('unsupported')),
      updateApplication: () => Promise.reject(new Error('unsupported')),
      addApplicationEvent: () => Promise.reject(new Error('unsupported')),
    };
    renderProduct(<OpportunitiesPage />, ['/opportunities'], failing);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The opportunity API is unavailable.',
    );
  });
});
