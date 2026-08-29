import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { ApplicationsPage } from './ApplicationsPage.js';

describe('application pipeline', () => {
  it('shows next action and provenance-rich event history', async () => {
    renderProduct(<ApplicationsPage />);
    expect(
      await screen.findByRole('heading', { name: 'Applications' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Prepare two platform ownership examples'),
    ).toHaveLength(2);
    expect(screen.getByText('Candidate marked submitted')).toBeInTheDocument();
    expect(screen.getByText('Recorded by Candidate')).toBeInTheDocument();
  });

  it('expands another application activity timeline', async () => {
    renderProduct(<ApplicationsPage />);
    const trigger = await screen.findByRole('button', {
      name: /Software Engineer, Care Operations/i,
    });
    fireEvent.click(trigger);
    expect(
      screen.getByText('Take-home assessment due 2 September.'),
    ).toBeInTheDocument();
  });
});
