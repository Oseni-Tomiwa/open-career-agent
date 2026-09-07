import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { initialSeedSnapshot } from '../../data/seed.js';
import { SeedProductRepository } from '../../data/seedRepository.js';
import { renderProduct } from '../../test/render.js';
import { OpportunitySummary } from './OpportunitySummary.js';

describe('opportunity summary actions and evaluation values', () => {
  it('keeps navigation read-only and preserves explicit consider and investigate mutations', async () => {
    const repository = new SeedProductRepository();
    const setDecision = vi.spyOn(repository, 'setOpportunityDecision');
    const opportunity = initialSeedSnapshot.opportunities[0]!;

    renderProduct(
      <OpportunitySummary opportunity={opportunity} />,
      ['/discover'],
      repository,
    );

    expect(await screen.findByText('91 / 100')).toBeInTheDocument();
    expect(screen.getByText('88 / 100')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /Inspect analysis/i }));
    expect(setDecision).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Mark for evidence review' }),
    );
    await waitFor(() =>
      expect(setDecision).toHaveBeenCalledWith(opportunity.id, 'investigate'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shortlist' }));
    await waitFor(() =>
      expect(setDecision).toHaveBeenCalledWith(opportunity.id, 'consider'),
    );
  });

  it('does not describe unassessed evidence coverage as complete', async () => {
    const opportunity = {
      ...initialSeedSnapshot.opportunities[0]!,
      completeness: null,
    };
    renderProduct(<OpportunitySummary opportunity={opportunity} compact />, [
      '/discover',
    ]);

    expect(await screen.findByText('Not assessed')).toBeInTheDocument();
    expect(screen.getByText('Evidence coverage')).toBeInTheDocument();
    expect(screen.queryByText('complete')).not.toBeInTheDocument();
  });

  it('shows insufficient listing requirements without presenting Weak Fit', async () => {
    const opportunity = {
      ...initialSeedSnapshot.opportunities[0]!,
      fit: null,
      fitAssessmentStatus: 'INSUFFICIENT_LISTING_REQUIREMENTS' as const,
    };
    renderProduct(<OpportunitySummary opportunity={opportunity} />, [
      '/discover',
    ]);

    expect(
      await screen.findByText('Not enough listing requirements to assess fit'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Weak$/)).not.toBeInTheDocument();
  });
});
