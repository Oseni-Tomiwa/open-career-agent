import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { CareerSignalsPage } from './CareerSignalsPage.js';
import type { ProductRepository } from '../../data/types.js';

import { initialSeedSnapshot } from '../../data/seed.js';

describe('CareerSignalsPage', () => {
  it('renders aggregated career market signals page', async () => {
    renderProduct(<CareerSignalsPage />);

    expect(
      await screen.findByRole('heading', { name: 'Career Signals' }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { name: 'Active Market Overview' }),
    ).toBeInTheDocument();

    expect(await screen.findByTestId('active-opp-count')).toBeInTheDocument();
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
      ['/signals'],
      failingRepo as ProductRepository,
    );

    expect(
      await screen.findByRole('heading', { name: 'Failed to Load Signals' }),
    ).toBeInTheDocument();

    expect(
      screen.getByText('Career Signals API network error'),
    ).toBeInTheDocument();

    expect(
      screen.queryByText('Active Market Overview'),
    ).not.toBeInTheDocument();
  });
});
