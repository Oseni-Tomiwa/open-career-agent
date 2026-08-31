import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SeedProductRepository } from '../../data/seedRepository.js';
import { renderProduct } from '../../test/render.js';
import { ApplicationsPage } from './ApplicationsPage.js';

describe('application pipeline', () => {
  it('shows next action and provenance-rich event history', async () => {
    renderProduct(<ApplicationsPage />);
    expect(
      await screen.findByRole('heading', { name: 'Applications' }),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByText('Prepare two platform ownership examples'),
    ).toHaveLength(2);
    expect(
      await screen.findByText('Candidate marked submitted'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Recorded by Candidate').length).toBeGreaterThan(
      0,
    );
  });

  it('expands another application activity timeline', async () => {
    renderProduct(<ApplicationsPage />);
    const trigger = await screen.findByRole('button', {
      name: /Software Engineer, Care Operations/i,
    });
    fireEvent.click(trigger);
    expect(
      await screen.findByText('Take-home assessment due 2 September.'),
    ).toBeInTheDocument();
  });

  it('renders an honest empty state without falling back to snapshot applications', async () => {
    const repository = new SeedProductRepository();
    vi.spyOn(repository, 'getApplications').mockResolvedValue([]);
    renderProduct(<ApplicationsPage />, ['/applications'], repository);

    expect(
      await screen.findByText(
        'No applications are tracked for this candidate.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Prepare two platform ownership examples'),
    ).not.toBeInTheDocument();
  });

  it('renders an honest application API failure', async () => {
    const repository = new SeedProductRepository();
    vi.spyOn(repository, 'getApplications').mockRejectedValue(
      new Error('The opportunity API is unavailable.'),
    );
    renderProduct(<ApplicationsPage />, ['/applications'], repository);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The opportunity API is unavailable.',
    );
    expect(
      screen.queryByText('Prepare two platform ownership examples'),
    ).not.toBeInTheDocument();
  });

  it('reports application detail not found instead of substituting seed detail', async () => {
    const repository = new SeedProductRepository();
    vi.spyOn(repository, 'getApplication').mockResolvedValue(null);
    renderProduct(<ApplicationsPage />, ['/applications'], repository);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Application detail was not found.',
    );
  });
});
