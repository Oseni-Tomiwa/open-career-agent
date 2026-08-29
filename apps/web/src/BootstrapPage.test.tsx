import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BootstrapPage } from './BootstrapPage.js';

describe('development bootstrap surface', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the bootstrap purpose and service readiness', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            service: { name: 'api', version: '0.0.0' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ready',
            service: { name: 'api', version: '0.0.0' },
            resources: { database: 'ready' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<BootstrapPage />);

    expect(
      screen.getByRole('heading', {
        name: 'Open Career Agent development environment',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not the product dashboard/i)).toBeInTheDocument();
    expect(await screen.findByText('ready')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows an honest unavailable state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    );
    render(<BootstrapPage />);

    expect(await screen.findByText('Services unavailable')).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument();
  });
});
