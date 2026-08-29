import { Link } from 'react-router-dom';

import { Icon } from '../components/Icon.js';

export function NotFoundPage({
  title = 'This page could not be found',
  description = 'The route may have moved, or the address may be incomplete.',
}: {
  readonly title?: string;
  readonly description?: string;
}) {
  return (
    <div className="page not-found-page">
      <div className="not-found-visual" aria-hidden="true">
        <span>4</span>
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="36" />
          <path d="M25 65c16-10 34-10 50 0M38 40h.01M62 40h.01" />
        </svg>
        <span>4</span>
      </div>
      <p className="eyebrow">Route unavailable</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <div>
        <Link className="button button-primary" to="/today">
          Return to Today
        </Link>
        <Link className="button button-secondary" to="/opportunities">
          Browse opportunities <Icon name="arrow-right" size={16} />
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;
