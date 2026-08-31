import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

import { Icon } from './components/Icon.js';

export function RouteError() {
  const error: unknown = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'An unexpected route error occurred.';

  return (
    <main className="route-error-page">
      <section role="alert">
        <Icon name="warning" size={28} />
        <p className="eyebrow">Application error</p>
        <h1>Unable to render this view</h1>
        <p>{message}</p>
        <Link className="button button-primary" to="/overview">
          Return to Overview
        </Link>
      </section>
    </main>
  );
}
