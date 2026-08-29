import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import type { Opportunity } from '../../data/types.js';
import { OpportunitySummary } from './OpportunitySummary.js';

type SortValue = 'priority' | 'fit' | 'quality' | 'freshness';

export function OpportunitiesPage() {
  const { snapshot } = useProductData();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const eligibility = params.get('eligibility') ?? 'all';
  const sponsorship = params.get('sponsorship') ?? 'all';
  const workModel = params.get('workModel') ?? 'all';
  const sort = (params.get('sort') ?? 'priority') as SortValue;

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...snapshot.opportunities]
      .filter((opportunity) => {
        const searchable = [
          opportunity.role,
          opportunity.company.name,
          opportunity.location,
          ...opportunity.technologies,
        ]
          .join(' ')
          .toLowerCase();
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (eligibility === 'all' || opportunity.eligibility === eligibility) &&
          (sponsorship === 'all' || opportunity.sponsorship === sponsorship) &&
          (workModel === 'all' || opportunity.workModel === workModel)
        );
      })
      .sort((a, b) => compareOpportunities(a, b, sort));
  }, [
    eligibility,
    query,
    snapshot.opportunities,
    sort,
    sponsorship,
    workModel,
  ]);

  function updateParam(key: string, value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (
        !value ||
        value === 'all' ||
        (key === 'sort' && value === 'priority')
      ) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    });
  }

  const hasFilters =
    query.length > 0 ||
    eligibility !== 'all' ||
    sponsorship !== 'all' ||
    workModel !== 'all';

  return (
    <div className="page opportunities-page">
      <PageHeader
        description="Explore fictional development opportunities with Eligibility, Fit, and Quality kept deliberately separate."
        eyebrow="Opportunity intelligence"
        title="Opportunities"
      />

      <section
        aria-label="Opportunity search and filters"
        className="filter-shell"
      >
        <label className="search-field">
          <span className="sr-only">Search opportunities</span>
          <Icon name="search" />
          <input
            onChange={(event) => updateParam('q', event.target.value)}
            placeholder="Search role, company, location, or skill"
            type="search"
            value={query}
          />
        </label>
        <div className="filter-row">
          <label>
            <span>Eligibility</span>
            <select
              aria-label="Filter by Eligibility"
              onChange={(event) =>
                updateParam('eligibility', event.target.value)
              }
              value={eligibility}
            >
              <option value="all">All states</option>
              <option value="eligible">Eligible</option>
              <option value="investigate">Investigate</option>
              <option value="unknown">Unknown</option>
              <option value="ineligible">Blocked</option>
            </select>
          </label>
          <label>
            <span>Sponsorship</span>
            <select
              aria-label="Filter by sponsorship"
              onChange={(event) =>
                updateParam('sponsorship', event.target.value)
              }
              value={sponsorship}
            >
              <option value="all">Any policy</option>
              <option value="Available">Available</option>
              <option value="Unknown">Unknown</option>
              <option value="Conflicting">Conflicting</option>
              <option value="Unavailable">Unavailable</option>
            </select>
          </label>
          <label>
            <span>Work model</span>
            <select
              aria-label="Filter by work model"
              onChange={(event) => updateParam('workModel', event.target.value)}
              value={workModel}
            >
              <option value="all">Any model</option>
              <option value="Remote">Remote</option>
              <option value="Hybrid">Hybrid</option>
              <option value="On-site">On-site</option>
            </select>
          </label>
          <label className="sort-control">
            <span>Sort</span>
            <select
              aria-label="Sort opportunities"
              onChange={(event) => updateParam('sort', event.target.value)}
              value={sort}
            >
              <option value="priority">Decision priority</option>
              <option value="fit">Fit: strongest first</option>
              <option value="quality">Quality: strongest first</option>
              <option value="freshness">Freshness</option>
            </select>
          </label>
        </div>
      </section>

      <div className="result-toolbar">
        <p aria-live="polite">
          <strong>{results.length}</strong> of {snapshot.opportunities.length}{' '}
          opportunities
        </p>
        {hasFilters && (
          <button
            className="button button-quiet"
            onClick={() => setParams({})}
            type="button"
          >
            Clear filters
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <EmptyState
          description="Try broadening Eligibility or sponsorship filters. Unknown is kept separate, so it may be worth including investigation states."
          title="No opportunities match these filters"
        />
      ) : (
        <div className="opportunity-results">
          {results.map((opportunity) => (
            <OpportunitySummary
              key={opportunity.id}
              opportunity={opportunity}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function compareOpportunities(a: Opportunity, b: Opportunity, sort: SortValue) {
  if (sort === 'fit') return b.fitScore - a.fitScore;
  if (sort === 'quality') return b.qualityScore - a.qualityScore;
  if (sort === 'freshness') return b.updatedAt.localeCompare(a.updatedAt);
  const order = {
    'high-priority': 0,
    investigate: 1,
    consider: 2,
    'low-priority': 3,
    ineligible: 4,
  } as const;
  return order[a.decision] - order[b.decision];
}

export default OpportunitiesPage;
