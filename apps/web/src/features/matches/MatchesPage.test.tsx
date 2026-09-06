import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SeedProductRepository } from '../../data/seedRepository.js';
import { renderProduct } from '../../test/render.js';
import MatchesPage from './MatchesPage.js';

describe('Matches', () => {
  it('preserves canonical recommendation states and exposes separate evaluation values', async () => {
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
    expect(screen.getByRole('button', { name: /All Matches/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('91 / 100')).toBeVisible();
    expect(screen.getByText('88 / 100')).toBeVisible();
    expect(screen.getByText('91% assessed coverage')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Blocked/ }));
    expect(screen.getByRole('button', { name: /All Matches/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /Blocked/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

  it('loads current evaluation detail before presenting linked evidence counts', async () => {
    const repository = new SeedProductRepository();
    const detailed = (await repository.getSnapshot()).opportunities[0]!;
    const summary = {
      ...detailed,
      evidence: [],
      decisiveFindingIds: [],
      history: [],
      completeness: null,
    };
    vi.spyOn(repository, 'getSnapshot').mockResolvedValue({
      ...(await repository.getSnapshot()),
      opportunities: [summary],
    });
    const detailLoad = vi
      .spyOn(repository, 'getOpportunity')
      .mockResolvedValue(detailed);

    renderProduct(<MatchesPage />, ['/matches'], repository);
    expect(screen.queryByText('0 source records')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(detailLoad).toHaveBeenCalledWith(
        detailed.id,
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByText(
        `${detailed.evidence.length} linked evidence records`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Finding evidence')).toBeInTheDocument();
  });
});
