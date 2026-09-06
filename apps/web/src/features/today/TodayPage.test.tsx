import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { TodayPage } from './TodayPage.js';

describe('Today experience', () => {
  it('answers what deserves attention and what needs investigation', async () => {
    renderProduct(<TodayPage />);
    expect(
      await screen.findByRole('heading', { name: 'Today' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'What deserves attention' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sponsorship is not stated/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Application pipeline' }),
    ).toBeInTheDocument();

    const changesHeading = screen.getByRole('heading', {
      name: 'What changed',
    });
    expect(changesHeading).toHaveAttribute('id', 'changes-heading');
    expect(document.querySelectorAll('#changes-heading')).toHaveLength(1);
    expect(changesHeading.closest('section')).toHaveAttribute(
      'aria-labelledby',
      'changes-heading',
    );
    expect(
      document.querySelectorAll('.brief-register > div > small'),
    ).toHaveLength(0);
    expect(document.querySelectorAll('.brief-register dd small')).toHaveLength(
      3,
    );
  });
});
