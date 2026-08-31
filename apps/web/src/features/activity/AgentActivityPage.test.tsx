import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SeedProductRepository } from '../../data/seedRepository.js';
import { renderProduct } from '../../test/render.js';
import AgentActivityPage from './AgentActivityPage.js';

describe('Agent Activity', () => {
  it('shows only persisted candidate search activity without ledger internals', async () => {
    const repository = new SeedProductRepository();
    const dashboard = await repository.getTodayDashboard();
    vi.spyOn(repository, 'getTodayDashboard').mockResolvedValue({
      ...dashboard,
      discoveryActivity: [
        {
          runId: 'internal-run-id',
          searchTargetId: 'internal-target-id',
          searchTargetName: 'Backend roles',
          sourceSystem: 'greenhouse',
          status: 'COMPLETED',
          startedAt: '2026-08-31T09:00:00.000Z',
          completedAt: '2026-08-31T09:02:00.000Z',
          discoveredCount: 8,
          acceptedCount: 3,
          rejectedCount: 5,
          errorSummary: null,
        },
      ],
    });

    renderProduct(<AgentActivityPage />, ['/activity'], repository);

    expect(await screen.findByText('Backend roles')).toBeVisible();
    expect(screen.getByText('Completed')).toBeVisible();
    expect(screen.getByText('8 jobs')).toBeVisible();
    expect(screen.queryByText('internal-run-id')).not.toBeInTheDocument();
    expect(screen.queryByText('internal-target-id')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/payload|lease|fingerprint/i),
    ).not.toBeInTheDocument();
  });

  it('does not present a failed candidate-scoped request as an empty history', async () => {
    const repository = new SeedProductRepository();
    vi.spyOn(repository, 'getTodayDashboard').mockRejectedValue(
      new Error('unavailable'),
    );

    renderProduct(<AgentActivityPage />, ['/activity'], repository);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search activity is unavailable',
    );
    expect(
      screen.queryByText('No search activity recorded yet'),
    ).not.toBeInTheDocument();
  });
});
