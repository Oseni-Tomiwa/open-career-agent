import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { SearchPage } from './SearchPage.js';

describe('Search & Discovery Configuration Page', () => {
  it('renders search preferences, allows editing, and triggers manual discovery run', async () => {
    renderProduct(<SearchPage />);

    expect(await screen.findByText('Search & Discovery')).toBeInTheDocument();
    expect(
      await screen.findByText('Backend Engineer - Germany/Europe'),
    ).toBeInTheDocument();

    const saveButton = screen.getByRole('button', {
      name: 'Save Search Preference',
    });
    expect(saveButton).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('greenhouse identifier 1'), {
      target: { value: 'company-greenhouse' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Add job source' }));
    fireEvent.change(screen.getByLabelText('Job source 2'), {
      target: { value: 'lever' },
    });
    fireEvent.change(screen.getByLabelText('lever identifier 2'), {
      target: { value: 'company-lever' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Add job source' }));
    fireEvent.change(screen.getByLabelText('Job source 3'), {
      target: { value: 'ashby' },
    });
    fireEvent.change(screen.getByLabelText('ashby identifier 3'), {
      target: { value: 'company-ashby' },
    });

    fireEvent.click(saveButton);
    expect(
      await screen.findByText(/Search preference updated successfully/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('lever identifier 2'), {
      target: { value: 'company-lever-edited' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove source 1' }));
    fireEvent.click(saveButton);
    expect(
      screen.getByDisplayValue('company-lever-edited'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('company-ashby')).toBeInTheDocument();

    const runButton = screen.getByRole('button', { name: 'Run Discovery Now' });
    fireEvent.click(runButton);

    expect(await screen.findByText(/Discovery completed/i)).toBeInTheDocument();
  });

  it('shows a clear validation error for duplicate source configurations', async () => {
    renderProduct(<SearchPage />);
    await screen.findByText('Backend Engineer - Germany/Europe');
    fireEvent.change(screen.getByLabelText('greenhouse identifier 1'), {
      target: { value: 'duplicate-board' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Add job source' }));
    fireEvent.change(screen.getByLabelText('greenhouse identifier 2'), {
      target: { value: 'DUPLICATE-BOARD' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Search Preference' }),
    );
    expect(
      await screen.findByText('Remove duplicate job sources before saving.'),
    ).toBeInTheDocument();
  });
});
