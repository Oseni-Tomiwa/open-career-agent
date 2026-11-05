import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayPage } from './TodayPage.js';
const data = vi.hoisted(() => ({
  getTodayDashboard: vi.fn(),
  snapshot: { opportunities: [], applications: [] },
  dataSource: 'api',
}));
vi.mock('../../app/ProductDataProvider.js', () => ({
  useProductData: () => data,
}));
const empty = {
  generatedAt: '2026-01-01T00:00:00Z',
  greetingName: 'Candidate',
  summaryText: '',
  timeWindowDays: 7,
  priorityOpportunities: [],
  needsAttention: [],
  recentChanges: [],
  discoveryActivity: [],
  applicationActivity: [],
  careerMemoryAttention: [],
};
beforeEach(() => {
  data.getTodayDashboard.mockReset();
});
describe('honest personal overview', () => {
  it('shows zero records and only existing preparation destinations', async () => {
    data.getTodayDashboard.mockResolvedValue(empty);
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Your personal workspace is ready',
      }),
    ).toBeVisible();
    expect(screen.getByText('0 opportunities')).toBeVisible();
    expect(screen.getByText('0 applications')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Career Profile' }),
    ).toHaveAttribute('href', '/settings');
    expect(
      screen.getByRole('link', { name: 'Search Preferences' }),
    ).toHaveAttribute('href', '/discover?tab=preferences');
    expect(
      screen.queryByRole('button', { name: /add opportunity/i }),
    ).not.toBeInTheDocument();
  });
  it('distinguishes failed data from empty data and supports retry', async () => {
    data.getTodayDashboard
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce(empty);
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'API unavailable',
    );
    expect(screen.queryByText('0 opportunities')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry overview' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Your personal workspace is ready',
      }),
    ).toBeVisible();
  });
});
