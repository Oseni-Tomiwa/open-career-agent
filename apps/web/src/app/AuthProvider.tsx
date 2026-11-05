import { RoleviaApiClient, UnauthorizedError } from '@oca/api-client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { browserConfig } from '../config.js';
import { AppLoading } from './AppLoading.js';
import { AuthContext, type AuthSession } from './authContext.js';
import { LocalWorkspaceGate } from './LocalWorkspaceGate.js';
import { PublicApplication } from './PublicApplication.js';

const cookieCredentials = () => ({ credentials: 'include' as const });
const publicAccountPaths = new Set([
  '/',
  '/how-it-works',
  '/features',
  '/pricing',
  '/about',
  '/privacy',
  '/terms',
  '/sign-in',
  '/create-account',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
]);

const authRedirectPaths = new Set(['/', '/sign-in', '/create-account']);

function enterAuthenticatedApplication() {
  if (authRedirectPaths.has(window.location.pathname)) {
    window.history.replaceState({}, '', '/overview');
  }
  window.dispatchEvent(new Event('popstate'));
}

const SESSION_STORAGE_KEY = 'rolevia_session';

function getPersistedSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function setPersistedSession(session: AuthSession | null) {
  try {
    if (session) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const cloud =
    browserConfig.productDataSource === 'api' &&
    browserConfig.deploymentMode === 'cloud';
  const local =
    browserConfig.productDataSource === 'api' &&
    browserConfig.deploymentMode === 'development';
  const client = useMemo(
    () =>
      new RoleviaApiClient({
        baseUrl: browserConfig.apiBaseUrl,
        credentialProvider: cookieCredentials,
      }),
    [],
  );
  const [session, setSessionState] = useState<AuthSession | null>(() =>
    local ? null : getPersistedSession(),
  );

  const setSession = useCallback((next: AuthSession | null) => {
    setPersistedSession(next);
    setSessionState(next);
  }, []);

  const [status, setStatus] = useState<
    'loading' | 'anonymous' | 'authenticated' | 'unavailable'
  >(() => {
    if (cloud) return 'loading';
    if (session) return 'authenticated';
    if (publicAccountPaths.has(window.location.pathname)) return 'anonymous';
    return 'authenticated';
  });

  useEffect(() => {
    if (
      status === 'authenticated' &&
      authRedirectPaths.has(window.location.pathname)
    ) {
      enterAuthenticatedApplication();
    }
  }, [status]);

  useEffect(() => {
    if (!cloud) return;
    let active = true;
    void client
      .getSession()
      .then((current) => {
        if (active) {
          enterAuthenticatedApplication();
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
  }, [client, cloud, setSession]);

  const signOut = useCallback(async () => {
    if (cloud) await client.logout().catch(() => {});
    setSession(null);
    setStatus('anonymous');
    window.history.replaceState({}, '', '/sign-in');
  }, [client, cloud, setSession]);

  if (status === 'loading') return <AppLoading />;
  if (status === 'anonymous' || status === 'unavailable') {
    return (
      <PublicApplication
        {...(local
          ? {
              onEnterLocalWorkspace: () => {
                enterAuthenticatedApplication();
                setSession(null);
                setStatus('authenticated');
              },
            }
          : {})}
        onAuthenticated={(current) => {
          enterAuthenticatedApplication();
          setSession(current);
          setStatus('authenticated');
        }}
        client={client}
        unavailable={status === 'unavailable'}
      />
    );
  }

  return (
    <AuthContext
      value={{
        session,
        cloud,
        signOut,
        ...(!local && session?.primaryCandidateId
          ? { candidateId: session.primaryCandidateId }
          : !local && browserConfig.developmentCandidateId
            ? { candidateId: browserConfig.developmentCandidateId }
            : {}),
      }}
    >
      {local ? <LocalWorkspaceGate>{children}</LocalWorkspaceGate> : children}
    </AuthContext>
  );
}
