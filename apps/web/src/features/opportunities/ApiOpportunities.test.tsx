import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { initialSeedSnapshot } from '../../data/seed.js';
import type {
  Decision,
  Opportunity,
  ProductRepository,
  ProductSnapshot,
  SearchPreferences,
} from '../../data/types.js';
import { renderProduct } from '../../test/render.js';
import { OpportunitiesPage } from './OpportunitiesPage.js';
import { OpportunityDetailPage } from './OpportunityDetailPage.js';

class ApiFixtureRepository implements ProductRepository {
  public readonly dataSource = 'api' as const;

  public constructor(
    private snapshot: ProductSnapshot,
    private readonly detail: Opportunity | null = snapshot.opportunities[0] ??
      null,
  ) {}

  public getSnapshot(): Promise<ProductSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  public getOpportunity(): Promise<Opportunity | null> {
    return Promise.resolve(this.detail);
  }

  public setOpportunityDecision(
    _opportunityId: string,
    _decision: Decision,
  ): Promise<ProductSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  public saveSearchPreferences(
    preferences: SearchPreferences,
  ): Promise<ProductSnapshot> {
    this.snapshot = { ...this.snapshot, searchPreferences: preferences };
    return Promise.resolve(this.snapshot);
  }
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
    eligibility: 'ineligible',
    eligibilityLabel: 'Ineligible due to confirmed work authorization',
    fit: 'strong',
    fitScore: null,
    quality: 'moderate',
    qualityScore: null,
    decision: 'blocked',
    decisionLabel: 'Blocked',
    explanation: 'A confirmed Eligibility blocker controls this Decision.',
    nextAction: 'Do not apply',
    evidence: [
      {
        id: 'api-evidence',
        label: 'candidate-claim',
        source: 'claim:authorization',
        excerpt: 'Candidate requires sponsorship.',
        state: 'candidate-confirmed',
        observedAt: '2026-08-29T10:00:00.000Z',
      },
    ],
    eligibilitySignals: [
      {
        id: 'api-eligibility-finding',
        label: 'work_authorization',
        state: 'blocker',
        summary: 'The listing cannot sponsor this candidate.',
        evidenceIds: ['api-evidence'],
        confidence: 'high',
      },
    ],
    fitSignals: [
      {
        id: 'api-fit-finding',
        label: 'AWS',
        state: 'matched',
        summary: 'Direct AWS evidence exists.',
        evidenceIds: ['api-evidence'],
        impact: 'required',
      },
    ],
    qualitySignals: [
      {
        id: 'api-quality-finding',
        label: 'Source trust',
        state: 'neutral',
        summary: 'The source is recognized.',
        evidenceIds: ['api-evidence'],
      },
    ],
    ...overrides,
  };
}

function repository(item: Opportunity): ApiFixtureRepository {
  return new ApiFixtureRepository({
    ...initialSeedSnapshot,
    opportunities: [item],
  });
}

function detailRoute() {
  return (
    <Routes>
      <Route
        path="/opportunities/:opportunityId"
        element={<OpportunityDetailPage />}
      />
    </Routes>
  );
}

describe('API-mode Opportunities UI', () => {
  it('renders API-shaped list data and keeps blocked Decision distinct from Eligibility ineligible', async () => {
    const { container } = renderProduct(
      <OpportunitiesPage />,
      ['/opportunities'],
      repository(opportunity()),
    );
    expect(
      await screen.findByText('API Platform Engineer'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-decision="blocked"]'),
    ).toHaveTextContent('Blocked');
    expect(
      container.querySelector('[data-status="ineligible"]'),
    ).toHaveTextContent('Ineligible');
  });

  it('renders canonical dimensions, Evidence, and the renamed manual action', async () => {
    renderProduct(
      detailRoute(),
      ['/opportunities/api-opportunity'],
      repository(opportunity()),
    );
    expect(
      await screen.findByRole('heading', { name: 'API Platform Engineer' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A confirmed Eligibility blocker controls this Decision.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Fit: strong')).toBeInTheDocument();
    expect(screen.getByLabelText('Quality: moderate')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Review evidence for this opportunity',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Evidence' }));
    expect(
      screen.getByText(/Candidate requires sponsorship/),
    ).toBeInTheDocument();
    expect(screen.getByText('claim:authorization')).toBeInTheDocument();
  });

  it('renders investigate and missing dimensions honestly', async () => {
    const item = opportunity({
      eligibility: null,
      eligibilityLabel: 'Not evaluated',
      fit: null,
      quality: null,
      decision: 'investigate',
      decisionLabel: 'Investigate',
      eligibilitySignals: [],
      fitSignals: [],
      qualitySignals: [],
      evidence: [],
      completeness: null,
    });
    renderProduct(
      detailRoute(),
      ['/opportunities/api-opportunity'],
      repository(item),
    );
    expect((await screen.findAllByText('Investigate')).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText('Not evaluated').length).toBeGreaterThanOrEqual(
      3,
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
    };
    renderProduct(<OpportunitiesPage />, ['/opportunities'], failing);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The opportunity API is unavailable.',
    );
  });
});
