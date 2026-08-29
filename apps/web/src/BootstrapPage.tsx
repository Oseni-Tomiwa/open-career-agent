import { useEffect, useState } from 'react';

import { getBootstrapStatus, openApiUrl, type BootstrapStatus } from './api.js';

type StatusState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: BootstrapStatus }
  | { readonly kind: 'error'; readonly message: string };

export function BootstrapPage() {
  const [state, setState] = useState<StatusState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;

    getBootstrapStatus()
      .then((value) => {
        if (active) setState({ kind: 'ready', value });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            kind: 'error',
            message:
              error instanceof Error ? error.message : 'Status is unavailable.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="bootstrap-shell">
      <section className="bootstrap-panel" aria-labelledby="page-title">
        <p className="eyebrow">Technical bootstrap</p>
        <h1 id="page-title">Open Career Agent development environment</h1>
        <p className="intro">
          This surface verifies the application foundation. It is not the
          product dashboard or its design direction.
        </p>

        <div className="status-region" aria-live="polite">
          {state.kind === 'loading' && <p>Checking local services…</p>}
          {state.kind === 'error' && (
            <div className="notice notice-error" role="status">
              <strong>Services unavailable</strong>
              <span>{state.message}</span>
            </div>
          )}
          {state.kind === 'ready' && (
            <dl className="status-list">
              <div>
                <dt>API process</dt>
                <dd data-state="success">{state.value.health.status}</dd>
              </div>
              <div>
                <dt>SQLite readiness</dt>
                <dd data-state="success">
                  {state.value.readiness.resources.database}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <a className="contract-link" href={openApiUrl()}>
          View generated OpenAPI contract
        </a>
      </section>
    </main>
  );
}
