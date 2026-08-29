import type { CSSProperties } from 'react';

import type { Company } from '../data/types.js';

export function CompanyMark({
  company,
  size = 'medium',
}: {
  readonly company: Company;
  readonly size?: 'small' | 'medium' | 'large';
}) {
  return (
    <span
      aria-label={`${company.name} company mark`}
      className={`company-mark company-mark-${size}`}
      style={{ '--company-color': company.color } as CSSProperties}
      title={company.name}
    >
      {company.mark === 'none' ? (
        <span>{company.initials}</span>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 40 40">
          {company.mark === 'orbit' && (
            <>
              <circle cx="20" cy="20" r="5" />
              <ellipse cx="20" cy="20" rx="14" ry="8" />
              <circle cx="33" cy="18" r="2.5" className="company-mark-fill" />
            </>
          )}
          {company.mark === 'bridge' && (
            <>
              <path d="M8 27c2-10 7-15 12-15s10 5 12 15" />
              <path d="M10 27h20M15 25V15M25 25V15" />
            </>
          )}
          {company.mark === 'spark' && (
            <path d="m20 6 3.5 10.5L34 20l-10.5 3.5L20 34l-3.5-10.5L6 20l10.5-3.5L20 6Z" />
          )}
          {company.mark === 'grid' && (
            <>
              <rect x="8" y="8" width="10" height="10" rx="2" />
              <rect x="22" y="8" width="10" height="10" rx="2" />
              <rect x="8" y="22" width="10" height="10" rx="2" />
              <rect x="22" y="22" width="10" height="10" rx="2" />
            </>
          )}
          {company.mark === 'wave' && (
            <>
              <path d="M6 15c5-6 9-6 14 0s9 6 14 0" />
              <path d="M6 25c5-6 9-6 14 0s9 6 14 0" />
            </>
          )}
        </svg>
      )}
    </span>
  );
}
