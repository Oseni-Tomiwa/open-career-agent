import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

export function RouteError() {
  const error: unknown = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'An unexpected route error occurred.';

  return (
    <main className="bootstrap-shell">
      <section className="bootstrap-panel" role="alert">
        <p className="eyebrow">Development bootstrap</p>
        <h1>Unable to render this route</h1>
        <p className="intro">{message}</p>
        <a className="contract-link" href="/">
          Return to bootstrap status
        </a>
      </section>
    </main>
  );
}
