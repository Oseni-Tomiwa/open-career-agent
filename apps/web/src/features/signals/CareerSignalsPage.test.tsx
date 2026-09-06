import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { CareerSignalsPage } from './CareerSignalsPage.js';
import type { ProductRepository } from '../../data/types.js';

import { initialSeedSnapshot } from '../../data/seed.js';
import { SeedProductRepository } from '../../data/seedRepository.js';

describe('CareerSignalsPage', () => {
  it('renders aggregated career market signals page', async () => {
    renderProduct(<CareerSignalsPage />);

    expect(
      await screen.findByRole('heading', { name: 'Career Insights' }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { name: 'Active Market Overview' }),
    ).toBeInTheDocument();

    expect(await screen.findByTestId('active-opp-count')).toBeInTheDocument();
  });

  it('offers honest next steps when no recurring insight is supported', async () => {
    const repository = new SeedProductRepository();

    renderProduct(<CareerSignalsPage />, ['/insights'], repository);

    expect(
      await screen.findByRole('heading', { name: 'No Career Insights Yet' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Review opportunity register' }),
    ).toHaveAttribute('href', '/discover');
    expect(
      screen.getByRole('link', { name: 'Refine Search Preferences' }),
    ).toHaveAttribute('href', '/discover?tab=preferences');
  });

  it('fails honestly when API request fails and does NOT fall back to seed signals', async () => {
    const failingRepo: Partial<ProductRepository> = {
      dataSource: 'api',
      getSnapshot: () => Promise.resolve(initialSeedSnapshot),
      getCareerSignals: () =>
        Promise.reject(new Error('Career Signals API network error')),
    };

    renderProduct(
      <CareerSignalsPage />,
      ['/insights'],
      failingRepo as ProductRepository,
    );

    expect(
      await screen.findByRole('heading', { name: 'Failed to Load Insights' }),
    ).toBeInTheDocument();

    expect(
      screen.getByText('Career Signals API network error'),
    ).toBeInTheDocument();

    expect(
      screen.queryByText('Active Market Overview'),
    ).not.toBeInTheDocument();
  });
});
