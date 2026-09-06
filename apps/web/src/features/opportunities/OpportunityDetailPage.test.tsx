import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SeedProductRepository } from '../../data/seedRepository.js';
import { renderProduct } from '../../test/render.js';
import { OpportunityDetailPage } from './OpportunityDetailPage.js';

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

describe('opportunity detail', () => {
  it('makes a confirmed blocker unmistakable while retaining strong Fit', async () => {
    renderProduct(detailRoute(), ['/opportunities/ember-backend-engineer']);
    expect(
      await screen.findByRole('heading', { name: 'Senior Backend Engineer' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Confirmed Eligibility blocker'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Inspect Fit: strong',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Eligibility' }));
    expect(
      screen.getByRole('heading', { name: /Can I realistically pursue/i }),
    ).toBeInTheDocument();
  });

  it('presents unknown as investigation rather than failure', async () => {
    renderProduct(detailRoute(), ['/opportunities/atlas-api-engineer']);
    expect(
      await screen.findByText('This is unknown, not a negative answer'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        /Check application questions for sponsorship policy/i,
      ),
    ).toHaveLength(2);
  });

  it('shows exact evaluation values and separates evidence navigation from decision actions', async () => {
    const repository = new SeedProductRepository();
    const setDecision = vi.spyOn(repository, 'setOpportunityDecision');
    renderProduct(
      detailRoute(),
      ['/opportunities/northstar-platform-engineer'],
      repository,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Platform Engineer, Developer Experience',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('91 / 100')).toBeInTheDocument();
    expect(screen.getByText('88 / 100')).toBeInTheDocument();
    expect(screen.getByText('91% complete')).toBeInTheDocument();

    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    const evidenceTab = screen.getByRole('tab', { name: 'Evidence' });
    expect(overviewTab).toHaveAttribute('tabindex', '0');
    expect(evidenceTab).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(overviewTab, { key: 'ArrowRight' });
    const eligibilityTab = screen.getByRole('tab', { name: 'Eligibility' });
    expect(eligibilityTab).toHaveAttribute('aria-selected', 'true');
    expect(eligibilityTab).toHaveAttribute('tabindex', '0');
    expect(eligibilityTab).toHaveFocus();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Review evidence for this opportunity',
      }),
    );
    expect(setDecision).not.toHaveBeenCalled();
    expect(evidenceTab).toHaveAttribute('aria-selected', 'true');
    expect(evidenceTab).toHaveAttribute('tabindex', '0');

    fireEvent.click(
      screen.getByRole('button', { name: 'Mark for evidence review' }),
    );
    await waitFor(() =>
      expect(setDecision).toHaveBeenCalledWith(
        'northstar-platform-engineer',
        'investigate',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shortlist' }));
    await waitFor(() =>
      expect(setDecision).toHaveBeenCalledWith(
        'northstar-platform-engineer',
        'consider',
      ),
    );
  });

  it('renders a specific invalid-opportunity state', async () => {
    renderProduct(detailRoute(), ['/opportunities/missing-opportunity']);
    expect(
      await screen.findByRole('heading', { name: 'Opportunity not found' }),
    ).toBeInTheDocument();
  });
});
