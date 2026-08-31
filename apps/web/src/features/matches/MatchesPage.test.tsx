import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SeedProductRepository } from '../../data/seedRepository.js';
import { renderProduct } from '../../test/render.js';
import MatchesPage from './MatchesPage.js';

describe('Matches', () => {
  it('preserves all canonical recommendation states without inventing a score', async () => {
    renderProduct(<MatchesPage />, ['/matches']);

    expect(
      await screen.findByRole('heading', { name: 'Matches' }),
    ).toBeInTheDocument();
    for (const label of [
      'High Priority',
      'Consider',
      'Investigate',
      'Low Priority',
      'Blocked',
    ]) {
      expect(
        screen.getByRole('button', { name: new RegExp(label) }),
      ).toBeVisible();
    }
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Blocked/ }));
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Why this job is blocked:').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/explicitly excludes sponsorship/i)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Investigate/ }));
    expect(
      screen.getAllByText('What needs investigation:').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/silent on employer sponsorship/i)).toBeVisible();
  });

  it('is a read-only projection over repository snapshot state', async () => {
    const repository = new SeedProductRepository();
    const decisionMutation = vi.spyOn(repository, 'setOpportunityDecision');
    const applicationMutation = vi.spyOn(repository, 'createApplication');

    renderProduct(<MatchesPage />, ['/matches'], repository);
    await screen.findByRole('heading', { name: 'Matches' });
    fireEvent.click(screen.getByRole('button', { name: /Blocked/ }));

    expect(decisionMutation).not.toHaveBeenCalled();
    expect(applicationMutation).not.toHaveBeenCalled();
  });
});
