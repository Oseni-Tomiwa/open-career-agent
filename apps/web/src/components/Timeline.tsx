import { Icon } from './Icon.js';

export interface TimelineItem {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly detail: string;
  readonly meta?: string;
}

export function Timeline({
  items,
}: {
  readonly items: readonly TimelineItem[];
}) {
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.id}>
          <span className="timeline-marker">
            <Icon name="history" size={15} />
          </span>
          <div>
            <div className="timeline-heading">
              <strong>{item.title}</strong>
              <time>{item.date}</time>
            </div>
            <p>{item.detail}</p>
            {item.meta && <span className="timeline-meta">{item.meta}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
