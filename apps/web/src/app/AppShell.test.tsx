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
          <Route index element={<h1>Today workspace</h1>} />
          <Route path="applications" element={<h1>Application pipeline</h1>} />
        </Route>
      </Routes>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Today workspace' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Applications' }));
    expect(
      screen.getByRole('heading', { name: 'Application pipeline' }),
    ).toBeInTheDocument();
  });

  it('opens and closes the responsive navigation control', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    );
    renderProduct(
      <Routes>
        <Route element={<AppShell />} path="/">
          <Route index element={<h1>Today workspace</h1>} />
        </Route>
      </Routes>,
    );
    const trigger = await screen.findByRole('button', {
      name: 'Open navigation',
    });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
