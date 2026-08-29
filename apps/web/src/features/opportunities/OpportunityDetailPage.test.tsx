import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderProduct } from '../../test/render.js';
import { OpportunityDetailPage } from './OpportunityDetailPage.js';

function detailRoute() {
  return (
    <Routes>
      <Route
        path="/opportunities/:opportunityId"
        element={<OpportunityDetailPage />}
      />
    </Routes>
  );
}

describe('opportunity detail', () => {
  it('makes a confirmed blocker unmistakable while retaining strong Fit', async () => {
    renderProduct(detailRoute(), ['/opportunities/ember-backend-engineer']);
    expect(
      await screen.findByRole('heading', { name: 'Senior Backend Engineer' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Confirmed Eligibility blocker'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Fit: strong, 94 out of 100'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Eligibility' }));
    expect(
      screen.getByRole('heading', { name: /Can I realistically pursue/i }),
    ).toBeInTheDocument();
  });

  it('presents unknown as investigation rather than failure', async () => {
    renderProduct(detailRoute(), ['/opportunities/atlas-api-engineer']);
    expect(
      await screen.findByText('This is unknown, not a negative answer'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        /Check application questions for sponsorship policy/i,
      ),
    ).toHaveLength(2);
  });

  it('renders a specific invalid-opportunity state', async () => {
    renderProduct(detailRoute(), ['/opportunities/missing-opportunity']);
    expect(
      await screen.findByRole('heading', { name: 'Opportunity not found' }),
    ).toBeInTheDocument();
  });
});
