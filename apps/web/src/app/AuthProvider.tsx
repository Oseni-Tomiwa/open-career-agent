import { RoleviaApiClient, UnauthorizedError } from '@oca/api-client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import { browserConfig } from '../config.js';
import { AppLoading } from './AppLoading.js';
import { AuthContext, type AuthSession } from './authContext.js';

const cookieCredentials = () => ({ credentials: 'include' as const });

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const cloud =
    browserConfig.productDataSource === 'api' &&
    browserConfig.deploymentMode === 'cloud';
  const client = useMemo(
    () =>
      new RoleviaApiClient({
        baseUrl: browserConfig.apiBaseUrl,
        credentialProvider: cookieCredentials,
      }),
    [],
  );
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'anonymous' | 'authenticated' | 'unavailable'
  >(cloud ? 'loading' : 'authenticated');

  useEffect(() => {
    if (!cloud) return;
    let active = true;
    void client
      .getSession()
      .then((current) => {
        if (active) {
          setSession(current);
          setStatus('authenticated');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus(
            error instanceof UnauthorizedError ? 'anonymous' : 'unavailable',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [client, cloud]);

  const signOut = useCallback(async () => {
    if (cloud) await client.logout();
    setSession(null);
    setStatus(cloud ? 'anonymous' : 'authenticated');
  }, [client, cloud]);

  if (status === 'loading') return <AppLoading />;
  if (status === 'unavailable') {
    return (
      <main className="auth-page">
        <section className="auth-card" role="alert">
          <h1>Rolevia Cloud is unavailable</h1>
          <p>
            The authenticated session could not be checked. Try again shortly.
          </p>
        </section>
      </main>
    );
  }
  if (status === 'anonymous') {
    return (
      <SignIn
        onAuthenticated={(current) => {
          setSession(current);
          setStatus('authenticated');
        }}
        client={client}
      />
    );
  }

  return (
    <AuthContext
      value={{
        session,
        cloud,
        signOut,
        ...(session?.primaryCandidateId
          ? { candidateId: session.primaryCandidateId }
          : browserConfig.developmentCandidateId
            ? { candidateId: browserConfig.developmentCandidateId }
            : {}),
      }}
    >
      {children}
    </AuthContext>
  );
}

function SignIn({
  client,
  onAuthenticated,
}: {
  readonly client: RoleviaApiClient;
  readonly onAuthenticated: (session: AuthSession) => void;
}) {
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const emailValue = form.get('email');
    const passwordValue = form.get('password');
    const email = typeof emailValue === 'string' ? emailValue : '';
    const password = typeof passwordValue === 'string' ? passwordValue : '';
    try {
      const result = registering
        ? await client.register({ email, password, transport: 'cookie' })
        : await client.login({ email, password, transport: 'cookie' });
      onAuthenticated(result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Authentication could not be completed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="product-identity">
          <span className="product-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>
            <strong>Open Career Agent</strong>
            <small>Rolevia Cloud</small>
          </span>
        </div>
        <h1 id="auth-title">{registering ? 'Create account' : 'Sign in'}</h1>
        <p>Your career data stays isolated to your Candidate profile.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Email
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label>
            Password
            <input
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={registering ? 12 : 1}
              name="password"
              required
              type="password"
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button disabled={submitting} type="submit">
            {submitting
              ? 'Working…'
              : registering
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>
        <button
          className="auth-switch"
          onClick={() => {
            setError(null);
            setRegistering((value) => !value);
          }}
          type="button"
        >
          {registering ? 'Use an existing account' : 'Create a new account'}
        </button>
      </section>
    </main>
  );
}
