import { Link } from 'react-router-dom';

export function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: { readonly label: string; readonly to: string };
}) {
  return (
    <section className="empty-state">
      <svg
        aria-hidden="true"
        className="empty-illustration"
        viewBox="0 0 180 120"
      >
        <path d="M25 88c25-45 44-51 66-16 17-33 39-39 64 7" />
        <circle cx="58" cy="48" r="16" />
        <path d="m51 48 5 5 10-12M104 32h42M104 47h31M104 62h36" />
      </svg>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && (
        <Link className="button button-secondary" to={action.to}>
          {action.label}
        </Link>
      )}
    </section>
  );
}
