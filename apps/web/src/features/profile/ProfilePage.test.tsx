import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { ProfilePage } from './ProfilePage.js';

describe('Career Memory profile', () => {
  it('shows evidence completeness and missing verification honestly', async () => {
    renderProduct(<ProfilePage />);
    expect(
      await screen.findByRole('heading', { name: 'Career Profile' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Verified through 4 Evidence items'),
    ).toBeInTheDocument();
    expect(screen.getByText('No direct Evidence recorded')).toBeInTheDocument();
    expect(screen.getByText('Needs verification')).toBeInTheDocument();
  });
});
