import type { SVGProps } from 'react';

export type IconName =
  | 'today'
  | 'opportunities'
  | 'applications'
  | 'profile'
  | 'search'
  | 'settings'
  | 'sun'
  | 'moon'
  | 'system'
  | 'menu'
  | 'close'
  | 'arrow-right'
  | 'arrow-left'
  | 'check'
  | 'blocker'
  | 'unknown'
  | 'warning'
  | 'spark'
  | 'clock'
  | 'location'
  | 'briefcase'
  | 'source'
  | 'chevron-down'
  | 'filter'
  | 'sort'
  | 'history'
  | 'evidence'
  | 'info';

const paths: Record<IconName, readonly string[]> = {
  today: ['M4 5.5h16v14H4z', 'M8 3v5M16 3v5M4 10h16'],
  opportunities: ['M4 7h16v12H4z', 'M9 7V5h6v2', 'M4 12h16', 'M10 12v2h4v-2'],
  applications: ['M6 3h12v18H6z', 'M9 8h6M9 12h6M9 16h4'],
  profile: [
    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    'M4.5 21a7.5 7.5 0 0 1 15 0',
  ],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm16 16 5 5'],
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M19 12h3M2 12h3M12 2v3M12 19v3M18.4 5.6l2.1-2.1M3.5 20.5l2.1-2.1M18.4 18.4l2.1 2.1M3.5 3.5l2.1 2.1',
  ],
  sun: [
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  ],
  moon: ['M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z'],
  system: ['M3 4h18v13H3z', 'M8 21h8M12 17v4'],
  menu: ['M4 7h16M4 12h16M4 17h16'],
  close: ['M5 5l14 14M19 5 5 19'],
  'arrow-right': ['M5 12h14M14 6l6 6-6 6'],
  'arrow-left': ['M19 12H5M10 6l-6 6 6 6'],
  check: ['m4 12 5 5L20 6'],
  blocker: ['M12 3 3 20h18L12 3Z', 'M12 9v4M12 17h.01'],
  unknown: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
    'M9.8 9a2.3 2.3 0 1 1 3.2 2.1c-.7.4-1 1-1 1.9M12 17h.01',
  ],
  warning: ['M12 3 3 20h18L12 3Z', 'M12 9v4M12 17h.01'],
  spark: ['m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 6v6l4 2'],
  location: [
    'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z',
    'M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  ],
  briefcase: ['M4 7h16v13H4z', 'M9 7V4h6v3', 'M4 12h16'],
  source: ['M12 3 3 8l9 5 9-5-9-5Z', 'm3 12 9 5 9-5M3 16l9 5 9-5'],
  'chevron-down': ['m6 9 6 6 6-6'],
  filter: ['M4 5h16l-6 7v6l-4 2v-8L4 5Z'],
  sort: ['M8 6h12M8 12h9M8 18h6M4 4v16'],
  history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5M12 7v5l3 2'],
  evidence: ['M6 3h9l3 3v15H6z', 'M14 3v4h4M9 12h6M9 16h6'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 11v6M12 7h.01'],
};

export function Icon({
  name,
  size = 18,
  ...props
}: {
  readonly name: IconName;
  readonly size?: number;
} & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {paths[name].map((path) => (
        <path
          d={path}
          key={path}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
      ))}
    </svg>
  );
}
