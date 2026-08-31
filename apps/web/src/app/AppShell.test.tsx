import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { renderProduct } from '../test/render.js';
import { AppShell } from './AppShell.js';

describe('application shell navigation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('navigates between real product destinations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    );
    renderProduct(
      <Routes>
        <Route element={<AppShell />} path="/">
          <Route index element={<h1>Overview workspace</h1>} />
          <Route path="applications" element={<h1>Application pipeline</h1>} />
        </Route>
      </Routes>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Overview workspace' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Applications' }));
    expect(
      screen.getByRole('heading', { name: 'Application pipeline' }),
    ).toBeInTheDocument();
  });

  it('renders exact V1 primary navigation items and excludes deferred surfaces', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    );
    renderProduct(
      <Routes>
        <Route element={<AppShell />} path="/">
          <Route index element={<h1>Overview workspace</h1>} />
        </Route>
      </Routes>,
    );

    const nav = await screen.findByRole('navigation', {
      name: 'Primary navigation',
    });
    expect(nav).toBeInTheDocument();

    // Must contain V1 primary navigation items
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Discover Jobs' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Matches' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Applications' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Career Insights' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Agent Activity' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();

    // Must NOT contain deferred / un-implemented surfaces
    expect(
      screen.queryByRole('link', { name: 'Documents' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Notifications' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Rolevia Pro/i)).not.toBeInTheDocument();
  });
});
