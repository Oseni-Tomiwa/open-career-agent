import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { TodayPage } from './TodayPage.js';

describe('Today experience', () => {
  it('answers what deserves attention and what needs investigation', async () => {
    renderProduct(<TodayPage />);
    expect(
      await screen.findByRole('heading', { name: /Good afternoon, Amara/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Priority matches' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Needs investigation' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sponsorship is not stated/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Application activity' }),
    ).toBeInTheDocument();
  });
});
