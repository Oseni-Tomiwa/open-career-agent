import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoleviaApiClient } from '@oca/api-client';
import { LocalWorkspaceGate } from './LocalWorkspaceGate.js';
import { useAuth } from './authContext.js';

const ready = {
  mode: 'local',
  state: 'READY',
  candidate: {
    id: 'server-personal',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
function Shell() {
  const auth = useAuth();
  return (
    <p>
      Workspace {auth.candidateId}; session{' '}
      {auth.session === null ? 'null' : 'present'}
    </p>
  );
}
function setup(fetcher: typeof fetch, hint?: string) {
  return render(
    <StrictMode>
      <LocalWorkspaceGate
        client={
          new RoleviaApiClient({ baseUrl: 'http://localhost:3000', fetcher })
        }
        candidateHint={hint}
      >
        <Shell />
      </LocalWorkspaceGate>
    </StrictMode>,
  );
}
afterEach(() => vi.restoreAllMocks());
describe('personal workspace gate', () => {
  it('never mutates on mount, requires explicit setup, disables duplicate actions, then opens the server identity', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) =>
      init?.method === 'POST'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(response({ mode: 'local', state: 'SETUP_REQUIRED' })),
    );
    setup(fetcher);
    const create = await screen.findByRole('button', {
      name: 'Create my workspace',
    });
    expect(fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(
      true,
    );
    fireEvent.click(create);
    fireEvent.click(create);
    expect(
      screen.getByRole('button', { name: 'Creating workspace…' }),
    ).toBeDisabled();
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
    finish(response(ready));
    const open = await screen.findByRole('button', {
      name: 'Open my workspace',
    });
    await waitFor(() => expect(open).toHaveFocus());
    fireEvent.click(open);
    expect(
      screen.getByText('Workspace server-personal; session null'),
    ).toBeVisible();
  });
  it('recognizes returning users without creating a candidate', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(response(ready)));
    setup(fetcher);
    expect(
      await screen.findByText('Workspace server-personal; session null'),
    ).toBeVisible();
    expect(fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(
      true,
    );
  });
  it('blocks an incompatible browser identity without falling back', async () => {
    setup(
      vi
        .fn<typeof fetch>()
        .mockImplementation(() => Promise.resolve(response(ready))),
      'wrong',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('configuration');
    expect(screen.queryByText(/Workspace server/)).not.toBeInTheDocument();
  });
  it.each([403, 404, 503])(
    'shows status %s as failure rather than first-run',
    async (status) => {
      setup(
        vi
          .fn<typeof fetch>()
          .mockImplementation(() =>
            Promise.resolve(
              response({ error: { message: 'Unavailable' } }, status),
            ),
          ),
      );
      expect(await screen.findByRole('alert')).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Create my workspace' }),
      ).not.toBeInTheDocument();
    },
  );
  it('recovers a lost setup response by replaying POST with no fictional data', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((_url, init) =>
        Promise.resolve(
          response(
            init?.method === 'POST'
              ? ready
              : { mode: 'local', state: 'SETUP_REQUIRED' },
          ),
        ),
      );
    let failed = false;
    fetcher.mockImplementation((_url, init) => {
      if (init?.method === 'POST' && !failed) {
        failed = true;
        return Promise.reject(new TypeError('offline'));
      }
      return Promise.resolve(
        response(
          init?.method === 'POST'
            ? ready
            : { mode: 'local', state: 'SETUP_REQUIRED' },
        ),
      );
    });
    setup(fetcher);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Create my workspace' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('safe to retry');
    fireEvent.click(screen.getByRole('button', { name: 'Retry setup' }));
    expect(
      await screen.findByRole('button', { name: 'Open my workspace' }),
    ).toBeVisible();
  });
  it('does not mount product data after unmount during a request', () => {
    let finish!: (r: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = setup(fetcher);
    view.unmount();
    finish(response(ready));
    expect(screen.queryByText(/Workspace server/)).not.toBeInTheDocument();
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
