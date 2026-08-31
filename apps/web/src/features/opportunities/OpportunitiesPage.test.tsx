import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { OpportunitiesPage } from './OpportunitiesPage.js';

describe('opportunity exploration', () => {
  it('searches the seeded opportunities', async () => {
    renderProduct(<OpportunitiesPage />, ['/opportunities']);
    const search = await screen.findByRole('searchbox', {
      name: 'Search jobs',
    });
    fireEvent.change(search, { target: { value: 'Kubernetes' } });
    expect(
      screen.getByText(/Infrastructure Software Engineer/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Platform Engineer, Developer Experience'),
    ).not.toBeInTheDocument();
  });

  it('filters sponsorship states and keeps URL-addressable behavior', async () => {
    renderProduct(<OpportunitiesPage />, ['/opportunities']);
    fireEvent.change(await screen.findByLabelText('Filter by sponsorship'), {
      target: { value: 'Conflicting' },
    });
    expect(screen.getByText(/Full-stack Engineer/i)).toBeInTheDocument();
    expect(screen.getByText(/Resolve conflicting policy/i)).toBeInTheDocument();
  });

  it('sorts by Fit without collapsing Eligibility', async () => {
    const { container } = renderProduct(<OpportunitiesPage />, [
      '/opportunities',
    ]);
    fireEvent.change(await screen.findByLabelText('Sort jobs'), {
      target: { value: 'fit' },
    });
    const first = container.querySelector('.opportunity-summary');
    expect(first).not.toBeNull();
    expect(
      within(first as HTMLElement).getByText('Senior Backend Engineer'),
    ).toBeInTheDocument();
    expect(
      within(first as HTMLElement).getByText('Ineligible'),
    ).toBeInTheDocument();
  });
});
