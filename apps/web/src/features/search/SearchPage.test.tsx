import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { SearchPage } from './SearchPage.js';

describe('Search & Discovery Configuration Page', () => {
  it('renders search targets, allows editing, and triggers manual discovery run', async () => {
    renderProduct(<SearchPage />);

    expect(await screen.findByText('Search & Discovery')).toBeInTheDocument();
    expect(
      await screen.findByText('Backend Engineer - Germany/Europe'),
    ).toBeInTheDocument();

    const saveButton = screen.getByRole('button', {
      name: 'Save Search Target',
    });
    expect(saveButton).toBeInTheDocument();

    fireEvent.click(saveButton);
    expect(
      await screen.findByText(
        /Search target configuration updated successfully/i,
      ),
    ).toBeInTheDocument();

    const runButton = screen.getByRole('button', { name: 'Run Discovery Now' });
    fireEvent.click(runButton);

    expect(await screen.findByText(/Discovery completed/i)).toBeInTheDocument();
  });
});
