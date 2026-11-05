import { ApiClientError, RoleviaApiClient } from '@oca/api-client';
import type { LocalWorkspaceReady } from '@oca/schemas';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { browserConfig } from '../config.js';
import { AuthContext, useAuth } from './authContext.js';

type State =
  | { kind: 'checking' | 'setup' | 'pending' }
  | { kind: 'success' | 'ready'; workspace: LocalWorkspaceReady }
  | {
      kind: 'error';
      title: string;
      message: string;
      retry: 'read' | 'setup' | null;
    };
function failure(error: unknown, initializing: boolean): State {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 404)
      return {
        kind: 'error',
        title: 'Local setup is disabled',
        message:
          'This API does not offer local workspace setup. Check the configured local launch before trying again.',
        retry: 'read',
      };
    if (error.statusCode === 403 || error.statusCode === 401)
      return {
        kind: 'error',
        title: 'Local setup is not authorized',
        message:
          'Use the trusted loopback launch and its configured web origin. Forwarded or remote requests cannot initialize this workspace.',
        retry: 'read',
      };
    if (error.code === 'VALIDATION_ERROR')
      return {
        kind: 'error',
        title: 'Workspace configuration needs attention',
        message:
          'The API returned an incompatible workspace response. Check the local API and browser configuration.',
        retry: null,
      };
  }
  return {
    kind: 'error',
    title: initializing
      ? 'Setup could not be confirmed'
      : 'Personal API unavailable',
    message: initializing
      ? 'The response was not confirmed. Your workspace may already exist; it is safe to retry setup. No demo records have been loaded.'
      : 'Rolevia could not read your personal workspace. Check that the local API and storage are available, then retry. No demo records have been loaded.',
    retry: initializing ? 'setup' : 'read',
  };
}
export function LocalWorkspaceGate({
  children,
  client: suppliedClient,
  candidateHint = browserConfig.developmentCandidateId,
}: {
  readonly children: ReactNode;
  readonly client?: RoleviaApiClient;
  readonly candidateHint?: string | undefined;
}) {
  const auth = useAuth();
  const client = useMemo(
    () =>
      suppliedClient ??
      new RoleviaApiClient({ baseUrl: browserConfig.apiBaseUrl }),
    [suppliedClient],
  );
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);
  const action = useRef<HTMLButtonElement>(null);
  const resolved = useCallback(
    (workspace: LocalWorkspaceReady, kind: 'success' | 'ready'): State => {
      return candidateHint && candidateHint !== workspace.candidate.id
        ? {
            kind: 'error',
            title: 'Workspace configuration needs attention',
            message:
              'The browser candidate configuration does not match the server workspace. Correct the configuration and relaunch; the browser cannot select another identity.',
            retry: null,
          }
        : { kind, workspace };
    },
    [candidateHint],
  );
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    request.current = controller;
    void client
      .getLocalWorkspace({ signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted)
          setState(
            value.state === 'READY'
              ? resolved(value, 'ready')
              : { kind: 'setup' },
          );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState(failure(error, false));
      });
    return () => {
      active.current = false;
      controller.abort();
      request.current?.abort();
    };
  }, [client, attempt, resolved]);
  useEffect(() => {
    if (state.kind === 'success' || state.kind === 'error')
      action.current?.focus();
  }, [state.kind]);
  async function initialize() {
    if (busy.current) return;
    busy.current = true;
    setState({ kind: 'pending' });
    const controller = new AbortController();
    request.current = controller;
    try {
      const value = await client.initializeLocalWorkspace({
        signal: controller.signal,
      });
      if (active.current && !controller.signal.aborted)
        setState(resolved(value, 'success'));
    } catch (error) {
      if (active.current && !controller.signal.aborted)
        setState(failure(error, true));
    } finally {
      busy.current = false;
    }
  }
  if (state.kind === 'ready')
    return (
      <AuthContext
        value={{
          ...auth,
          session: null,
          cloud: false,
          candidateId: state.workspace.candidate.id,
        }}
      >
        {children}
      </AuthContext>
    );
  const pending = state.kind === 'checking' || state.kind === 'pending';
  return (
    <main className="local-workspace" aria-busy={pending}>
      <aside className="local-workspace-rail">
        <a className="public-brand" href="/">
          Rolevia
        </a>
        <p className="eyebrow">Personal workspace</p>
        <h1>A clear place for your next opportunity.</h1>
        <p>
          Your local identity stays with your configured database. Begin with an
          empty, real workspace.
        </p>
        <span className="workspace-mode">Personal · local API</span>
      </aside>
      <section
        className="local-workspace-panel"
        aria-labelledby="workspace-heading"
      >
        <p className="eyebrow">Real workspace setup</p>
        <h2 id="workspace-heading">
          {state.kind === 'checking'
            ? 'Checking your workspace…'
            : state.kind === 'success'
              ? 'Your workspace is ready'
              : state.kind === 'error'
                ? state.title
                : 'Make this workspace yours'}
        </h2>
        {state.kind === 'checking' && (
          <p role="status">
            Recognizing an existing workspace. This does not create any records.
          </p>
        )}
        {(state.kind === 'setup' || state.kind === 'pending') && (
          <>
            <p>
              Create your personal workspace using the identity selected by your
              local API. No account, demo records, or opportunities will be
              created.
            </p>
            <dl className="workspace-facts">
              <div>
                <dt>Identity</dt>
                <dd>Selected by server configuration</dd>
              </div>
              <div>
                <dt>Starting point</dt>
                <dd>0 opportunities · 0 applications</dd>
              </div>
            </dl>
            <button
              className="button button-primary"
              disabled={pending}
              onClick={() => void initialize()}
              type="button"
            >
              {state.kind === 'pending'
                ? 'Creating workspace…'
                : 'Create my workspace'}
            </button>
            {state.kind === 'pending' && (
              <p role="status">Confirming your workspace. Please wait…</p>
            )}
          </>
        )}
        {state.kind === 'success' && (
          <>
            <p role="status">
              Initialization confirmed. Your workspace is empty and ready for
              you.
            </p>
            <dl className="workspace-facts">
              <div>
                <dt>Candidate identity</dt>
                <dd>{state.workspace.candidate.id}</dd>
              </div>
              <div>
                <dt>Data</dt>
                <dd>Personal · no demo records</dd>
              </div>
            </dl>
            <button
              ref={action}
              className="button button-primary"
              onClick={() => setState({ ...state, kind: 'ready' })}
              type="button"
            >
              Open my workspace
            </button>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <p role="alert">{state.message}</p>
            {state.retry && (
              <button
                ref={action}
                className="button button-primary"
                onClick={() => {
                  if (state.retry === 'setup') void initialize();
                  else {
                    setState({ kind: 'checking' });
                    setAttempt((value) => value + 1);
                  }
                }}
                type="button"
              >
                {state.retry === 'setup' ? 'Retry setup' : 'Retry connection'}
              </button>
            )}
          </>
        )}
        <p className="workspace-setup-note">
          Returning users are recognized automatically. Demo mode uses a
          separate configured launch; switching modes never imports fictional
          records.
        </p>
      </section>
    </main>
  );
}
