import type { ReactNode } from 'react';

export function WorkspaceSectionHeader({
  id,
  title,
  description,
  meta,
  action,
}: {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly meta?: string;
  readonly action?: ReactNode;
}) {
  return (
    <header className="workspace-section-header">
      <div>
        {meta && <p className="workspace-section-meta">{meta}</p>}
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="workspace-section-action">{action}</div>}
    </header>
  );
}
