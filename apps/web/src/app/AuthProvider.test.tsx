import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Cloud web authentication boundary', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/sign-in');
    vi.resetModules();
    vi.stubEnv('VITE_PRODUCT_DATA_SOURCE', 'api');
    vi.stubEnv('VITE_DEPLOYMENT_MODE', 'cloud');
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.rolevia.test');
    vi.stubEnv('VITE_DEVELOPMENT_CANDIDATE_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('protects the shell, signs in with cookie credentials, and signs out', async () => {
    const session = {
      user: { id: 'usr_test', email: 'person@example.com' },
      candidateIds: ['candidate_test'],
      primaryCandidateId: 'candidate_test',
      expiresAt: '2026-09-07T00:00:00.000Z',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            providers: { google: false, apple: false },
            developmentEmailDelivery: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ revoked: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    const { AuthProvider } = await import('./AuthProvider.js');
    const { useAuth } = await import('./authContext.js');

    function ProtectedShell() {
      const auth = useAuth();
      return (
        <div>
          <p>Candidate {auth.candidateId}</p>
          <button onClick={() => void auth.signOut()} type="button">
            Sign out
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <ProtectedShell />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Candidate candidate_test')).toBeVisible();
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://api.rolevia.test/auth/capabilities',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      'https://api.rolevia.test/auth/login',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Welcome back' }),
      ).toBeVisible(),
    );
  });

  it('does not misrepresent an unavailable API as an anonymous session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('network unavailable')),
    );
    const { AuthProvider } = await import('./AuthProvider.js');

    render(<AuthProvider>Protected product shell</AuthProvider>);

    expect(
      await screen.findByRole('heading', {
        name: 'Rolevia Cloud is unavailable',
      }),
    ).toBeVisible();
    expect(
      screen.queryByText('Protected product shell'),
    ).not.toBeInTheDocument();
  });

  it('unmounts authenticated state before a different user signs in', async () => {
    const sessionA = {
      user: { id: 'usr_a', email: 'a@example.com' },
      candidateIds: ['candidate_a'],
      primaryCandidateId: 'candidate_a',
      expiresAt: '2026-09-07T00:00:00.000Z',
    };
    const sessionB = {
      user: { id: 'usr_b', email: 'b@example.com' },
      candidateIds: ['candidate_b'],
      primaryCandidateId: 'candidate_b',
      expiresAt: '2026-09-07T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
              },
            }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              providers: { google: false, apple: false },
              developmentEmailDelivery: false,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ session: sessionA }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ revoked: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              providers: { google: false, apple: false },
              developmentEmailDelivery: false,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ session: sessionB }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    );
    const { AuthProvider } = await import('./AuthProvider.js');
    const { useAuth } = await import('./authContext.js');

    function PrivateState() {
      const auth = useAuth();
      const [privateValue, setPrivateValue] = useState('empty');
      return (
        <div>
          <p>{auth.session?.user.email}</p>
          <p>Private value: {privateValue}</p>
          <button onClick={() => setPrivateValue('A-only')} type="button">
            Set private state
          </button>
          <button onClick={() => void auth.signOut()} type="button">
            Sign out
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <PrivateState />
      </AuthProvider>,
    );

    await signIn('a@example.com');
    expect(await screen.findByText('a@example.com')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Set private state' }));
    expect(screen.getByText('Private value: A-only')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Welcome back' });

    await signIn('b@example.com');
    expect(await screen.findByText('b@example.com')).toBeVisible();
    expect(screen.getByText('Private value: empty')).toBeVisible();
    expect(screen.queryByText('Private value: A-only')).not.toBeInTheDocument();
  });
});

async function signIn(email: string) {
  fireEvent.change(await screen.findByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct horse battery staple' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}
