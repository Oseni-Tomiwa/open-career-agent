import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { SearchPage } from './SearchPage.js';

describe('search configuration', () => {
  it('saves development preferences without claiming a live scan', async () => {
    renderProduct(<SearchPage />);
    expect(await screen.findByText('Seeded source status')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save development preferences' }),
    );
    expect(
      await screen.findByText(/No live source scan was started/i),
    ).toBeInTheDocument();
  });
});
